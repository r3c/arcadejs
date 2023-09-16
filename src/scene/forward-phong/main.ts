import {
  type Application,
  type Tweak,
  configure,
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
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { Mover, createCircleMover, createOrbitMover } from "../move";
import { Camera } from "../view";
import { Memo, indexBooleans, memoize } from "../../engine/language/memo";
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
  nbDirectionalLights: [".0", "1", "2", "3"],
  nbPointLights: ["0", ".1", "2", "3"],
  animate: true,
  useAmbient: true,
  useDiffuse: true,
  useSpecular: true,
  useNormalMap: true,
  useHeightMap: true,
  debugMode: [".None", "Shadow"],
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
  tweak: Tweak<typeof configuration>;
};

const getOptions = (tweak: Tweak<typeof configuration>) => [
  tweak.useAmbient !== 0,
  tweak.useDiffuse !== 0,
  tweak.useSpecular !== 0,
  tweak.useHeightMap !== 0,
  tweak.useNormalMap !== 0,
];

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(screen.context);
    const target = new GlTarget(gl, screen.getWidth(), screen.getHeight());
    const tweak = configure(configuration);

    // Load models
    const cubeModel = await loadModelFromJson("model/cube/mesh.json");
    const groundModel = await loadModelFromJson("model/ground/mesh.json");
    const lightModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.2, y: 0.2, z: 0.2 }]),
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
        indexBooleans,
        (flags) =>
          new ForwardLightingRenderer(runtime, target, {
            maxDirectionalLights: 3,
            maxPointLights: 3,
            model: ForwardLightingLightModel.Phong,
            modelPhongNoAmbient: !flags[0],
            modelPhongNoDiffuse: !flags[1],
            modelPhongNoSpecular: !flags[2],
            noHeightMap: !flags[3],
            noNormalMap: !flags[4],
          })
      ),
      target,
      time: 0,
      tweak,
    };
  },

  render(state) {
    const {
      camera,
      debugRenderer,
      directionalLights,
      models,
      pointLights,
      projectionMatrix,
      rendererMemo,
      target,
      tweak,
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
          matrix: Matrix4.fromCustom(["translate", { x: 0, y: -1.5, z: 0 }]),
          model: models.ground,
          noShadow: false,
        },
      ]
        .concat(
          pointLights.slice(0, tweak.nbPointLights).map(({ position }) => ({
            matrix: Matrix4.fromCustom(["translate", position]),
            model: models.light,
            noShadow: true,
          }))
        )
        .concat(
          directionalLights
            .slice(0, tweak.nbDirectionalLights)
            .map(({ direction }) => ({
              matrix: Matrix4.fromCustom(["translate", direction]),
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
      viewMatrix: Matrix4.fromCustom(
        ["translate", camera.position],
        ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
        ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
      ),
    };

    sceneRenderer.render(scene);

    // Draw texture debug
    if (state.tweak.debugMode === 1) {
      debugRenderer.render(sceneRenderer.directionalShadowBuffers[0]);
    }
  },

  resize(state, screen) {
    state.rendererMemo
      .get(getOptions(state.tweak))
      .resize(screen.getWidth(), screen.getHeight());

    state.projectionMatrix = Matrix4.fromPerspective(
      Math.PI / 4,
      screen.getRatio(),
      0.1,
      100
    );
    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    const { camera, directionalLights, input, pointLights, time, tweak } =
      state;

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

    state.time += tweak.animate ? dt : 0;
  },
};

const process = declare("Forward Phong lighting", WebGLScreen, application);

export { process };
