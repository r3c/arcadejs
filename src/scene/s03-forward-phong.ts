import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/io/controller";
import * as display from "../engine/display";
import * as forwardLighting from "../engine/graphic/pipelines/forward-lighting";
import * as functional from "../engine/language/functional";
import * as load from "../engine/graphic/load";
import * as matrix from "../engine/math/matrix";
import * as move from "./shared/move";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/graphic/webgl";

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
  useDiffuse: boolean;
  useSpecular: boolean;
  useNormalMap: boolean;
  useHeightMap: boolean;
}

interface SceneState {
  camera: view.Camera;
  input: controller.Input;
  lightPositions: vector.Vector3[];
  meshes: {
    cube: webgl.Mesh;
    ground: webgl.Mesh;
    light: webgl.Mesh;
  };
  move: number;
  pipelines: {
    lights: forwardLighting.Pipeline[];
  };
  projectionMatrix: matrix.Matrix4;
  target: webgl.Target;
  tweak: application.Tweak<Configuration>;
}

const configuration = {
  nbLights: ["0", ".1", "2", "3"],
  animate: true,
  useAmbient: true,
  useDiffuse: true,
  useSpecular: true,
  useNormalMap: true,
  useHeightMap: true,
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
  tweak.useAmbient !== 0,
  tweak.useDiffuse !== 0,
  tweak.useSpecular !== 0,
  tweak.useHeightMap !== 0,
  tweak.useNormalMap !== 0,
];

const prepare = () =>
  application.runtime(
    display.WebGLScreen,
    configuration,
    async (screen, input, tweak) => {
      const gl = screen.context;

      // Load models
      const cubeMesh = await load.fromJSON("./obj/cube/mesh.json");
      const groundMesh = await load.fromJSON("./obj/ground/mesh.json");
      const lightMesh = await load.fromJSON("./obj/sphere/mesh.json", {
        transform: matrix.Matrix4.createIdentity().scale({
          x: 0.2,
          y: 0.2,
          z: 0.2,
        }),
      });

      // Create state
      return {
        camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
        input: input,
        lightPositions: functional.range(3, (i) => vector.Vector3.zero),
        meshes: {
          cube: webgl.loadMesh(gl, cubeMesh),
          ground: webgl.loadMesh(gl, groundMesh),
          light: webgl.loadMesh(gl, lightMesh),
        },
        move: 0,
        pipelines: {
          lights: bitfield.enumerate(getOptions(tweak)).map(
            (flags) =>
              new forwardLighting.Pipeline(gl, {
                forceHeightMap: flags[3] ? undefined : false,
                forceNormalMap: flags[4] ? undefined : false,
                lightModel: forwardLighting.LightModel.Phong,
                lightModelPhongNoAmbient: !flags[0],
                lightModelPhongNoDiffuse: !flags[1],
                lightModelPhongNoSpecular: !flags[2],
                maxPointLights: 3,
                noShadow: true,
              })
          ),
        },
        projectionMatrix: matrix.Matrix4.createIdentity(),
        target: new webgl.Target(gl, screen.getWidth(), screen.getHeight()),
        tweak: tweak,
      };
    }
  );

const render = (state: SceneState) => {
  const camera = state.camera;
  const meshes = state.meshes;
  const pipelines = state.pipelines;
  const target = state.target;

  const transform = {
    projectionMatrix: state.projectionMatrix,
    viewMatrix: matrix.Matrix4.createIdentity()
      .translate(camera.position)
      .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
      .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y),
  };

  // Clear screen
  target.clear();

  // Forward pass
  const lightPipeline =
    pipelines.lights[bitfield.index(getOptions(state.tweak))];
  const lightScene = {
    ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
    pointLights: state.lightPositions
      .slice(0, state.tweak.nbLights)
      .map((position) => ({
        color: { x: 0.8, y: 0.8, z: 0.8 },
        position: position,
        radius: 5,
      })),
    subjects: [
      {
        matrix: matrix.Matrix4.createIdentity(),
        mesh: meshes.cube,
      },
      {
        matrix: matrix.Matrix4.createIdentity().translate({
          x: 0,
          y: -1.5,
          z: 0,
        }),
        mesh: meshes.ground,
      },
    ].concat(
      state.lightPositions.slice(0, state.tweak.nbLights).map((position) => ({
        matrix: matrix.Matrix4.createIdentity().translate(position),
        mesh: meshes.light,
      }))
    ),
  };

  lightPipeline.process(target, transform, lightScene);
};

const resize = (state: SceneState, screen: display.WebGLScreen) => {
  for (const pipeline of state.pipelines.lights)
    pipeline.resize(screen.getWidth(), screen.getHeight());

  state.projectionMatrix = matrix.Matrix4.createPerspective(
    45,
    screen.getRatio(),
    0.1,
    100
  );
  state.target.resize(screen.getWidth(), screen.getHeight());
};

const update = (state: SceneState, dt: number) => {
  // Update light positions
  if (state.tweak.animate) state.move += dt * 0.0005;

  for (let i = 0; i < state.lightPositions.length; ++i)
    state.lightPositions[i] = move.orbitate(i, state.move, 2, 2);

  // Move camera
  state.camera.move(state.input);
};

const process = application.declare({
  prepare: prepare,
  render: render,
  resize: resize,
  update: update,
});

export { process };
