import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import * as bitfield from "../bitfield";
import * as color from "../color";
import { Input } from "../../engine/io/controller";
import * as debugTexture from "../../engine/graphic/webgl/pipelines/debug-texture";
import * as deferredLighting from "../../engine/graphic/webgl/pipelines/deferred-lighting";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/functional";
import { loadFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import * as webgl from "../../engine/graphic/webgl";
import { orbitatePosition, rotateDirection } from "../move";
import * as view from "../view";

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
  directionalLights: webgl.GlDirectionalLight[];
  input: Input;
  meshes: {
    cube: webgl.GlModel;
    directionalLight: webgl.GlModel;
    ground: webgl.GlModel;
    pointLight: webgl.GlModel;
  };
  move: number;
  pipelines: {
    debug: debugTexture.Pipeline[];
    scene: deferredLighting.Pipeline[];
  };
  pointLights: webgl.GlPointLight[];
  projectionMatrix: Matrix4;
  target: webgl.GlTarget;
  tweak: Tweak<Configuration>;
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

const getOptions = (tweak: Tweak<Configuration>) => [
  tweak.ambient !== 0,
  tweak.diffuse !== 0,
  tweak.specular !== 0,
];

const application: Application<WebGLScreen, SceneState> = {
  async prepare(screen) {
    const gl = screen.context;
    const tweak = configure(configuration);

    // Load meshes
    const cubeMesh = await loadFromJson("model/cube/mesh.json", {
      transform: Matrix4.createIdentity().scale({
        x: 0.4,
        y: 0.4,
        z: 0.4,
      }),
    });
    const directionalLightMesh = await loadFromJson("model/sphere/mesh.json", {
      transform: Matrix4.createIdentity().scale({
        x: 0.5,
        y: 0.5,
        z: 0.5,
      }),
    });
    const groundMesh = await loadFromJson("model/ground/mesh.json");
    const pointLightMesh = await loadFromJson("model/sphere/mesh.json", {
      transform: Matrix4.createIdentity().scale({
        x: 0.1,
        y: 0.1,
        z: 0.1,
      }),
    });

    // Create state
    return {
      camera: new view.Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      directionalLights: range(10, (i) => ({
        color: color.createBright(i),
        direction: Vector3.zero,
        shadow: false,
      })),
      input: new Input(screen.canvas),
      meshes: {
        cube: webgl.loadModel(gl, cubeMesh),
        directionalLight: webgl.loadModel(gl, directionalLightMesh),
        ground: webgl.loadModel(gl, groundMesh),
        pointLight: webgl.loadModel(gl, pointLightMesh),
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
      pointLights: range(500, (i) => ({
        color: color.createBright(i),
        position: Vector3.zero,
        radius: 2,
      })),
      projectionMatrix: Matrix4.createIdentity(),
      target: new webgl.GlTarget(gl, screen.getWidth(), screen.getHeight()),
      tweak: tweak,
    };
  },

  render(state) {
    const camera = state.camera;
    const meshes = state.meshes;
    const pipelines = state.pipelines;
    const target = state.target;
    const tweak = state.tweak;

    const transform = {
      projectionMatrix: state.projectionMatrix,
      viewMatrix: Matrix4.createIdentity()
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
          matrix: Matrix4.createIdentity().translate({
            x: 0,
            y: -1.5,
            z: 0,
          }),
          mesh: meshes.ground,
        },
      ]
        .concat(
          range(16, (i) => ({
            matrix: Matrix4.createIdentity().translate({
              x: ((i % 4) - 1.5) * 2,
              y: 0,
              z: (Math.floor(i / 4) - 1.5) * 2,
            }),
            mesh: meshes.cube,
          }))
        )
        .concat(
          directionalLights.map((light) => ({
            matrix: Matrix4.createIdentity().translate(
              Vector3.scale(Vector3.normalize(light.direction), 10)
            ),
            mesh: meshes.directionalLight,
          }))
        )
        .concat(
          pointLights.map((light) => ({
            matrix: Matrix4.createIdentity().translate(light.position),
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
  },

  resize(state, screen) {
    for (const pipeline of state.pipelines.debug)
      pipeline.resize(screen.getWidth(), screen.getHeight());

    for (const pipeline of state.pipelines.scene)
      pipeline.resize(screen.getWidth(), screen.getHeight());

    state.projectionMatrix = Matrix4.createPerspective(
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
      state.move += dt * 0.0002;
    }

    for (let i = 0; i < state.directionalLights.length; ++i) {
      state.directionalLights[i].direction = rotateDirection(state.move * 5, i);
    }

    for (let i = 0; i < state.pointLights.length; ++i) {
      state.pointLights[i].position = orbitatePosition(state.move, i, 1, 5);
    }

    // Move camera
    state.camera.move(state.input);
  },
};

const process = declare("Deferred lighting", WebGLScreen, application);

export { process };
