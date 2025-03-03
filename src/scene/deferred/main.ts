import {
  type Application,
  type Tweak,
  createCheckbox,
  createSelect,
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
import { loadMeshFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { Mover, createCircleMover, createOrbitMover } from "../move";
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
import { Camera, createOrbitCamera } from "../../engine/camera";

/*
 ** What changed?
 */

const configuration = {
  technique: createSelect(
    "technique",
    ["Deferred shading", "Deferred lighting"],
    0
  ),
  nbDirectionalLights: createSelect("dLights", ["0", "1", "2", "5"], 0),
  nbPointLights: createSelect("pLights", ["0", "20", "100", "500", "2000"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightDiffuse: createCheckbox("diffuse", true),
  lightSpecular: createCheckbox("specular", true),
  debugMode: createSelect(
    "debug",
    [
      "None",
      "Depth",
      "Diffuse (DS)",
      "Normal",
      "Shininess",
      "Glossiness",
      "Diffuse light (DL)",
      "Specular light (DL)",
    ],
    0
  ),
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
    channel: DebugTextureChannel.Blue,
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
};

const getOptions = (tweak: Tweak<typeof configuration>) => [
  tweak.lightAmbient,
  tweak.lightDiffuse,
  tweak.lightSpecular,
];

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration
> = {
  async prepare(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(gl);

    // Load meshes
    const cubeModel = await loadMeshFromJson("model/cube/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.4, y: 0.4, z: 0.4 },
      ]),
    });
    const directionalLightModel = await loadMeshFromJson(
      "model/sphere/mesh.json",
      {
        transform: Matrix4.fromSource(Matrix4.identity, [
          "scale",
          { x: 0.5, y: 0.5, z: 0.5 },
        ]),
      }
    );
    const groundModel = await loadMeshFromJson("model/ground/mesh.json");
    const pointLightModel = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.1, y: 0.1, z: 0.1 },
      ]),
    });
    const target = new GlTarget(gl, screen.getSize());

    // Create state
    return {
      camera: createOrbitCamera(input, { x: 0, y: 0, z: -5 }, Vector3.zero),
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
                  renderer.diffuseAndShininessBuffer,
                  renderer.normalAndSpecularBuffer,
                  renderer.diffuseAndShininessBuffer,
                  renderer.normalAndSpecularBuffer,
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
                  renderer.normalAndGlossBuffer,
                  renderer.normalAndGlossBuffer,
                  renderer.normalAndGlossBuffer,
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
      viewMatrix: Matrix4.fromIdentity(),
    };
  },

  render(state, tweak) {
    const {
      camera,
      debugRendererMemo,
      models,
      projectionMatrix,
      sceneRendererMemo,
      target,
    } = state;

    // Pick active lights
    const directionalLights = state.directionalLights.slice(
      0,
      directionalLightParameters[tweak.nbDirectionalLights].count
    );
    const pointLights = state.pointLights.slice(
      0,
      pointLightParameters[tweak.nbPointLights].count
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
          matrix: Matrix4.fromSource(Matrix4.identity, [
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
            matrix: Matrix4.fromSource(Matrix4.identity, [
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
            const direction = Vector3.fromSource(
              light.direction,
              ["normalize"],
              ["scale", 10]
            );

            return {
              matrix: Matrix4.fromSource(Matrix4.identity, [
                "translate",
                direction,
              ]),
              model: models.directionalLight,
              state: undefined,
            };
          })
        )
        .concat(
          pointLights.map((light) => ({
            matrix: Matrix4.fromSource(Matrix4.identity, [
              "translate",
              light.position,
            ]),
            model: models.pointLight,
            state: undefined,
          }))
        ),
      pointLights,
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
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

  resize(state, tweak, size) {
    if (tweak.debugMode !== 0) {
      state.debugRendererMemo.get(tweak.debugMode - 1).resize(size);
    }

    state.sceneRendererMemo
      .get([tweak.technique, getOptions(tweak)])
      .renderer.resize(size);

    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);

    state.target.resize(size);
  },

  update(state, tweak, dt) {
    const { camera, directionalLights, pointLights, time } = state;
    const pointLightRadius = pointLightParameters[tweak.nbPointLights].radius;

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
    camera.update(dt);

    state.time += tweak.move ? dt : 0;
  },
};

const process = declare(
  "Deferred rendering",
  WebGLScreen,
  configuration,
  application
);

export { process };
