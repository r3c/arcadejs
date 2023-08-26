import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingLightModel,
  ForwardLightingObject,
  ForwardLightingRenderer,
  SceneState,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/iterable";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import { GlScene, GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { orbitatePosition, rotateDirection } from "../move";
import { Camera } from "../view";
import { Memo, indexBooleans, memoize } from "../../engine/language/memo";
import { GlModel, loadModel } from "../../engine/graphic/webgl/model";

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
};

type ApplicationState = {
  camera: Camera;
  directionalLightDirections: Vector3[];
  input: Input;
  models: {
    cube: GlModel;
    ground: GlModel;
    light: GlModel;
  };
  move: number;
  pointLightPositions: Vector3[];
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
      directionalLightDirections: range(3).map(() => Vector3.zero),
      input: new Input(screen.canvas),
      models: {
        cube: loadModel(gl, cubeModel),
        ground: loadModel(gl, groundModel),
        light: loadModel(gl, lightModel),
      },
      move: 0,
      pointLightPositions: range(3).map(() => Vector3.zero),
      projectionMatrix: Matrix4.identity,
      rendererMemo: memoize(
        indexBooleans,
        (flags) =>
          new ForwardLightingRenderer(runtime, target, {
            light: {
              maxDirectionalLights: 3,
              maxPointLights: 3,
              model: ForwardLightingLightModel.Phong,
              modelPhongNoAmbient: !flags[0],
              modelPhongNoDiffuse: !flags[1],
              modelPhongNoSpecular: !flags[2],
            },
            material: {
              noHeightMap: !flags[3],
              noNormalMap: !flags[4],
            },
          })
      ),
      target,
      tweak,
    };
  },

  render(state) {
    const {
      camera,
      directionalLightDirections,
      models,
      pointLightPositions,
      projectionMatrix,
      rendererMemo,
      target,
      tweak,
    } = state;

    // Clear screen
    target.clear(0);

    // Forward pass
    const renderer = rendererMemo.get(getOptions(tweak));
    const scene: GlScene<SceneState, ForwardLightingObject> = {
      state: {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        directionalLights: directionalLightDirections
          .slice(0, tweak.nbDirectionalLights)
          .map((direction) => ({
            color: { x: 0.8, y: 0.8, z: 0.8 },
            direction,
            shadow: true,
          })),
        pointLights: pointLightPositions
          .slice(0, tweak.nbPointLights)
          .map((position) => ({
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
      },
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
          pointLightPositions.slice(0, tweak.nbPointLights).map((position) => ({
            matrix: Matrix4.fromCustom(["translate", position]),
            model: models.light,
            noShadow: true,
          }))
        )
        .concat(
          directionalLightDirections
            .slice(0, tweak.nbDirectionalLights)
            .map((direction) => ({
              matrix: Matrix4.fromCustom(["translate", direction]),
              model: models.light,
              noShadow: true,
            }))
        ),
    };

    renderer.render(scene);
  },

  resize(state, screen) {
    state.rendererMemo
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
    // Update light positions
    if (state.tweak.animate) {
      state.move += dt * 0.0005;
    }

    for (let i = 0; i < state.directionalLightDirections.length; ++i) {
      const direction = Vector3.fromObject(rotateDirection(-state.move, i));

      direction.normalize();
      direction.scale(10);

      state.directionalLightDirections[i] = direction;
    }

    for (let i = 0; i < state.pointLightPositions.length; ++i) {
      state.pointLightPositions[i] = orbitatePosition(state.move, i, 2, 2);
    }

    // Move camera
    state.camera.move(state.input, dt);
  },
};

const process = declare("Forward Phong lighting", WebGLScreen, application);

export { process };
