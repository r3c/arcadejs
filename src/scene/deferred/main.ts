import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import {
  Memo,
  createBooleansIndexer,
  createCompositeIndexer,
  createNumberIndexer,
  memoize,
} from "../../engine/language/memo";
import { Input } from "../../engine/io/controller";
import {
  DebugTextureEncoding,
  DebugTextureRenderer,
  DebugTextureChannel,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import {
  DeferredLightingLightModel,
  DeferredLightingRenderer,
} from "../../engine/graphic/webgl/renderers/deferred-lighting";
import { Renderer, WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { Mover, createCircleMover, createOrbitMover } from "../move";
import { Camera } from "../view";
import { DeferredLightingScene } from "../../engine/graphic/webgl/renderers/deferred-lighting";
import {
  DirectionalLight,
  PointLight,
} from "../../engine/graphic/webgl/shaders/light";
import { brightColor } from "../../engine/graphic/color";
import { GlModel, createModel } from "../../engine/graphic/webgl/model";
import { GlTexture } from "../../engine/graphic/webgl/texture";
import {
  DeferredShadingLightModel,
  DeferredShadingRenderer,
  DeferredShadingScene,
} from "../../engine/graphic/webgl/renderers/deferred-shading";

/*
 ** What changed?
 */

const configuration = {
  technique: ["Deferred shading", "Deferred lighting"],
  nbDirectionals: [".0", "1", "2", "5"],
  nbPoints: ["0", ".20", "100", "500", "2000"],
  animate: true,
  ambient: true,
  diffuse: true,
  specular: true,
  debugMode: [
    ".None",
    "Depth",
    "Albedo (DS only)",
    "Normal",
    "Shininess",
    "Glossiness",
    "Diffuse light (DL only)",
    "Specular light (DL only)",
  ],
};

const debugConfigurations = [
  {
    channel: DebugTextureChannel.Red,
    encoding: DebugTextureEncoding.Depth,
  },
  {
    channel: DebugTextureChannel.RedGreenBlue,
    encoding: DebugTextureEncoding.LinearRGB,
  },
  {
    channel: DebugTextureChannel.RedGreen,
    encoding: DebugTextureEncoding.Spheremap,
  },
  {
    channel: DebugTextureChannel.Blue,
    encoding: DebugTextureEncoding.Monochrome,
  },
  {
    channel: DebugTextureChannel.Alpha,
    encoding: DebugTextureEncoding.Monochrome,
  },
  {
    channel: DebugTextureChannel.RedGreenBlue,
    encoding: DebugTextureEncoding.Log2RGB,
  },
  {
    channel: DebugTextureChannel.Alpha,
    encoding: DebugTextureEncoding.Log2RGB,
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

type Scene = DeferredLightingScene & DeferredShadingScene;

type SceneDirectionalLight = DirectionalLight & {
  mover: Mover;
  direction: MutableVector3;
};

type ScenePointLight = PointLight & {
  mover: Mover;
  position: MutableVector3;
};

type SceneRenderer = {
  renderer: Renderer<Scene>;
  textures: (GlTexture | undefined)[];
};

type ApplicationState = {
  camera: Camera;
  debugRendererMemo: Memo<number, DebugTextureRenderer>;
  directionalLights: SceneDirectionalLight[];
  input: Input;
  models: {
    cube: GlModel;
    directionalLight: GlModel;
    ground: GlModel;
    pointLight: GlModel;
  };
  time: number;
  pointLights: ScenePointLight[];
  projectionMatrix: Matrix4;
  sceneRendererMemo: Memo<[number, boolean[]], SceneRenderer>;
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
    const target = new GlTarget(gl, screen.getSize());

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      debugRendererMemo: memoize(
        createNumberIndexer(0, 6),
        (index) =>
          new DebugTextureRenderer(runtime, target, {
            channel: debugConfigurations[index].channel,
            encoding: debugConfigurations[index].encoding,
            zNear: 0.1,
            zFar: 100,
          })
      ),
      directionalLights: range(10).map((i) => ({
        color: brightColor(i),
        direction: Vector3.fromZero(),
        mover: createCircleMover(i),
        shadow: false,
      })),
      input: new Input(screen.canvas),
      models: {
        cube: createModel(gl, cubeModel),
        directionalLight: createModel(gl, directionalLightModel),
        ground: createModel(gl, groundModel),
        pointLight: createModel(gl, pointLightModel),
      },
      pointLights: range(2000).map((i) => ({
        color: brightColor(i),
        mover: createOrbitMover(i, 1, 5, 1),
        position: Vector3.fromZero(),
        radius: 0,
      })),
      projectionMatrix: Matrix4.identity,
      sceneRendererMemo: memoize(
        createCompositeIndexer(
          createNumberIndexer(0, 2),
          createBooleansIndexer(3)
        ),
        ([technique, flags]) => {
          switch (technique) {
            case 0:
            default: {
              const renderer = new DeferredShadingRenderer(runtime, target, {
                lightModel: DeferredShadingLightModel.Phong,
                lightModelPhongNoAmbient: !flags[0],
                lightModelPhongNoDiffuse: !flags[1],
                lightModelPhongNoSpecular: !flags[2],
              });

              return {
                dispose: () => renderer.dispose(),
                renderer,
                textures: [
                  renderer.depthBuffer,
                  renderer.albedoAndShininessBuffer,
                  renderer.normalAndGlossinessBuffer,
                  renderer.albedoAndShininessBuffer,
                  renderer.normalAndGlossinessBuffer,
                  undefined,
                  undefined,
                ],
              };
            }

            case 1: {
              const renderer = new DeferredLightingRenderer(runtime, target, {
                lightModel: DeferredLightingLightModel.Phong,
                lightModelPhongNoAmbient: !flags[0],
                lightModelPhongNoDiffuse: !flags[1],
                lightModelPhongNoSpecular: !flags[2],
              });

              return {
                dispose: () => renderer.dispose(),
                renderer,
                textures: [
                  renderer.depthBuffer,
                  undefined,
                  renderer.normalAndGlossinessBuffer,
                  renderer.normalAndGlossinessBuffer,
                  renderer.normalAndGlossinessBuffer,
                  renderer.lightBuffer,
                  renderer.lightBuffer,
                ],
              };
            }
          }
        }
      ),
      target,
      time: 0,
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
    const { renderer, textures } = sceneRendererMemo.get([
      tweak.technique,
      getOptions(tweak),
    ]);

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

    renderer.render(scene);

    // Draw debug
    const debugTexture =
      tweak.debugMode !== 0 ? textures[tweak.debugMode - 1] : undefined;

    if (debugTexture !== undefined) {
      const debugRenderer = debugRendererMemo.get(tweak.debugMode - 1);

      debugRenderer.render(debugTexture);
    }
  },

  resize(state, size) {
    if (state.tweak.debugMode !== 0) {
      state.debugRendererMemo.get(state.tweak.debugMode - 1).resize(size);
    }

    state.sceneRendererMemo
      .get([state.tweak.technique, getOptions(state.tweak)])
      .renderer.resize(size);

    state.projectionMatrix = Matrix4.fromPerspective(
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100
    );

    state.target.resize(size);
  },

  update(state, dt) {
    const { camera, directionalLights, input, pointLights, time, tweak } =
      state;
    const pointLightRadius = pointLightParameters[tweak.nbPoints].radius;

    for (let i = 0; i < directionalLights.length; ++i) {
      const { direction, mover } = directionalLights[i];

      direction.set(mover(Vector3.zero, time * 0.001));
    }

    for (let i = 0; i < pointLights.length; ++i) {
      const { mover, position } = pointLights[i];

      position.set(mover(Vector3.zero, time * 0.0002));

      pointLights[i].radius = pointLightRadius;
    }

    // Move camera
    camera.move(input, dt);

    state.time += tweak.animate ? dt : 0;
  },
};

const process = declare("Deferred rendering", WebGLScreen, application);

export { process };