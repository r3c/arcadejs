import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/io/controller";
import * as display from "../engine/display";
import * as forwardLighting from "../engine/graphic/pipelines/forward-lighting";
import * as functional from "../engine/language/functional";
import * as image from "../engine/graphic/image";
import * as load from "../engine/graphic/load";
import { Matrix4 } from "../engine/math/matrix";
import * as move from "./shared/move";
import { Vector3 } from "../engine/math/vector";
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
  input: controller.Input;
  lights: Light[];
  meshes: {
    ground: webgl.Mesh;
    helmet: webgl.Mesh;
    light: webgl.Mesh;
  };
  move: number;
  pipelines: {
    lights: forwardLighting.ForwardLightingPipeline[];
  };
  projectionMatrix: Matrix4;
  target: webgl.Target;
  textures: {
    brdf: WebGLTexture;
    diffuse: WebGLTexture;
    specular: WebGLTexture;
  };
  tweak: application.Tweak<Configuration>;
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

const getOptions = (tweak: application.Tweak<Configuration>) => [
  tweak.useAmbient !== 0,
  tweak.useEmissive !== 0,
  tweak.useOcclusion !== 0,
  tweak.useIBL !== 0,
  tweak.useHeightMap !== 0,
  tweak.useNormalMap !== 0,
];

const prepare = async () =>
  application.runtime(
    display.WebGLScreen,
    configuration,
    async (screen, input, tweak) => {
      const gl = screen.context;

      // Load meshes
      const groundMesh = await load.fromJSON("./obj/ground/mesh.json");
      const helmetMesh = await load.fromGLTF(
        "https://github.com/KhronosGroup/glTF-Sample-Models/raw/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf",
        {
          transform: Matrix4.createIdentity()
            .rotate({ x: 0, y: 1, z: 0 }, Math.PI)
            .rotate({ x: 1, y: 0, z: 0 }, -Math.PI * 0.5),
        }
      );
      const lightMesh = await load.fromJSON("./obj/sphere/mesh.json", {
        transform: Matrix4.createIdentity().scale({
          x: 0.2,
          y: 0.2,
          z: 0.2,
        }),
      });

      // Load textures
      const brdf = webgl.loadTextureQuad(
        gl,
        await image.loadFromURL("./obj/ibl_brdf_lut.png")
      );

      const diffuse = webgl.loadTextureCube(
        gl,
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/diffuse/diffuse_right_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/diffuse/diffuse_left_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/diffuse/diffuse_top_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/diffuse/diffuse_bottom_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/diffuse/diffuse_front_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/diffuse/diffuse_back_0.jpg"
        )
      );

      const specular = webgl.loadTextureCube(
        gl,
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/specular/specular_right_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/specular/specular_left_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/specular/specular_top_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/specular/specular_bottom_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/specular/specular_front_0.jpg"
        ),
        await image.loadFromURL(
          "https://raw.githubusercontent.com/KhronosGroup/glTF-WebGL-PBR/master/textures/papermill/specular/specular_back_0.jpg"
        )
      );

      // Create state
      return {
        camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
        input: input,
        lights: functional.range(3, () => ({
          position: { x: 0, y: 0, z: 0 },
        })),
        meshes: {
          ground: webgl.loadMesh(gl, groundMesh),
          helmet: webgl.loadMesh(gl, helmetMesh),
          light: webgl.loadMesh(gl, lightMesh),
        },
        move: 0,
        pipelines: {
          lights: bitfield.enumerate(getOptions(tweak)).map(
            (flags) =>
              new forwardLighting.ForwardLightingPipeline(gl, {
                light: {
                  model: forwardLighting.ForwardLightingModel.Physical,
                  modelPhysicalNoAmbient: !flags[0],
                  modelPhysicalNoIBL: !flags[3],
                  maxPointLights: 3,
                  noShadow: true,
                },
                material: {
                  forceEmissiveMap: flags[1] ? undefined : false,
                  forceHeightMap: flags[4] ? undefined : false,
                  forceNormalMap: flags[5] ? undefined : false,
                  forceOcclusionMap: flags[2] ? undefined : false,
                },
              })
          ),
        },
        projectionMatrix: Matrix4.createPerspective(
          45,
          screen.getRatio(),
          0.1,
          100
        ),
        target: new webgl.Target(gl, screen.getWidth(), screen.getHeight()),
        textures: {
          brdf: brdf,
          diffuse: diffuse,
          specular: specular,
        },
        tweak: tweak,
      };
    }
  );

const render = (state: SceneState) => {
  const camera = state.camera;
  const lightPositions = state.lights
    .slice(0, state.tweak.nbLights)
    .map((light) => light.position);
  const meshes = state.meshes;
  const pipelines = state.pipelines;
  const target = state.target;

  const cameraView = Matrix4.createIdentity()
    .translate(camera.position)
    .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
    .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

  // Draw scene
  target.clear(0);

  // PBR render
  const cube = {
    matrix: Matrix4.createIdentity(),
    mesh: meshes.helmet,
  };

  const ground = {
    matrix: Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
    mesh: meshes.ground,
  };

  const lights = lightPositions.map((position) => ({
    matrix: Matrix4.createIdentity().translate(position),
    mesh: meshes.light,
  }));

  const scene = {
    ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
    environmentLight: {
      brdf: state.textures.brdf,
      diffuse: state.textures.diffuse,
      specular: state.textures.specular,
    },
    pointLights: lightPositions.map((position) => ({
      color: { x: 1, y: 1, z: 1 },
      position: position,
      radius: 5,
    })),
    subjects: [cube, ground].concat(lights),
  };

  pipelines.lights[bitfield.index(getOptions(state.tweak))].process(
    target,
    {
      projectionMatrix: state.projectionMatrix,
      viewMatrix: cameraView,
    },
    scene
  );
};

const resize = (state: SceneState, screen: display.WebGLScreen) => {
  for (const pipeline of state.pipelines.lights)
    pipeline.resize(screen.getWidth(), screen.getHeight());

  state.projectionMatrix = Matrix4.createPerspective(
    45,
    screen.getRatio(),
    0.1,
    100
  );
  state.target.resize(screen.getWidth(), screen.getHeight());
};

const update = (state: SceneState, dt: number) => {
  // Update light positions
  if (state.tweak.animate) state.move += dt * 0.0001;

  for (let i = 0; i < state.lights.length; ++i)
    state.lights[i].position = move.orbitate(i, state.move * 5, 3, 1);

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
