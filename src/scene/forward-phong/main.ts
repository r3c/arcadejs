import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import * as bitfield from "../bitfield";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingLightModel,
  ForwardLightingObject,
  ForwardLightingRenderer,
  SceneState,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/functional";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import {
  GlModel,
  GlPolygon,
  GlScene,
  GlTarget,
  runtimeCreate,
  loadModel,
} from "../../engine/graphic/webgl";
import { orbitatePosition } from "../move";
import { Camera } from "../view";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const configuration = {
  nbLights: ["0", ".1", "2", "3"],
  animate: true,
  useAmbient: true,
  useDiffuse: true,
  useSpecular: true,
  useNormalMap: true,
  useHeightMap: true,
};

type ApplicationState = {
  camera: Camera;
  input: Input;
  lightPositions: Vector3[];
  models: {
    cube: GlModel<GlPolygon>;
    ground: GlModel<GlPolygon>;
    light: GlModel<GlPolygon>;
  };
  move: number;
  projectionMatrix: Matrix4;
  renderers: {
    lights: ForwardLightingRenderer[];
  };
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
    const runtime = runtimeCreate(screen.context);
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
      input: new Input(screen.canvas),
      lightPositions: range(3, () => Vector3.zero),
      models: {
        cube: loadModel(runtime, cubeModel),
        ground: loadModel(runtime, groundModel),
        light: loadModel(runtime, lightModel),
      },
      move: 0,
      projectionMatrix: Matrix4.identity,
      renderers: {
        lights: bitfield.enumerate(getOptions(tweak)).map(
          (flags) =>
            new ForwardLightingRenderer(runtime, {
              light: {
                maxPointLights: 3,
                model: ForwardLightingLightModel.Phong,
                modelPhongNoAmbient: !flags[0],
                modelPhongNoDiffuse: !flags[1],
                modelPhongNoSpecular: !flags[2],
                noShadow: true,
              },
              material: {
                noHeightMap: !flags[3],
                noNormalMap: !flags[4],
              },
            })
        ),
      },
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
      tweak,
    };
  },

  render(state) {
    const {
      camera,
      lightPositions,
      models,
      projectionMatrix,
      renderers,
      target,
      tweak,
    } = state;

    // Clear screen
    target.clear(0);

    // Forward pass
    const lightRenderer = renderers.lights[bitfield.index(getOptions(tweak))];
    const lightScene: GlScene<SceneState, ForwardLightingObject> = {
      state: {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        pointLights: lightPositions
          .slice(0, tweak.nbLights)
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
      ].concat(
        lightPositions.slice(0, tweak.nbLights).map((position) => ({
          matrix: Matrix4.fromCustom(["translate", position]),
          model: models.light,
          noShadow: true,
        }))
      ),
    };

    lightRenderer.render(target, lightScene);
  },

  resize(state, screen) {
    for (const renderer of state.renderers.lights) {
      renderer.resize(screen.getWidth(), screen.getHeight());
    }

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

    for (let i = 0; i < state.lightPositions.length; ++i) {
      state.lightPositions[i] = orbitatePosition(state.move, i, 2, 2);
    }

    // Move camera
    state.camera.move(state.input);
  },
};

const process = declare("Forward Phong lighting", WebGLScreen, application);

export { process };
