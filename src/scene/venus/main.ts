import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import * as bitfield from "../bitfield";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import * as forwardLighting from "../../engine/graphic/webgl/pipelines/forward-lighting";
import { range } from "../../engine/language/functional";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import * as webgl from "../../engine/graphic/webgl";
import { orbitatePosition } from "../move";
import * as view from "../view";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

interface Configuration {
  nbLights: string[];
  animate: boolean;
  useAmbient: boolean;
  useEmissive: boolean;
  useOcclusion: boolean;
  useIBL: boolean;
  useHeightMap: boolean;
  useNormalMap: boolean;
}

interface Light {
  position: Vector3;
}

interface SceneState {
  camera: view.Camera;
  input: Input;
  lights: Light[];
  models: {
    star: webgl.GlModel;
  };
  move: number;
  pipelines: {
    lights: forwardLighting.ForwardLightingPipeline[];
  };
  projectionMatrix: Matrix4;
  stars: Light[];
  target: webgl.GlTarget;
  tweak: Tweak<Configuration>;
}

const configuration = {
  nbLights: ["0", ".1", "2", "3"],
  animate: true,
  useAmbient: true,
  useEmissive: true,
  useOcclusion: true,
  useIBL: true,
  useHeightMap: true,
  useNormalMap: true,
};

const getOptions = (tweak: Tweak<Configuration>) => [
  tweak.useAmbient !== 0,
  tweak.useEmissive !== 0,
  tweak.useOcclusion !== 0,
  tweak.useIBL !== 0,
  tweak.useHeightMap !== 0,
  tweak.useNormalMap !== 0,
];

const application: Application<WebGLScreen, SceneState> = {
  async prepare(screen) {
    const gl = screen.context;
    const tweak = configure(configuration);

    // Load meshes
    const starModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.01, y: 0.01, z: 0.01 }]),
    });

    // Create state
    return {
      camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
      input: new Input(screen.canvas),
      lights: range(3, () => ({
        position: { x: 0, y: 0, z: 0 },
      })),
      models: {
        star: webgl.loadModel(gl, starModel),
      },
      move: 0,
      pipelines: {
        lights: bitfield.enumerate(getOptions(tweak)).map(
          (flags) =>
            new forwardLighting.ForwardLightingPipeline(gl, {
              light: {
                model: forwardLighting.ForwardLightingModel.Phong,
                maxPointLights: 3,
                noShadow: true,
              },
              material: {
                noEmissiveMap: !flags[1],
                noHeightMap: !flags[4],
                noNormalMap: !flags[5],
                noOcclusionMap: !flags[2],
              },
            })
        ),
      },
      projectionMatrix: Matrix4.fromPerspective(
        45,
        screen.getRatio(),
        0.1,
        100
      ),
      stars: range(1000, () => ({
        position: {
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5,
          z: Math.random() * 10 - 5,
        },
      })),
      target: new webgl.GlTarget(gl, screen.getWidth(), screen.getHeight()),
      tweak,
    };
  },

  render(state) {
    const { camera, models, pipelines, projectionMatrix, target, tweak } =
      state;

    const lightPositions = state.lights
      .slice(0, tweak.nbLights)
      .map((light) => light.position);

    const starPositions = state.stars.map(({ position }) => position);

    const cameraView = Matrix4.fromCustom(
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    // Draw scene
    target.clear(0);

    // PBR render
    const stars = starPositions.map((position) => ({
      matrix: Matrix4.fromCustom(["translate", position]),
      model: models.star,
    }));

    const scene = {
      ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
      pointLights: lightPositions.map((position) => ({
        color: { x: 1, y: 1, z: 1 },
        position: position,
        radius: 5,
      })),
      subjects: stars,
    };

    pipelines.lights[bitfield.index(getOptions(tweak))].process(
      target,
      {
        projectionMatrix: projectionMatrix,
        viewMatrix: cameraView,
      },
      scene
    );
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
