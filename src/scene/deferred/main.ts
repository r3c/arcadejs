import {
  type Application,
  ApplicationConfigurator,
  createCheckbox,
  createSelect,
  declare,
} from "../../engine/application";
import { Gamepad, Pointer } from "../../engine/io/gamepad";
import {
  DeferredLightingLightModel,
  DeferredLightingRenderer,
  DeferredLightingScene,
  DeferredShadingLightModel,
  DeferredShadingRenderer,
  createDeferredLightingRenderer,
  createDeferredShadingRenderer,
} from "../../engine/graphic/renderer";
import { type Screen, createWebGLScreen } from "../../engine/graphic/screen";
import { range } from "../../engine/language/iterable";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { Vector2, Vector3 } from "../../engine/math/vector";
import { createRuntime, createScreenTarget } from "../../engine/graphic/webgl";
import { createCircleMover, createOrbitMover } from "../move";
import { brightColor } from "../../engine/graphic/color";
import {
  createModel,
  createDynamicMesh,
} from "../../engine/graphic/webgl/model";
import { GlTexture } from "../../engine/graphic/webgl/texture";
import { createOrbitCamera } from "../../engine/stage/camera";
import {
  createGlEncodingPainter,
  GlEncodingChannel,
  GlEncodingFormat,
  GlEncodingPainter,
} from "../../engine/graphic/painter";

/*
 ** What changed?
 */

