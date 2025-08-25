import {
  type Application,
  type ApplicationSetup,
  createCheckbox,
  createSelect,
  declare,
} from "../../engine/application";
import {
  Memo,
  createBooleansIndexer,
  memoize,
} from "../../engine/language/memo";
import { Input, Pointer } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadFromURL } from "../../engine/graphic/image";
import { loadMeshFromGltf, loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector2, Vector3 } from "../../engine/math/vector";
import {
  GlTarget,
  createRuntime,
  loadTextureCube,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import { Mover, createOrbitMover } from "../move";
import { createModel } from "../../engine/graphic/webgl/model";
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
  lightSubjects: RendererSubject[][];
  time: number;
  projectionMatrix: Matrix4;
  rendererMemo: Memo<boolean[], ForwardLightingRenderer>;
  setup: ApplicationSetup<typeof configuration>;
  target: GlTarget;
  textures: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
};

const getOptions = (tweak: ApplicationSetup<typeof configuration>) => [
  tweak.lightAmbient,
  tweak.lightEmissive,
  tweak.useOcclusion,
  tweak.useIBL,
  tweak.useHeightMap,
  tweak.useNormalMap,
];

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration
> = {
  async create(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getSize());

    // Load meshes
    const groundMesh = await loadMeshFromJson("model/ground/mesh.json");
    const groundModel = createModel(gl, groundMesh);

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
    const helmetModel = createModel(gl, helmetMesh);

    const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.2, y: 0.2, z: 0.2 },
      ]),
    });
    const lightModel = createModel(gl, lightMesh);
    const lights = range(3).map((i) => ({
      mover: createOrbitMover(i, 1, 3, 1),
      position: Vector3.fromZero(),
    }));
    const lightSubjects = range(lights.length).map<RendererSubject[]>(() => []);

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
      lightSubjects,
      projectionMatrix: Matrix4.identity,
      rendererMemo: memoize(createBooleansIndexer(6), (flags) => {
        const renderer = createForwardLightingRenderer(runtime, target, {
          maxPointLights: 3,
          lightModel: ForwardLightingLightModel.Physical,
          lightModelPhysicalNoAmbient: !flags[0],
          lightModelPhysicalNoIBL: !flags[3],
          noEmissiveMap: !flags[1],
          noHeightMap: !flags[4],
          noNormalMap: !flags[5],
          noOcclusionMap: !flags[2],
          noShadow: true,
        });

        renderer.register({ model: helmetModel });

        const groundSubject = renderer.register({ model: groundModel });

        groundSubject.transform.translate({ x: 0, y: -1.5, z: 0 });

        // FIXME: only .slice(0, tweak.nbLights) lights should be registered
        for (const subjects of lightSubjects) {
          subjects.push(
            renderer.register({ model: lightModel, noShadow: true })
          );
        }

        return renderer;
      }),
      setup: {} as any,
      target,
      textures: {
        brdf,
        diffuse,
        specular,
      },
      time: 0,
    };
  },

  async change(state, setup) {
    state.setup = setup;
  },

  render(state) {
    const { camera, projectionMatrix, rendererMemo, setup, target, textures } =
      state;

    const lightPositions = state.lights
      .slice(0, setup.nbLights)
      .map((light) => light.position);

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
      pointLights: lightPositions.map((position) => ({
        color: { x: 1, y: 1, z: 1 },
        position,
        radius: 5,
      })),
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
    };

    rendererMemo.get(getOptions(setup)).render(scene);
  },

  resize(state, size) {
    const { rendererMemo, setup, target } = state;

    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);

    rendererMemo.get(getOptions(setup)).resize(size);
    target.resize(size);
  },

  update(state, dt) {
    const { camera, lights, lightSubjects, setup, time } = state;

    // Update light positions
    for (let i = 0; i < lights.length; ++i) {
      const { mover, position } = lights[i];
      const subjects = lightSubjects[i];

      position.set(mover(Vector3.zero, time * 0.0005));

      for (const { transform } of subjects) {
        transform.set(Matrix4.identity);
        transform.translate(position);
      }
    }

    // Move camera
    camera.update(dt);

    state.time += setup.move ? dt : 0;
  },
};

const process = declare(
  "Forward PBR lighting",
  WebGLScreen,
  configuration,
  application
);

export { process };
