import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import { Memo, indexBooleans, memoize } from "../../engine/language/memo";
import { Input } from "../../engine/io/controller";
import {
  DebugTextureFormat,
  DebugTextureRenderer,
  DebugTextureSelect,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingLightModel,
  ForwardLightingObject,
  ForwardLightingRenderer,
  SceneState,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { rotateDirection } from "../move";
import { Vector3 } from "../../engine/math/vector";
import { Camera } from "../view";
import {
  GlModel,
  GlScene,
  GlTarget,
  runtimeCreate,
  loadModel,
} from "../../engine/graphic/webgl";
import { GlPolygon } from "../../engine/graphic/webgl/renderers/objects/polygon";

/*
 ** What changed?
 ** - Scene is first rendered from light's point of view to a shadow map
 ** - Then rendered a second time from camera's point of view, using this map for shadowing
 */

const configuration = {
  animate: true,
  enableShadow: true,
  showDebug: false,
};

interface ApplicationState {
  camera: Camera;
  debugRenderer: DebugTextureRenderer;
  input: Input;
  lightDirection: Vector3;
  models: {
    cube: GlModel<GlPolygon>;
    ground: GlModel<GlPolygon>;
    light: GlModel<GlPolygon>;
  };
  move: number;
  projectionMatrix: Matrix4;
  sceneRendererMemo: Memo<boolean[], ForwardLightingRenderer>;
  target: GlTarget;
  tweak: Tweak<typeof configuration>;
}

const getOptions = (tweak: Tweak<typeof configuration>) => [
  tweak.enableShadow !== 0,
];

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = runtimeCreate(gl);
    const tweak = configure(configuration);

    // Load meshes
    const cubeModel = await loadModelFromJson("model/cube/mesh.json");
    const groundModel = await loadModelFromJson("model/ground/mesh.json");
    const lightModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.5, y: 0.5, z: 0.5 }]),
    });

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      debugRenderer: new DebugTextureRenderer(runtime, {
        format: DebugTextureFormat.Monochrome,
        select: DebugTextureSelect.Red,
        zNear: 0.1,
        zFar: 100,
      }),
      input: new Input(screen.canvas),
      lightDirection: Vector3.zero,
      models: {
        cube: loadModel(runtime, cubeModel),
        ground: loadModel(runtime, groundModel),
        light: loadModel(runtime, lightModel),
      },
      move: 0,
      projectionMatrix: Matrix4.identity,
      sceneRendererMemo: memoize(
        indexBooleans,
        (flags) =>
          new ForwardLightingRenderer(runtime, {
            light: {
              model: ForwardLightingLightModel.Phong,
              maxDirectionalLights: 1,
              noShadow: !flags[0],
            },
          })
      ),
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
      tweak,
    };
  },

  render(state) {
    const { camera, debugRenderer, models, sceneRendererMemo, target } = state;

    // Draw scene
    const lightScene: GlScene<SceneState, ForwardLightingObject> = {
      state: {
        ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
        directionalLights: [
          {
            color: { x: 0.8, y: 0.8, z: 0.8 },
            direction: state.lightDirection,
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
      objects: [
        {
          matrix: Matrix4.fromCustom([
            "rotate",
            { x: 0, y: 1, z: 1 },
            state.move,
          ]),
          model: models.cube,
          noShadow: false,
        },
        {
          matrix: Matrix4.fromCustom(["translate", { x: 0, y: -1.5, z: 0 }]),
          model: models.ground,
          noShadow: false,
        },
        {
          matrix: Matrix4.fromCustom(["translate", state.lightDirection]),
          model: models.light,
          noShadow: true,
        },
      ],
    };

    target.clear(0);

    const sceneRenderer = sceneRendererMemo.get(getOptions(state.tweak));

    sceneRenderer.render(target, lightScene);

    // Draw texture debug
    if (state.tweak.showDebug) {
      const debugScene = DebugTextureRenderer.createScene(
        sceneRenderer.directionalShadowBuffers[0]
      );

      debugRenderer.render(target, debugScene);
    }
  },

  resize(state, screen) {
    state.debugRenderer.resize(screen.getWidth(), screen.getHeight());

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
    // Update animation state
    if (state.tweak.animate) {
      state.move += dt * 0.0005;
    }

    const lightDirection = Vector3.fromObject(rotateDirection(-state.move, 0));

    lightDirection.normalize();
    lightDirection.scale(10);

    state.lightDirection = lightDirection;

    // Move camera
    state.camera.move(state.input, dt);
  },
};

const process = declare("Directional shadow", WebGLScreen, application);

export { process };
