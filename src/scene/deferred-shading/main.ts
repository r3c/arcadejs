import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import * as bitfield from "../bitfield";
import * as color from "../color";
import { Input } from "../../engine/io/controller";
import {
  DebugTextureFormat,
  DebugTextureRenderer,
  DebugTextureSelect,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import {
  DeferredShadingLightModel,
  DeferredShadingRenderer,
} from "../../engine/graphic/webgl/renderers/deferred-shading";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/functional";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import {
  GlDirectionalLight,
  GlModel,
  GlPointLight,
  GlScene,
  GlTarget,
  createRuntime,
  loadModel,
} from "../../engine/graphic/webgl";
import { orbitatePosition, rotateDirection } from "../move";
import { Camera } from "../view";
import { SceneState } from "../../engine/graphic/webgl/renderers/deferred-shading";

/*
 ** What changed?
 */

const configuration = {
  nbDirectionals: [".0", "1", "2", "5"],
  nbPoints: ["0", ".50", "100", "250", "500"],
  animate: true,
  ambient: true,
  diffuse: true,
  specular: true,
  debugMode: [".None", "Depth", "Albedo", "Normal", "Shininess", "Gloss"],
};

type ApplicationState = {
  camera: Camera;
  directionalLights: GlDirectionalLight[];
  input: Input;
  models: {
    cube: GlModel;
    directionalLight: GlModel;
    ground: GlModel;
    pointLight: GlModel;
  };
  move: number;
  pointLights: GlPointLight[];
  projectionMatrix: Matrix4;
  renderers: {
    debug: DebugTextureRenderer[];
    scene: DeferredShadingRenderer[];
  };
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

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      directionalLights: range(10, (i) => ({
        color: color.createBright(i),
        direction: Vector3.zero,
        shadow: false,
      })),
      input: new Input(screen.canvas),
      models: {
        cube: loadModel(runtime, cubeModel),
        directionalLight: loadModel(runtime, directionalLightModel),
        ground: loadModel(runtime, groundModel),
        pointLight: loadModel(runtime, pointLightModel),
      },
      move: 0,
      pointLights: range(500, (i) => ({
        color: color.createBright(i),
        position: Vector3.zero,
        radius: 2,
      })),
      projectionMatrix: Matrix4.identity,
      renderers: {
        debug: [
          {
            select: DebugTextureSelect.Red,
            format: DebugTextureFormat.Depth,
          },
          {
            select: DebugTextureSelect.RedGreenBlue,
            format: DebugTextureFormat.Colorful,
          },
          {
            select: DebugTextureSelect.RedGreen,
            format: DebugTextureFormat.Spheremap,
          },
          {
            select: DebugTextureSelect.Alpha,
            format: DebugTextureFormat.Monochrome,
          },
          {
            select: DebugTextureSelect.Alpha,
            format: DebugTextureFormat.Monochrome,
          },
        ].map(
          (configuration) =>
            new DebugTextureRenderer(runtime, {
              format: configuration.format,
              select: configuration.select,
              zNear: 0.1,
              zFar: 100,
            })
        ),
        scene: bitfield.enumerate(getOptions(tweak)).map(
          (flags) =>
            new DeferredShadingRenderer(runtime, {
              lightModel: DeferredShadingLightModel.Phong,
              lightModelPhongNoAmbient: !flags[0],
              lightModelPhongNoDiffuse: !flags[1],
              lightModelPhongNoSpecular: !flags[2],
              useHeightMap: true,
              useNormalMap: true,
            })
        ),
      },
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
      tweak,
    };
  },

  render(state) {
    const { camera, models, renderers, target, tweak } = state;

    // Pick active lights
    const directionalLights = state.directionalLights.slice(
      0,
      [0, 1, 2, 5][tweak.nbDirectionals] || 0
    );
    const pointLights = state.pointLights.slice(
      0,
      [0, 50, 100, 250, 500][tweak.nbPoints] || 0
    );

    // Draw scene
    const deferredRenderer = renderers.scene[bitfield.index(getOptions(tweak))];
    const deferredScene: GlScene<SceneState, undefined> = {
      state: {
        ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
        directionalLights,
        pointLights,
        projectionMatrix: state.projectionMatrix,
        viewMatrix: Matrix4.fromCustom(
          ["translate", camera.position],
          ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
          ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
        ),
      },
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
          state: undefined,
        },
      ]
        .concat(
          range(16, (i) => ({
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
    };

    target.clear(0);

    deferredRenderer.render(target, deferredScene);

    // Draw debug
    if (tweak.debugMode !== 0) {
      const debugRenderer = renderers.debug[tweak.debugMode - 1];
      const debugScene = DebugTextureRenderer.createScene(
        [
          deferredRenderer.depthBuffer,
          deferredRenderer.albedoAndShininessBuffer,
          deferredRenderer.normalAndGlossinessBuffer,
          deferredRenderer.albedoAndShininessBuffer,
          deferredRenderer.normalAndGlossinessBuffer,
        ][tweak.debugMode - 1]
      );

      debugRenderer.render(target, debugScene);
    }
  },

  resize(state, screen) {
    for (const renderer of state.renderers.debug)
      renderer.resize(screen.getWidth(), screen.getHeight());

    for (const renderer of state.renderers.scene)
      renderer.resize(screen.getWidth(), screen.getHeight());

    state.projectionMatrix = Matrix4.fromPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );

    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    // Update light positions
    if (state.tweak.animate) {
      state.move += dt * 0.0002;
    }

    for (let i = 0; i < state.directionalLights.length; ++i) {
      state.directionalLights[i].direction = rotateDirection(state.move * 5, i);
    }

    for (let i = 0; i < state.pointLights.length; ++i) {
      state.pointLights[i].position = orbitatePosition(state.move, i, 1, 5);
    }

    // Move camera
    state.camera.move(state.input);
  },
};

const process = declare("Deferred shading", WebGLScreen, application);

export { process };
