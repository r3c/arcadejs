import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as color from "./shared/color";
import * as controller from "../engine/io/controller";
import * as debugTexture from "../engine/graphic/pipelines/debug-texture";
import * as deferredLighting from "../engine/graphic/pipelines/deferred-lighting";
import * as display from "../engine/display";
import * as functional from "../engine/language/functional";
import * as load from "../engine/graphic/load";
import * as matrix from "../engine/math/matrix";
import * as move from "./shared/move";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/graphic/webgl";

/*
 ** What changed?
 */

interface Configuration {
  nbDirectionals: string[];
  nbPoints: string[];
  animate: boolean;
  ambient: boolean;
  diffuse: boolean;
  specular: boolean;
  debugMode: string[];
}

interface SceneState {
  camera: view.Camera;
  directionalLights: webgl.DirectionalLight[];
  input: controller.Input;
  meshes: {
    cube: webgl.Mesh;
    directionalLight: webgl.Mesh;
    ground: webgl.Mesh;
    pointLight: webgl.Mesh;
  };
  move: number;
  pipelines: {
    debug: debugTexture.Pipeline[];
    scene: deferredLighting.Pipeline[];
  };
  pointLights: webgl.PointLight[];
  projectionMatrix: matrix.Matrix4;
  target: webgl.Target;
  tweak: application.Tweak<Configuration>;
}

const configuration = {
  nbDirectionals: [".0", "1", "2", "5"],
  nbPoints: ["0", ".50", "100", "250", "500"],
  animate: true,
  ambient: true,
  diffuse: true,
  specular: true,
  debugMode: [
    ".None",
    "Depth",
    "Normal",
    "Shininess",
    "Gloss",
    "Diffuse light",
    "Specular light",
  ],
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
  tweak.ambient !== 0,
  tweak.diffuse !== 0,
  tweak.specular !== 0,
];

