import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import * as bitfield from "../bitfield";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/functional";
import * as image from "../../engine/graphic/image";
import {
  loadModelFromGltf,
  loadModelFromJson,
} from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import {
  GlModel,
  GlPolygon,
  GlScene,
  GlTarget,
  createRuntime,
  loadModel,
  loadTextureCube,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import { orbitatePosition } from "../move";
import { Camera } from "../view";
import {
  ForwardLightingRenderer,
  ForwardLightingLightModel,
  SceneState,
  ForwardLightingObject,
} from "../../engine/graphic/webgl/renderers/forward-lighting";

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
    ground: GlModel<GlPolygon>;
    helmet: GlModel<GlPolygon>;
    light: GlModel<GlPolygon>;
  };
  move: number;
  projectionMatrix: Matrix4;
  renderers: {
    lights: ForwardLightingRenderer[];
  };
  target: GlTarget;
  textures: {
    brdf: WebGLTexture;
    diffuse: WebGLTexture;
    specular: WebGLTexture;
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
      await image.loadFromURL("model/ibl/ibl_brdf_lut.webp")
    );

    const diffuse = loadTextureCube(
      gl,
      await image.loadFromURL("model/papermill/diffuse_right_0.jpg"),
      await image.loadFromURL("model/papermill/diffuse_left_0.jpg"),
      await image.loadFromURL("model/papermill/diffuse_top_0.jpg"),
      await image.loadFromURL("model/papermill/diffuse_bottom_0.jpg"),
      await image.loadFromURL("model/papermill/diffuse_front_0.jpg"),
      await image.loadFromURL("model/papermill/diffuse_back_0.jpg")
    );

    const specular = loadTextureCube(
      gl,
      await image.loadFromURL("model/papermill/specular_right_0.jpg"),
      await image.loadFromURL("model/papermill/specular_left_0.jpg"),
      await image.loadFromURL("model/papermill/specular_top_0.jpg"),
      await image.loadFromURL("model/papermill/specular_bottom_0.jpg"),
      await image.loadFromURL("model/papermill/specular_front_0.jpg"),
      await image.loadFromURL("model/papermill/specular_back_0.jpg")
    );

    // Create state
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
      input: new Input(screen.canvas),
      lights: range(3, () => ({
        position: { x: 0, y: 0, z: 0 },
      })),
      models: {
        ground: loadModel(runtime, groundModel),
        helmet: loadModel(runtime, helmetModel),
        light: loadModel(runtime, lightModel),
      },
      move: 0,
      projectionMatrix: Matrix4.identity,
      renderers: {
        lights: bitfield.enumerate(getOptions(tweak)).map(
          (flags) =>
            new ForwardLightingRenderer(runtime, {
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
      },
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
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
      renderers,
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

    const scene: GlScene<SceneState, ForwardLightingObject> = {
      state: {
        ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
        environmentLight: {
          brdf: textures.brdf,
          diffuse: textures.diffuse,
          specular: textures.specular,
        },
        pointLights: lightPositions.map((position) => ({
          color: { x: 1, y: 1, z: 1 },
          position,
          radius: 5,
        })),
        projectionMatrix,
        viewMatrix,
      },
      objects: [cube, ground].concat(lights),
    };

    renderers.lights[bitfield.index(getOptions(tweak))].render(target, scene);
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
      state.move += dt * 0.0001;
    }

    for (let i = 0; i < state.lights.length; ++i) {
      state.lights[i].position = orbitatePosition(state.move * 5, i, 1, 3);
    }

    // Move camera
    state.camera.move(state.input);
  },
};

const process = declare("Forward PBR lighting", WebGLScreen, application);

export { process };
