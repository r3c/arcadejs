import {
  type Application,
  ApplicationConfigurator,
  createCheckbox,
  createSelect,
  declare,
} from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadFromURL } from "../../engine/graphic/image";
import { loadMeshFromGltf, loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector2, Vector3 } from "../../engine/math/vector";
import {
  GlRuntime,
  GlTarget,
  createRuntime,
  loadTextureCube,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import { Mover, createOrbitMover } from "../move";
import { createModel, GlModel } from "../../engine/graphic/webgl/model";
import { GlTexture } from "../../engine/graphic/webgl/texture";
import { Camera, createOrbitCamera } from "../../engine/stage/camera";
import {
  createForwardLightingRenderer,
  ForwardLightingLightModel,
  ForwardLightingRenderer,
  ForwardLightingScene,
  RendererSubject,
} from "../../engine/graphic/renderer";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const configuration = {
  nbLights: createSelect("nbLights", ["0", "1", "2", "3"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightEmissive: createCheckbox("emissive", true),
  useOcclusion: createCheckbox("occlusion", true),
  useIBL: createCheckbox("IBL", true),
  useHeightMap: createCheckbox("hMap", true),
  useNormalMap: createCheckbox("nMap", true),
};

type Light = {
  mover: Mover;
  position: MutableVector3;
};

type ApplicationState = {
  camera: Camera;
  lights: Light[];
  lightSubjects: RendererSubject[];
  models: {
    ground: GlModel;
    helmet: GlModel;
    light: GlModel;
  };
  move: boolean;
  projectionMatrix: Matrix4;
  renderer: ForwardLightingRenderer | undefined;
  runtime: GlRuntime;
  target: GlTarget;
  textures: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
  time: number;
};

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration extends ApplicationConfigurator<infer T> ? T : never
> = {
  async create(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getSize());

    // Load meshes
    const groundMesh = await loadMeshFromJson("model/ground/mesh.json");

    const helmetMesh = await loadMeshFromGltf(
      "model/damaged-helmet/DamagedHelmet.gltf",
      {
        transform: Matrix4.fromSource(
          Matrix4.identity,
          ["rotate", { x: 0, y: 1, z: 0 }, Math.PI],
          ["rotate", { x: 1, y: 0, z: 0 }, -Math.PI * 0.5]
        ),
      }
    );

    const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.2, y: 0.2, z: 0.2 },
      ]),
    });

    const lights = range(3).map((i) => ({
      mover: createOrbitMover(i, 1, 3, 1),
      position: Vector3.fromZero(),
    }));

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
      camera: createOrbitCamera(
        {
          getRotate: () => input.fetchMove(Pointer.Grab),
          getMove: () => input.fetchMove(Pointer.Drag),
          getZoom: () => input.fetchZoom(),
        },
        { x: 0, y: 0, z: -5 },
        Vector2.zero
      ),
      lights,
      lightSubjects: [],
      models: {
        ground: createModel(gl, groundMesh),
        helmet: createModel(gl, helmetMesh),
        light: createModel(gl, lightMesh),
      },
      move: false,
      projectionMatrix: Matrix4.identity,
      renderer: undefined,
      runtime,
      target,
      textures: {
        brdf,
        diffuse,
        specular,
      },
      time: 0,
    };
  },

  async change(state, configuration) {
    const { models, runtime, target } = state;

    state.renderer?.dispose();

    const renderer = createForwardLightingRenderer(runtime, target, {
      maxPointLights: 3,
      lightModel: ForwardLightingLightModel.Physical,
      lightModelPhysicalNoAmbient: !configuration.lightAmbient,
      lightModelPhysicalNoIBL: !configuration.useIBL,
      noEmissiveMap: !configuration.lightEmissive,
      noHeightMap: !configuration.useHeightMap,
      noNormalMap: !configuration.useNormalMap,
      noOcclusionMap: !configuration.useOcclusion,
      noShadow: true,
    });

    renderer.register({ model: models.helmet });

    const groundSubject = renderer.register({ model: models.ground });

    groundSubject.transform.translate({ x: 0, y: -1.5, z: 0 });

    const lightSubjects = range(configuration.nbLights).map(() =>
      renderer.register({ model: models.light, noShadow: true })
    );

    state.lightSubjects = lightSubjects;
    state.move = configuration.move;
    state.renderer = renderer;
  },

  render(state) {
    const {
      camera,
      lights,
      lightSubjects,
      projectionMatrix,
      renderer,
      target,
      textures,
    } = state;

    // Draw scene
    target.clear(0);

    // PBR render
    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
      environmentLight: {
        brdf: textures.brdf,
        diffuse: textures.diffuse,
        specular: textures.specular,
      },
      pointLights: lights
        .slice(0, lightSubjects.length)
        .map(({ position }) => ({
          color: { x: 1, y: 1, z: 1 },
          position,
          radius: 5,
        })),
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
    };

    renderer?.render(scene);
  },

  resize(state, size) {
    const { renderer, target } = state;

    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);

    renderer?.resize(size);
    target.resize(size);
  },

  update(state, dt) {
    const { camera, lights, lightSubjects, move, time } = state;

    // Update light positions
    for (let i = 0; i < lightSubjects.length; ++i) {
      const { mover, position } = lights[i];
      const subject = lightSubjects[i];

      position.set(mover(Vector3.zero, time * 0.0005));

      subject.transform.set(Matrix4.identity);
      subject.transform.translate(position);
    }

    // Move camera
    camera.update(dt);

    state.time += move ? dt : 0;
  },
};

const process = declare(
  "Forward PBR lighting",
  WebGLScreen,
  configuration,
  application
);

export { process };
