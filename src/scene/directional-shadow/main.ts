import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import * as bitfield from "../bitfield";
import { Input } from "../../engine/io/controller";
import * as debugTexture from "../../engine/graphic/webgl/pipelines/debug-texture";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingModel,
  ForwardLightingPipeline,
  SceneState,
  ModelState,
  hasShadowState,
  noShadowState,
} from "../../engine/graphic/webgl/pipelines/forward-lighting";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import * as move from "../move";
import { Vector3 } from "../../engine/math/vector";
import * as view from "../view";
import {
  GlModel,
  GlScene,
  GlTarget,
  createRenderer,
  loadModel,
} from "../../engine/graphic/webgl";

/*
 ** What changed?
 ** - Scene is first rendered from light's point of view to a shadow map
 ** - Then rendered a second time from camera's point of view, using this map for shadowing
 */

interface Configuration {
  animate: boolean;
  enableShadow: boolean;
  showDebug: boolean;
}

interface ApplicationState {
  camera: view.Camera;
  input: Input;
  models: {
    cube: GlModel;
    ground: GlModel;
    light: GlModel;
  };
  move: number;
  pipelines: {
    debug: debugTexture.Pipeline;
    lights: ForwardLightingPipeline[];
  };
  projectionMatrix: Matrix4;
  target: GlTarget;
  tweak: Tweak<Configuration>;
}

const configuration = {
  animate: true,
  enableShadow: true,
  showDebug: false,
};

const getOptions = (tweak: Tweak<Configuration>) => [tweak.enableShadow !== 0];

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const renderer = createRenderer(gl);
    const tweak = configure(configuration);

    // Load meshes
    const cubeModel = await loadModelFromJson("model/cube/mesh.json");
    const groundModel = await loadModelFromJson("model/ground/mesh.json");
    const lightModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.5, y: 0.5, z: 0.5 }]),
    });

    // Create state
    return {
      camera: new view.Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      input: new Input(screen.canvas),
      models: {
        cube: loadModel(renderer, cubeModel),
        ground: loadModel(renderer, groundModel),
        light: loadModel(renderer, lightModel),
      },
      move: 0,
      pipelines: {
        debug: new debugTexture.Pipeline(renderer, {
          format: debugTexture.Format.Monochrome,
          select: debugTexture.Select.Red,
          zNear: 0.1,
          zFar: 100,
        }),
        lights: bitfield.enumerate(getOptions(tweak)).map(
          (flags) =>
            new ForwardLightingPipeline(renderer, {
              light: {
                model: ForwardLightingModel.Phong,
                maxDirectionalLights: 1,
                noShadow: !flags[0],
              },
            })
        ),
      },
      projectionMatrix: Matrix4.fromIdentity(),
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
      tweak,
    };
  },

  render(state) {
    const { camera, models, pipelines, target } = state;

    // Setup view matrices
    const transform = {
      projectionMatrix: state.projectionMatrix,
      viewMatrix: Matrix4.fromCustom(
        ["translate", camera.position],
        ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
        ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
      ),
    };

    // Draw scene
    const lightDirection = move.rotateDirection(-state.move * 10, 0);
    const lightPipeline =
      pipelines.lights[bitfield.index(getOptions(state.tweak))];

    const modelLightDirection = Vector3.fromObject(lightDirection);

    modelLightDirection.normalize();
    modelLightDirection.scale(10);

    const lightScene: GlScene<SceneState, ModelState> = {
      state: {
        ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
        directionalLights: [
          {
            color: { x: 0.8, y: 0.8, z: 0.8 },
            direction: lightDirection,
            shadow: true,
          },
        ],
        projectionMatrix: state.projectionMatrix,
        viewMatrix: Matrix4.fromCustom(
          ["translate", camera.position],
          ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
          ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
        ),
      },
      subjects: [
        {
          matrix: Matrix4.fromCustom([
            "rotate",
            { x: 0, y: 1, z: 1 },
            state.move * 5,
          ]),
          model: models.cube,
          state: hasShadowState,
        },
        {
          matrix: Matrix4.fromCustom(["translate", { x: 0, y: -1.5, z: 0 }]),
          model: models.ground,
          state: hasShadowState,
        },
        {
          matrix: Matrix4.fromCustom(["translate", modelLightDirection]),
          model: models.light,
          state: noShadowState,
        },
      ],
    };

    target.clear(0);

    lightPipeline.process(target, transform, lightScene);

    // Draw texture debug
    if (state.tweak.showDebug) {
      const debugPipeline = pipelines.debug;
      const debugScene = debugTexture.Pipeline.createScene(
        lightPipeline.directionalShadowBuffers[0]
      );

      debugPipeline.process(target, transform, debugScene);
    }
  },

  resize(state, screen) {
    for (const pipeline of state.pipelines.lights)
      pipeline.resize(screen.getWidth(), screen.getHeight());

    state.projectionMatrix = Matrix4.fromPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );
    state.pipelines.debug.resize(screen.getWidth(), screen.getHeight());
    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    // Update animation state
    if (state.tweak.animate) state.move += dt * 0.00003;

    // Move camera
    state.camera.move(state.input);
  },
};

const process = declare("Directional shadow", WebGLScreen, application);

export { process };
