import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import {
  Memo,
  indexBooleans,
  indexNumber,
  memoize,
} from "../../engine/language/memo";
import { Input } from "../../engine/io/controller";
import {
  DebugTextureFormat,
  DebugTextureRenderer,
  DebugTextureSelect,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import {
  DeferredLightingLightModel,
  DeferredLightingRenderer,
} from "../../engine/graphic/webgl/renderers/deferred-lighting";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { orbitatePosition, rotateDirection } from "../move";
import { Camera } from "../view";
import { DeferredLightingScene } from "../../engine/graphic/webgl/renderers/deferred-lighting";
import {
  DirectionalLight,
  PointLight,
} from "../../engine/graphic/webgl/renderers/snippets/light";
import { brightColor } from "../../engine/graphic/color";
import { GlModel, loadModel } from "../../engine/graphic/webgl/model";

/*
 ** What changed?
 */

const configuration = {
  nbDirectionals: [".0", "1", "2", "5"],
  nbPoints: ["0", ".20", "100", "500", "2000"],
  animate: true,
  ambient: true,
  diffuse: true,
  specular: true,
  debugMode: [
    ".None",
    "Depth",
    "Normal",
    "Shininess",
    "Gloss",
    "Diffuse light",
    "Specular light",
  ],
};

const debugConfigurations = [
  {
    select: DebugTextureSelect.Red,
    format: DebugTextureFormat.Depth,
  },
  {
    select: DebugTextureSelect.RedGreen,
    format: DebugTextureFormat.Spheremap,
  },
  {
    select: DebugTextureSelect.Blue,
    format: DebugTextureFormat.Monochrome,
  },
  {
    select: DebugTextureSelect.Alpha,
    format: DebugTextureFormat.Monochrome,
  },
  {
    select: DebugTextureSelect.RedGreenBlue,
    format: DebugTextureFormat.Logarithm,
  },
  {
    select: DebugTextureSelect.Alpha,
    format: DebugTextureFormat.Logarithm,
  },
];

const directionalLightParameters = [
  { count: 0 },
  { count: 1 },
  { count: 2 },
  { count: 5 },
];

const pointLightParameters = [
  { count: 0, radius: 0 },
  { count: 20, radius: 4 },
  { count: 100, radius: 2 },
  { count: 500, radius: 1 },
  { count: 2000, radius: 1 },
];

type ApplicationState = {
  camera: Camera;
  debugRendererMemo: Memo<number, DebugTextureRenderer>;
  directionalLights: DirectionalLight[];
  input: Input;
  models: {
    cube: GlModel;
    directionalLight: GlModel;
    ground: GlModel;
    pointLight: GlModel;
  };
  move: number;
  pointLights: PointLight[];
  projectionMatrix: Matrix4;
  sceneRendererMemo: Memo<boolean[], DeferredLightingRenderer>;
  target: GlTarget;
  tweak: Tweak<typeof configuration>;
};

const getOptions = (tweak: Tweak<typeof configuration>) => [
  tweak.ambient !== 0,
  tweak.diffuse !== 0,
  tweak.specular !== 0,
];

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);
    const tweak = configure(configuration);

    // Load meshes
    const cubeModel = await loadModelFromJson("model/cube/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.4, y: 0.4, z: 0.4 }]),
    });
    const directionalLightModel = await loadModelFromJson(
      "model/sphere/mesh.json",
      {
        transform: Matrix4.fromCustom(["scale", { x: 0.5, y: 0.5, z: 0.5 }]),
      }
    );
    const groundModel = await loadModelFromJson("model/ground/mesh.json");
    const pointLightModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.1, y: 0.1, z: 0.1 }]),
    });
    const target = new GlTarget(gl, screen.getWidth(), screen.getHeight());

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      debugRendererMemo: memoize(
        indexNumber,
        (index) =>
          new DebugTextureRenderer(runtime, target, {
            format: debugConfigurations[index].format,
            select: debugConfigurations[index].select,
            zNear: 0.1,
            zFar: 100,
          })
      ),
      directionalLights: range(10).map((i) => ({
        color: brightColor(i),
        direction: Vector3.zero,
        shadow: false,
      })),
      input: new Input(screen.canvas),
      models: {
        cube: loadModel(gl, cubeModel),
        directionalLight: loadModel(gl, directionalLightModel),
        ground: loadModel(gl, groundModel),
        pointLight: loadModel(gl, pointLightModel),
      },
      move: 0,
      pointLights: range(2000).map((i) => ({
        color: brightColor(i),
        position: Vector3.zero,
        radius: 0,
      })),
      projectionMatrix: Matrix4.identity,
      sceneRendererMemo: memoize(
        indexBooleans,
        (flags) =>
          new DeferredLightingRenderer(runtime, target, {
            lightModel: DeferredLightingLightModel.Phong,
            lightModelPhongNoAmbient: !flags[0],
            lightModelPhongNoDiffuse: !flags[1],
            lightModelPhongNoSpecular: !flags[2],
            useHeightMap: true,
            useNormalMap: true,
          })
      ),
      target,
      tweak,
    };
  },

  render(state) {
    const {
      camera,
      debugRendererMemo,
      models,
      sceneRendererMemo,
      target,
      tweak,
    } = state;

    // Pick active lights
    const directionalLights = state.directionalLights.slice(
      0,
      directionalLightParameters[tweak.nbDirectionals].count
    );
    const pointLights = state.pointLights.slice(
      0,
      pointLightParameters[tweak.nbPoints].count
    );

    // Draw scene
    const sceneRenderer = sceneRendererMemo.get(getOptions(tweak));
    const scene: DeferredLightingScene = {
      ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
      directionalLights,
      objects: [
        {
          matrix: Matrix4.fromCustom([
            "translate",
            {
              x: 0,
              y: -1.5,
              z: 0,
            },
          ]),
          model: models.ground,
        },
      ]
        .concat(
          range(16).map((i) => ({
            matrix: Matrix4.fromCustom([
              "translate",
              {
                x: ((i % 4) - 1.5) * 2,
                y: 0,
                z: (Math.floor(i / 4) - 1.5) * 2,
              },
            ]),
            model: models.cube,
            state: undefined,
          }))
        )
        .concat(
          directionalLights.map((light) => {
            const direction = Vector3.fromObject(light.direction);

            direction.normalize();
            direction.scale(10);

            return {
              matrix: Matrix4.fromCustom(["translate", direction]),
              model: models.directionalLight,
              state: undefined,
            };
          })
        )
        .concat(
          pointLights.map((light) => ({
            matrix: Matrix4.fromCustom(["translate", light.position]),
            model: models.pointLight,
            state: undefined,
          }))
        ),
      pointLights,
      projectionMatrix: state.projectionMatrix,
      viewMatrix: Matrix4.fromCustom(
        ["translate", camera.position],
        ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
        ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
      ),
    };

    target.clear(0);

    sceneRenderer.render(scene);

    // Draw debug
    if (tweak.debugMode !== 0) {
      const debugRenderer = debugRendererMemo.get(tweak.debugMode - 1);

      debugRenderer.render(
        [
          sceneRenderer.depthBuffer,
          sceneRenderer.normalAndGlossinessBuffer,
          sceneRenderer.normalAndGlossinessBuffer,
          sceneRenderer.normalAndGlossinessBuffer,
          sceneRenderer.lightBuffer,
          sceneRenderer.lightBuffer,
        ][tweak.debugMode - 1]
      );
    }
  },

  resize(state, screen) {
    if (state.tweak.debugMode !== 0) {
      state.debugRendererMemo
        .get(state.tweak.debugMode - 1)
        .resize(screen.getWidth(), screen.getHeight());
    }

    state.sceneRendererMemo
      .get(getOptions(state.tweak))
      .resize(screen.getWidth(), screen.getHeight());

    state.projectionMatrix = Matrix4.fromPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );

    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    const { camera, directionalLights, input, pointLights, tweak } = state;
    const pointLightRadius = pointLightParameters[tweak.nbPoints].radius;

    // Update light positions
    if (tweak.animate) {
      state.move += dt * 0.0002;
    }

    for (let i = 0; i < directionalLights.length; ++i) {
      directionalLights[i].direction = rotateDirection(state.move * 5, i);
    }

    for (let i = 0; i < pointLights.length; ++i) {
      pointLights[i].position = orbitatePosition(state.move, i, 1, 5);
      pointLights[i].radius = pointLightRadius;
    }

    // Move camera
    camera.move(input, dt);
  },
};

const process = declare("Deferred lighting", WebGLScreen, application);

export { process };
