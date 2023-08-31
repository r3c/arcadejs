import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import { Memo, indexBooleans, memoize } from "../../engine/language/memo";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadFromURL } from "../../engine/graphic/image";
import {
  loadModelFromGltf,
  loadModelFromJson,
} from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import {
  GlTarget,
  createRuntime,
  loadTextureCube,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import { orbitatePosition } from "../move";
import { Camera } from "../view";
import {
  ForwardLightingLightModel,
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { GlModel, loadModel } from "../../engine/graphic/webgl/model";
import { GlTexture } from "../../engine/graphic/webgl/texture";

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
  useEmissive: true,
  useOcclusion: true,
  useIBL: true,
  useHeightMap: true,
  useNormalMap: true,
};

type Light = {
  position: Vector3;
};

type ApplicationState = {
  camera: Camera;
  input: Input;
  lights: Light[];
  models: {
    ground: GlModel;
    helmet: GlModel;
    light: GlModel;
  };
  move: number;
  projectionMatrix: Matrix4;
  rendererMemo: Memo<boolean[], ForwardLightingRenderer>;
  target: GlTarget;
  textures: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
  tweak: Tweak<typeof configuration>;
};

const getOptions = (tweak: Tweak<typeof configuration>) => [
  tweak.useAmbient !== 0,
  tweak.useEmissive !== 0,
  tweak.useOcclusion !== 0,
  tweak.useIBL !== 0,
  tweak.useHeightMap !== 0,
  tweak.useNormalMap !== 0,
];

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getWidth(), screen.getHeight());
    const tweak = configure(configuration);

    // Load meshes
    const groundModel = await loadModelFromJson("model/ground/mesh.json");
    const helmetModel = await loadModelFromGltf(
      "model/damaged-helmet/DamagedHelmet.gltf",
      {
        transform: Matrix4.fromCustom(
          ["rotate", { x: 0, y: 1, z: 0 }, Math.PI],
          ["rotate", { x: 1, y: 0, z: 0 }, -Math.PI * 0.5]
        ),
      }
    );
    const lightModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.2, y: 0.2, z: 0.2 }]),
    });

    // Load textures
    const brdf = loadTextureQuad(
      gl,
      await loadFromURL("model/ibl/ibl_brdf_lut.webp")
    );

    const diffuse = loadTextureCube(
      gl,
      await loadFromURL("model/papermill/diffuse_right_0.jpg"),
      await loadFromURL("model/papermill/diffuse_left_0.jpg"),
      await loadFromURL("model/papermill/diffuse_top_0.jpg"),
      await loadFromURL("model/papermill/diffuse_bottom_0.jpg"),
      await loadFromURL("model/papermill/diffuse_front_0.jpg"),
      await loadFromURL("model/papermill/diffuse_back_0.jpg")
    );

    const specular = loadTextureCube(
      gl,
      await loadFromURL("model/papermill/specular_right_0.jpg"),
      await loadFromURL("model/papermill/specular_left_0.jpg"),
      await loadFromURL("model/papermill/specular_top_0.jpg"),
      await loadFromURL("model/papermill/specular_bottom_0.jpg"),
      await loadFromURL("model/papermill/specular_front_0.jpg"),
      await loadFromURL("model/papermill/specular_back_0.jpg")
    );

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
      input: new Input(screen.canvas),
      lights: range(3).map(() => ({
        position: { x: 0, y: 0, z: 0 },
      })),
      models: {
        ground: loadModel(gl, groundModel),
        helmet: loadModel(gl, helmetModel),
        light: loadModel(gl, lightModel),
      },
      move: 0,
      projectionMatrix: Matrix4.identity,
      rendererMemo: memoize(
        indexBooleans,
        (flags) =>
          new ForwardLightingRenderer(runtime, target, {
            light: {
              model: ForwardLightingLightModel.Physical,
              modelPhysicalNoAmbient: !flags[0],
              modelPhysicalNoIBL: !flags[3],
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
      target,
      textures: {
        brdf,
        diffuse,
        specular,
      },
      tweak,
    };
  },

  render(state) {
    const {
      camera,
      models,
      projectionMatrix,
      rendererMemo,
      target,
      textures,
      tweak,
    } = state;

    const lightPositions = state.lights
      .slice(0, tweak.nbLights)
      .map((light) => light.position);

    const viewMatrix = Matrix4.fromCustom(
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    // Draw scene
    target.clear(0);

    // PBR render
    const cube = {
      matrix: Matrix4.identity,
      model: models.helmet,
      noShadow: false,
    };

    const ground = {
      matrix: Matrix4.fromCustom(["translate", { x: 0, y: -1.5, z: 0 }]),
      model: models.ground,
      noShadow: false,
    };

    const lights = lightPositions.map((position) => ({
      matrix: Matrix4.fromCustom(["translate", position]),
      model: models.light,
      noShadow: true,
    }));

    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
      environmentLight: {
        brdf: textures.brdf,
        diffuse: textures.diffuse,
        specular: textures.specular,
      },
      objects: [cube, ground].concat(lights),
      pointLights: lightPositions.map((position) => ({
        color: { x: 1, y: 1, z: 1 },
        position,
        radius: 5,
      })),
      projectionMatrix,
      viewMatrix,
    };

    rendererMemo.get(getOptions(tweak)).render(scene);
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
      state.move += dt * 0.0001;
    }

    for (let i = 0; i < state.lights.length; ++i) {
      state.lights[i].position = orbitatePosition(state.move * 5, i, 1, 3);
    }

    // Move camera
    state.camera.move(state.input, dt);
  },
};

const process = declare("Forward PBR lighting", WebGLScreen, application);

export { process };