const configurator = {
  technique: createSelect(
    "technique",
    ["Deferred shading", "Deferred lighting"],
    0
  ),
  nbDirectionalLights: createSelect("dLights", ["0", "1", "2", "5"], 0),
  nbPointLights: createSelect("pLights", ["0", "20", "100", "500", "2000"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightDiffuse: createCheckbox("diffuse", true),
  lightSpecular: createCheckbox("specular", true),
  debugMode: createSelect(
    "debug",
    [
      "None",
      "Depth",
      "Diffuse (DS)",
      "Normal",
      "Shininess",
      "Glossiness",
      "Diffuse light (DL)",
      "Specular light (DL)",
    ],
    0
  ),
};

const debugConfigurations = [
  {
    channel: GlEncodingChannel.Red,
    format: GlEncodingFormat.Depth,
  },
  {
    channel: GlEncodingChannel.RedGreenBlue,
    format: GlEncodingFormat.LinearRGB,
  },
  {
    channel: GlEncodingChannel.RedGreen,
    format: GlEncodingFormat.Spheremap,
  },
  {
    channel: GlEncodingChannel.Blue,
    format: GlEncodingFormat.Monochrome,
  },
  {
    channel: GlEncodingChannel.Blue,
    format: GlEncodingFormat.Monochrome,
  },
  {
    channel: GlEncodingChannel.RedGreenBlue,
    format: GlEncodingFormat.Log2RGB,
  },
  {
    channel: GlEncodingChannel.Alpha,
    format: GlEncodingFormat.Log2RGB,
  },
];

const directionalLightParameters = [
  { count: 0 },
  { count: 1 },
  { count: 2 },
  { count: 5 },
];

const pointLightParameters = [
  { count: 0, radius: 0 },
  { count: 20, radius: 4 },
  { count: 100, radius: 2 },
  { count: 500, radius: 1 },
  { count: 2000, radius: 1 },
];

type DeferredRenderer = DeferredLightingRenderer | DeferredShadingRenderer;

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
  const cubeModel = await loadMeshFromJson("model/cube/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      { x: 0.4, y: 0.4, z: 0.4 },
    ]),
  });
  const directionalLightModel = await loadMeshFromJson(
    "model/sphere/mesh.json",
    {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.5, y: 0.5, z: 0.5 },
      ]),
    }
  );
  const groundModel = await loadMeshFromJson("model/ground/mesh.json");
  const pointLightModel = await loadMeshFromJson("model/sphere/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      { x: 0.1, y: 0.1, z: 0.1 },
    ]),
  });

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
  const allDirectionalLights = range(10).map((i) => ({
    color: brightColor(i),
    direction: Vector3.fromZero(),
    mover: createCircleMover(i),
    shadow: false,
  }));
  const models = {
    cube: createModel(gl, cubeModel),
    directionalLight: createModel(gl, directionalLightModel),
    ground: createModel(gl, groundModel),
    pointLight: createModel(gl, pointLightModel),
  };
  const allPointLights = range(2000).map((i) => ({
    color: brightColor(i),
    mover: createOrbitMover(i, 1, 5, 1),
    position: Vector3.fromZero(),
    radius: 0,
  }));
  const projection = Matrix4.fromIdentity();

  let encodingPainter: GlEncodingPainter | undefined = undefined;
  let encodingTexture: GlTexture | undefined = undefined;
  let directionalLights: typeof allDirectionalLights;
  let directionalLightTransforms: MutableMatrix4[] = [];
  let move = false;
  let pointLights: typeof allPointLights;
  let pointLightTransforms: MutableMatrix4[] = [];
  let sceneRenderer: DeferredRenderer | undefined = undefined;
  let time = 0;

  return {
    async setConfiguration(configuration) {
      encodingPainter?.release();
      sceneRenderer?.release();

      encodingPainter =
        configuration.debugMode !== 0
          ? createGlEncodingPainter(runtime, {
              channel: debugConfigurations[configuration.debugMode - 1].channel,
              format: debugConfigurations[configuration.debugMode - 1].format,
              zNear: 0.1,
              zFar: 100,
            })
          : undefined;

      let newRenderer: DeferredRenderer;

      switch (configuration.technique) {
        case 0:
        default:
          {
            const renderer = createDeferredShadingRenderer(runtime, {
              lightModel: DeferredShadingLightModel.Phong,
              lightModelPhongNoAmbient: !configuration.lightAmbient,
              lightModelPhongNoDiffuse: !configuration.lightDiffuse,
              lightModelPhongNoSpecular: !configuration.lightSpecular,
            });

            encodingTexture =
              configuration.debugMode !== 0
                ? [
                    renderer.depthBuffer,
                    renderer.diffuseAndShininessBuffer,
                    renderer.normalAndSpecularBuffer,
                    renderer.diffuseAndShininessBuffer,
                    renderer.normalAndSpecularBuffer,
                  ][configuration.debugMode - 1]
                : undefined;
            newRenderer = renderer;
          }

          break;

        case 1:
          {
            const renderer = createDeferredLightingRenderer(runtime, {
              lightModel: DeferredLightingLightModel.Phong,
              lightModelPhongNoAmbient: !configuration.lightAmbient,
              lightModelPhongNoDiffuse: !configuration.lightDiffuse,
              lightModelPhongNoSpecular: !configuration.lightSpecular,
            });

            encodingTexture =
              configuration.debugMode !== 0
                ? [
                    renderer.depthBuffer,
                    undefined,
                    renderer.normalAndGlossBuffer,
                    renderer.normalAndGlossBuffer,
                    renderer.normalAndGlossBuffer,
                    renderer.lightBuffer,
                    renderer.lightBuffer,
                  ][configuration.debugMode - 1]
                : undefined;
            newRenderer = renderer;
          }

          break;
      }

      newRenderer.setSize(screen.getSize());

      // Register cube subjects
      for (const i of range(16)) {
        const cube = createDynamicMesh(models.cube.mesh);

        newRenderer.addSubject({ mesh: cube.mesh });

        cube.transform.translate({
          x: ((i % 4) - 1.5) * 2,
          y: 0,
          z: (Math.floor(i / 4) - 1.5) * 2,
        });
      }

      // Register ground subject
      const ground = createDynamicMesh(models.ground.mesh);

      newRenderer.addSubject({ mesh: ground.mesh });

      ground.transform.translate({ x: 0, y: -1.5, z: 0 });

      // Update lights & light subjects
      const directionalLightParameter =
        directionalLightParameters[configuration.nbDirectionalLights];
      const pointLightParameter =
        pointLightParameters[configuration.nbPointLights];

      for (const pointLight of allPointLights) {
        pointLight.radius = pointLightParameter.radius;
      }

      directionalLights = allDirectionalLights.slice(
        0,
        directionalLightParameter.count
      );
      directionalLightTransforms = range(directionalLights.length).map(() => {
        const { mesh, transform } = createDynamicMesh(
          models.directionalLight.mesh
        );

        newRenderer.addSubject({ mesh });

        return transform;
      });
      pointLights = allPointLights.slice(0, pointLightParameter.count);
      pointLightTransforms = range(pointLights.length).map(() => {
        const { mesh, transform } = createDynamicMesh(models.pointLight.mesh);

        newRenderer.addSubject({ mesh });

        return transform;
      });

      move = configuration.move;
      sceneRenderer = newRenderer;
    },

    release() {
      encodingPainter?.release();
      encodingTexture?.release();
      models.cube.release();
      models.directionalLight.release();
      models.ground.release();
      models.pointLight.release();
      runtime.release();
      sceneRenderer?.release();
    },

    render() {
      // Clear screen
      target.clear();

      // Draw scene
      const scene: DeferredLightingScene = {
        ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
        directionalLights,
        pointLights,
        projection,
        view: camera.viewMatrix,
      };

      sceneRenderer?.render(target, scene);

      // Draw debug
      if (encodingTexture !== undefined) {
        encodingPainter?.paint(target, encodingTexture);
      }
    },

    setSize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      sceneRenderer?.setSize(size);
      target.setSize(size);
    },

    update(dt) {
      for (let i = 0; i < directionalLights.length; ++i) {
        const { direction, mover } = directionalLights[i];
        const transform = directionalLightTransforms[i];

        direction.set(mover(Vector3.zero, time * 0.001));
        direction.normalize();
        direction.scale(10);

        transform.set(Matrix4.identity);
        transform.translate(direction);
      }

      for (let i = 0; i < pointLights.length; ++i) {
        const { mover, position } = pointLights[i];
        const transform = pointLightTransforms[i];

        position.set(mover(Vector3.zero, time * 0.0002));

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
  "Deferred rendering",
  createWebGLScreen,
  createApplication,
  configurator
);

export { process };
