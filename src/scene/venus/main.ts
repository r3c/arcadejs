import { type Application, configure, declare } from "../../engine/application";
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
  createRuntime,
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

type Light = {
  position: Vector3;
};

type ApplicationState = {
  camera: Camera;
  input: Input;
  lights: Light[];
  models: {
    star: GlModel<GlPolygon>;
  };
  move: number;
  projectionMatrix: Matrix4;
  renderer: ForwardLightingRenderer;
  stars: Light[];
  target: GlTarget;
};

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);

    configure(undefined);

    // Load meshes
    const starModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.01, y: 0.01, z: 0.01 }]),
    });

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
      input: new Input(screen.canvas),
      lights: range(3, () => ({
        position: { x: 0, y: 0, z: 0 },
      })),
      models: {
        star: loadModel(runtime, starModel),
      },
      move: 0,
      projectionMatrix: Matrix4.identity,
      renderer: new ForwardLightingRenderer(runtime, {
        light: {
          model: ForwardLightingLightModel.Phong,
          maxPointLights: 3,
          noShadow: true,
        },
      }),
      stars: range(1000, () => ({
        position: {
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5,
          z: Math.random() * 10 - 5,
        },
      })),
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
    };
  },

  render(state) {
    const { camera, models, projectionMatrix, renderer, target } = state;

    const lightPositions = state.lights.map((light) => light.position);
    const starPositions = state.stars.map(({ position }) => position);

    const viewMatrix = Matrix4.fromCustom(
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    // Draw scene
    target.clear(0);

    // PBR render
    const objects = starPositions.map((position) => ({
      matrix: Matrix4.fromCustom(["translate", position]),
      model: models.star,
      noShadow: false,
    }));

    const scene: GlScene<SceneState, ForwardLightingObject> = {
      objects,
      state: {
        ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
        pointLights: lightPositions.map((position) => ({
          color: { x: 1, y: 1, z: 1 },
          position,
          radius: 5,
        })),
        projectionMatrix,
        viewMatrix,
      },
    };

    renderer.render(target, scene);
  },

  resize(state, screen) {
    state.projectionMatrix = Matrix4.fromPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );

    state.renderer.resize(screen.getWidth(), screen.getHeight());
    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    // Update light positions
    for (const star of state.stars) {
      const position = Vector3.fromObject(star.position);

      position.z += dt * 0.001;

      if (position.z > 5) {
        position.z -= 10;
      }

      star.position = position;
    }

    for (let i = 0; i < state.lights.length; ++i) {
      state.lights[i].position = orbitatePosition(state.move * 5, i, 1, 3);
    }

    // Move camera
    state.camera.move(state.input);
  },
};

const process = declare("Venus³", WebGLScreen, application);

export { process };