const prepare = () =>
  application.runtime(
    display.WebGLScreen,
    configuration,
    async (screen, input, tweak) => {
      const gl = screen.context;

      // Load meshes
      const cubeMesh = await load.fromJSON("./obj/cube/mesh.json", {
        transform: matrix.Matrix4.createIdentity().scale({
          x: 0.4,
          y: 0.4,
          z: 0.4,
        }),
      });
      const directionalLightMesh = await load.fromJSON(
        "./obj/sphere/mesh.json",
        {
          transform: matrix.Matrix4.createIdentity().scale({
            x: 0.5,
            y: 0.5,
            z: 0.5,
          }),
        }
      );
      const groundMesh = await load.fromJSON("./obj/ground/mesh.json");
      const pointLightMesh = await load.fromJSON("./obj/sphere/mesh.json", {
        transform: matrix.Matrix4.createIdentity().scale({
          x: 0.1,
          y: 0.1,
          z: 0.1,
        }),
      });

      // Create state
      return {
        camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
        directionalLights: functional.range(10, (i) => ({
          color: color.createBright(i),
          direction: vector.Vector3.zero,
          shadow: false,
        })),
        input: input,
        meshes: {
          cube: webgl.loadMesh(gl, cubeMesh),
          directionalLight: webgl.loadMesh(gl, directionalLightMesh),
          ground: webgl.loadMesh(gl, groundMesh),
          pointLight: webgl.loadMesh(gl, pointLightMesh),
        },
        move: 0,
        pipelines: {
          debug: [
            {
              select: debugTexture.Select.Red,
              format: debugTexture.Format.Depth,
            },
            {
              select: debugTexture.Select.RedGreen,
              format: debugTexture.Format.Spheremap,
            },
            {
              select: debugTexture.Select.Blue,
              format: debugTexture.Format.Monochrome,
            },
            {
              select: debugTexture.Select.Alpha,
              format: debugTexture.Format.Monochrome,
            },
            {
              select: debugTexture.Select.RedGreenBlue,
              format: debugTexture.Format.Logarithm,
            },
            {
              select: debugTexture.Select.Alpha,
              format: debugTexture.Format.Logarithm,
            },
          ].map(
            (configuration) =>
              new debugTexture.Pipeline(gl, {
                format: configuration.format,
                select: configuration.select,
                zNear: 0.1,
                zFar: 100,
              })
          ),
          scene: bitfield.enumerate(getOptions(tweak)).map(
            (flags) =>
              new deferredLighting.Pipeline(gl, {
                lightModel: deferredLighting.LightModel.Phong,
                lightModelPhongNoAmbient: !flags[0],
                lightModelPhongNoDiffuse: !flags[1],
                lightModelPhongNoSpecular: !flags[2],
                useHeightMap: true,
                useNormalMap: true,
              })
          ),
        },
        pointLights: functional.range(500, (i) => ({
          color: color.createBright(i),
          position: vector.Vector3.zero,
          radius: 2,
        })),
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
  const tweak = state.tweak;

  const transform = {
    projectionMatrix: state.projectionMatrix,
    viewMatrix: matrix.Matrix4.createIdentity()
      .translate(camera.position)
      .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
      .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y),
  };

  // Pick active lights
  const directionalLights = state.directionalLights.slice(
    0,
    [0, 1, 2, 5][tweak.nbDirectionals] || 0
  );
  const pointLights = state.pointLights.slice(
    0,
    [0, 50, 100, 250, 500][tweak.nbPoints] || 0
  );

  // Draw scene
  const deferredPipeline = pipelines.scene[bitfield.index(getOptions(tweak))];
  const deferredScene = {
    ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
    directionalLights: directionalLights,
    pointLights: pointLights,
    subjects: [
      {
        matrix: matrix.Matrix4.createIdentity().translate({
          x: 0,
          y: -1.5,
          z: 0,
        }),
        mesh: meshes.ground,
      },
    ]
      .concat(
        functional.range(16, (i) => ({
          matrix: matrix.Matrix4.createIdentity().translate({
            x: ((i % 4) - 1.5) * 2,
            y: 0,
            z: (Math.floor(i / 4) - 1.5) * 2,
          }),
          mesh: meshes.cube,
        }))
      )
      .concat(
        directionalLights.map((light) => ({
          matrix: matrix.Matrix4.createIdentity().translate(
            vector.Vector3.scale(vector.Vector3.normalize(light.direction), 10)
          ),
          mesh: meshes.directionalLight,
        }))
      )
      .concat(
        pointLights.map((light) => ({
          matrix: matrix.Matrix4.createIdentity().translate(light.position),
          mesh: meshes.pointLight,
        }))
      ),
  };

  target.clear(0);

  deferredPipeline.process(target, transform, deferredScene);

  // Draw debug
  if (tweak.debugMode !== 0) {
    const debugPipeline = pipelines.debug[tweak.debugMode - 1];
    const debugScene = debugTexture.Pipeline.createScene(
      [
        deferredPipeline.depthBuffer,
        deferredPipeline.normalAndGlossinessBuffer,
        deferredPipeline.normalAndGlossinessBuffer,
        deferredPipeline.normalAndGlossinessBuffer,
        deferredPipeline.lightBuffer,
        deferredPipeline.lightBuffer,
      ][tweak.debugMode - 1]
    );

    debugPipeline.process(target, transform, debugScene);
  }
};

const resize = (state: SceneState, screen: display.WebGLScreen) => {
  for (const pipeline of state.pipelines.debug)
    pipeline.resize(screen.getWidth(), screen.getHeight());

  for (const pipeline of state.pipelines.scene)
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
  if (state.tweak.animate) state.move += dt * 0.0002;

  for (let i = 0; i < state.directionalLights.length; ++i)
    state.directionalLights[i].direction = move.rotate(i, state.move * 5);

  for (let i = 0; i < state.pointLights.length; ++i)
    state.pointLights[i].position = move.orbitate(i, state.move, 6, 2);

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
