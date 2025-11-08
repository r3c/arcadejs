import {
  type Application,
  ApplicationConfigurator,
  createCheckbox,
  createSelect,
  declare,
} from "../../engine/application";
import { Gamepad, Pointer } from "../../engine/io/gamepad";
import { type Screen, createWebGLScreen } from "../../engine/graphic/screen";
import { range } from "../../engine/language/iterable";
import { loadFromURL } from "../../engine/graphic/image";
import { loadMeshFromGltf, loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { Vector2, Vector3 } from "../../engine/math/vector";
import {
  createRuntime,
  createScreenTarget,
  loadTextureCube,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import { createOrbitMover } from "../move";
import {
  createModel,
  createDynamicMesh,
} from "../../engine/graphic/webgl/model";
import { createOrbitCamera } from "../../engine/stage/camera";
import {
  createForwardLightingRenderer,
  ForwardLightingLightModel,
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/renderer";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const configurator = {
  nbLights: createSelect("nbLights", ["0", "1", "2", "3"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightEmissive: createCheckbox("emissive", true),
  useOcclusion: createCheckbox("occlusion", true),
  useIBL: createCheckbox("IBL", true),
  useHeightMap: createCheckbox("hMap", true),
  useNormalMap: createCheckbox("nMap", true),
};

type Configuration = typeof configurator extends ApplicationConfigurator<
  infer T
>
  ? T
  : never;

const createApplication = async (
  screen: Screen<WebGL2RenderingContext>,
  gamepad: Gamepad
): Promise<Application<Configuration>> => {
  const gl = screen.getContext();
  const runtime = createRuntime(gl);
  const target = createScreenTarget(gl);

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
  const camera = createOrbitCamera(
    {
      getRotate: () => gamepad.fetchMove(Pointer.Grab),
      getMove: () => gamepad.fetchMove(Pointer.Drag),
      getZoom: () => gamepad.fetchZoom(),
    },
    { x: 0, y: 0, z: -5 },
    Vector2.zero
  );
  const models = {
    ground: createModel(gl, groundMesh),
    helmet: createModel(gl, helmetMesh),
    light: createModel(gl, lightMesh),
  };
  const projection = Matrix4.fromIdentity();
  const textures = {
    brdf,
    diffuse,
    specular,
  };

  let lightTransforms: MutableMatrix4[] = [];
  let move = false;
  let renderer: ForwardLightingRenderer | undefined = undefined;
  let time = 0;

  return {
    async change(configuration) {
      renderer?.release();

      const newRenderer = createForwardLightingRenderer(runtime, {
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

      newRenderer.append({ mesh: models.helmet.mesh });

      const ground = createDynamicMesh(models.ground.mesh);

      newRenderer.append({ mesh: ground.mesh });

      ground.transform.translate({ x: 0, y: -1.5, z: 0 });

      lightTransforms = range(configuration.nbLights).map(() => {
        const { mesh, transform } = createDynamicMesh(models.light.mesh);

        newRenderer.append({ mesh, noShadow: true });

        return transform;
      });

      move = configuration.move;
      renderer = newRenderer;
    },

    release() {
      models.ground.release();
      models.helmet.release();
      models.light.release();
      renderer?.release();
      runtime.release();
    },

    render() {
      // Draw scene
      target.clear();

      // PBR render
      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0.5, y: 0.5, z: 0.5 },
        environmentLight: {
          brdf: textures.brdf,
          diffuse: textures.diffuse,
          specular: textures.specular,
        },
        pointLights: lights
          .slice(0, lightTransforms.length)
          .map(({ position }) => ({
            color: { x: 1, y: 1, z: 1 },
            position,
            radius: 5,
          })),
        projection,
        view: camera.viewMatrix,
      };

      renderer?.render(target, scene);
    },

    resize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      renderer?.resize(size);
      target.setSize(size);
    },

    update(dt) {
      // Update light positions
      for (let i = 0; i < lightTransforms.length; ++i) {
        const { mover, position } = lights[i];
        const transform = lightTransforms[i];

        position.set(mover(Vector3.zero, time * 0.0005));

        transform.set(Matrix4.identity);
        transform.translate(position);
      }

      // Move camera
      camera.update(dt);

      time += move ? dt : 0;
    },
  };
};

const process = declare(
  "Forward PBR lighting",
  createWebGLScreen,
  createApplication,
  configurator
);

export { process };
