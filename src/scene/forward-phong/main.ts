import {
  type Application,
  type Tweak,
  createCheckbox,
  createSelect,
  declare,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { Renderer, WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingLightModel,
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/iterable";
import { loadMeshFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { Mover, createCircleMover, createOrbitMover } from "../move";
import { Camera } from "../view";
import {
  Memo,
  createBooleansIndexer,
  memoize,
} from "../../engine/language/memo";
import { GlModel, createModel } from "../../engine/graphic/webgl/model";
import {
  DebugTextureRenderer,
  DebugTextureEncoding,
  DebugTextureChannel,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import { GlTexture } from "../../engine/graphic/webgl/texture";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const configuration = {
  nbDirectionalLights: createSelect("dLights", ["0", "1", "2", "3"], 0),
  nbPointLights: createSelect("pLights", ["0", "1", "2", "3"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightDiffuse: createCheckbox("diffuse", true),
  lightSpecular: createCheckbox("specular", true),
  useNormalMap: createCheckbox("nMap", true),
  useHeightMap: createCheckbox("hMap", true),
  debugMode: createSelect("debug", ["None", "Shadow"], 0),
};

type ApplicationState = {
  camera: Camera;
  debugRenderer: Renderer<GlTexture>;
  directionalLights: { mover: Mover; direction: MutableVector3 }[];
  input: Input;
  models: {
    cube: GlModel;
    ground: GlModel;
    light: GlModel;
  };
  time: number;
  pointLights: { mover: Mover; position: MutableVector3 }[];
  projectionMatrix: Matrix4;
  rendererMemo: Memo<boolean[], ForwardLightingRenderer>;
  target: GlTarget;
};

const getOptions = (tweak: Tweak<typeof configuration>) => [
  tweak.lightAmbient,
  tweak.lightDiffuse,
  tweak.lightSpecular,
  tweak.useHeightMap,
  tweak.useNormalMap,
];

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration
> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(screen.context);
    const target = new GlTarget(gl, screen.getSize());

    // Load models
    const cubeModel = await loadMeshFromJson("model/cube/mesh.json");
    const groundModel = await loadMeshFromJson("model/ground/mesh.json");
    const lightModel = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.2, y: 0.2, z: 0.2 },
      ]),
    });

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      debugRenderer: new DebugTextureRenderer(runtime, target, {
        encoding: DebugTextureEncoding.Monochrome,
        channel: DebugTextureChannel.Red,
        zNear: 0.1,
        zFar: 100,
      }),
      directionalLights: range(3).map((i) => ({
        direction: Vector3.fromZero(),
        mover: createCircleMover(i),
      })),
      input: new Input(screen.canvas),
      models: {
        cube: createModel(gl, cubeModel),
        ground: createModel(gl, groundModel),
        light: createModel(gl, lightModel),
      },
      pointLights: range(3).map((i) => ({
        mover: createOrbitMover(i, 2, 2, 1),
        position: Vector3.fromZero(),
      })),
      projectionMatrix: Matrix4.identity,
      rendererMemo: memoize(
        createBooleansIndexer(5),
        (flags) =>
          new ForwardLightingRenderer(runtime, target, {
            maxDirectionalLights: 3,
            maxPointLights: 3,
            lightModel: ForwardLightingLightModel.Phong,
            lightModelPhongNoAmbient: !flags[0],
            lightModelPhongNoDiffuse: !flags[1],
            lightModelPhongNoSpecular: !flags[2],
            noHeightMap: !flags[3],
            noNormalMap: !flags[4],
          })
      ),
      target,
      time: 0,
    };
  },

  render(state, tweak) {
    const {
      camera,
      debugRenderer,
      directionalLights,
      models,
      pointLights,
      projectionMatrix,
      rendererMemo,
      target,
    } = state;

    // Clear screen
    target.clear(0);

    // Forward pass
    const sceneRenderer = rendererMemo.get(getOptions(tweak));
    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
      directionalLights: directionalLights
        .slice(0, tweak.nbDirectionalLights)
        .map(({ direction }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          direction,
          shadow: true,
        })),
      objects: [
        {
          matrix: Matrix4.identity,
          model: models.cube,
          noShadow: false,
        },
        {
          matrix: Matrix4.fromSource(Matrix4.identity, [
            "translate",
            { x: 0, y: -1.5, z: 0 },
          ]),
          model: models.ground,
          noShadow: false,
        },
      ]
        .concat(
          pointLights.slice(0, tweak.nbPointLights).map(({ position }) => ({
            matrix: Matrix4.fromSource(Matrix4.identity, [
              "translate",
              position,
            ]),
            model: models.light,
            noShadow: true,
          }))
        )
        .concat(
          directionalLights
            .slice(0, tweak.nbDirectionalLights)
            .map(({ direction }) => ({
              matrix: Matrix4.fromSource(Matrix4.identity, [
                "translate",
                direction,
              ]),
              model: models.light,
              noShadow: true,
            }))
        ),
      pointLights: pointLights
        .slice(0, tweak.nbPointLights)
        .map(({ position }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          position,
          radius: 5,
        })),
      projectionMatrix,
      viewMatrix: Matrix4.fromSource(
        Matrix4.identity,
        ["translate", camera.position],
        ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
        ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
      ),
    };

    sceneRenderer.render(scene);

    // Draw texture debug
    if (tweak.debugMode === 1) {
      debugRenderer.render(sceneRenderer.directionalShadowBuffers[0]);
    }
  },

  resize(state, tweak, size) {
    state.rendererMemo.get(getOptions(tweak)).resize(size);

    state.projectionMatrix = Matrix4.fromIdentity([
      "setPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);
    state.target.resize(size);
  },

  update(state, tweak, dt) {
    const { camera, directionalLights, input, pointLights, time } = state;

    // Update light positions
    for (let i = 0; i < directionalLights.length; ++i) {
      const direction = directionalLights[i].direction;

      direction.set(directionalLights[i].mover(Vector3.zero, -time * 0.0005));
      direction.normalize();
      direction.scale(10);
    }

    for (let i = 0; i < pointLights.length; ++i) {
      const position = pointLights[i].position;

      position.set(pointLights[i].mover(Vector3.zero, time * 0.0005));
    }

    // Move camera
    camera.move(input, dt);

    state.time += tweak.move ? dt : 0;
  },
};

const process = declare(
  "Forward Phong lighting",
  WebGLScreen,
  configuration,
  application
);

export { process };
