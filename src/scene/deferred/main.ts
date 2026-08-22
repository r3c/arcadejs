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
import { Releasable } from "../../engine/io/resource";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { Vector2, Vector3 } from "../../engine/math/vector";
import { createRuntime } from "../../engine/graphic/webgl";
import { createScreenTarget } from "../../engine/graphic/webgl/target";
import { createCircleMover, createOrbitMover } from "../move";
import { brightColor } from "../../engine/graphic/color";
import {
  createModel,
  createDynamicMesh,
} from "../../engine/graphic/webgl/model";
import { GlTexture } from "../../engine/graphic/webgl/texture";
import { createOrbitCamera } from "../../engine/stage/camera";
import {
  GlEncodingChannel,
  GlEncodingFormat,
  GlEncodingRenderer,
  createGlEncodingRenderer,
} from "../../engine/graphic/renderer";
import { GlEncodingSource } from "../../engine/graphic/renderer/gl-encoding";

/*
 ** What changed?
 */

const configurator = {
  move: createCheckbox("Animate", true),
  technique: createSelect(
    "Technique",
    ["Deferred shading", "Deferred lighting"],
    0,
  ),
  nbDirectionalLights: createSelect(
    "Nb of Directional Lights",
    ["0", "1", "2", "5"],
    0,
  ),
  nbPointLights: createSelect(
    "Nb of Point Lights",
    ["0", "20", "100", "500", "2000"],
    1,
  ),
  lightAmbient: createCheckbox("Ambient Light", true),
  lightDiffuse: createCheckbox("Diffuse Light", true),
  lightSpecular: createCheckbox("Specular Light", true),
  debugMode: createSelect(
    "Show debug buffer",
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
    0,
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

type Configuration =
  typeof configurator extends ApplicationConfigurator<infer T> ? T : never;

const allDirectionalLights = range(10).map((i) => ({
  color: brightColor(i),
  direction: Vector3.fromZero(),
  mover: createCircleMover(i),
  shadow: false,
}));

const allPointLights = range(2000).map((i) => ({
  color: brightColor(i),
  mover: createOrbitMover(i, 1, 5, 1),
  position: Vector3.fromZero(),
  radius: 0,
  shadow: false,
}));

type State = Releasable & {
  directionalLights: typeof allDirectionalLights;
  directionalLightTransforms: MutableMatrix4[];
  encodingRenderer: GlEncodingRenderer | undefined;
  encodingTexture: GlTexture | undefined;
  move: boolean;
  pointLights: typeof allPointLights;
  pointLightTransforms: MutableMatrix4[];
  sceneRenderer: DeferredRenderer;
};

const createApplication = async (
  screen: Screen<WebGL2RenderingContext>,
  gamepad: Gamepad,
): Promise<Application<Configuration, State>> => {
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
    },
  );
  const groundModel = await loadMeshFromJson("model/stand/ground.json");
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
    Vector2.zero,
  );
  const models = {
    cube: createModel(gl, cubeModel),
    directionalLight: createModel(gl, directionalLightModel),
    ground: createModel(gl, groundModel),
    pointLight: createModel(gl, pointLightModel),
  };
  const projection = Matrix4.fromIdentity();

  let time = 0;

  return {
    async configure(configuration) {
      const encodingRenderer =
        configuration.debugMode !== 0
          ? createGlEncodingRenderer(runtime, {
              channel: debugConfigurations[configuration.debugMode - 1].channel,
              format: debugConfigurations[configuration.debugMode - 1].format,
              source: GlEncodingSource.Quad,
              zNear: 0.1,
              zFar: 100,
            })
          : undefined;

      let encodingTexture: GlTexture | undefined = undefined;
      let sceneRenderer: DeferredRenderer;

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
            sceneRenderer = renderer;
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
            sceneRenderer = renderer;
          }

          break;
      }

      sceneRenderer.setSize(screen.getSize());

      // Register cube subjects
      for (const i of range(16)) {
        const cube = createDynamicMesh(models.cube.mesh);

        sceneRenderer.addSubject({ mesh: cube.mesh });

        cube.transform.translate({
          x: ((i % 4) - 1.5) * 2,
          y: 0,
          z: (Math.floor(i / 4) - 1.5) * 2,
        });
      }

      // Register ground subject
      const ground = createDynamicMesh(models.ground.mesh);

      sceneRenderer.addSubject({ mesh: ground.mesh });

      ground.transform.translate({ x: 0, y: -1.5, z: 0 });

      // Update lights & light subjects
      const directionalLightParameter =
        directionalLightParameters[configuration.nbDirectionalLights];
      const pointLightParameter =
        pointLightParameters[configuration.nbPointLights];

      for (const pointLight of allPointLights) {
        pointLight.radius = pointLightParameter.radius;
      }

      const directionalLights = allDirectionalLights.slice(
        0,
        directionalLightParameter.count,
      );
      const directionalLightTransforms = range(directionalLights.length).map(
        () => {
          const { mesh, transform } = createDynamicMesh(
            models.directionalLight.mesh,
          );

          sceneRenderer.addSubject({ mesh });

          return transform;
        },
      );
      const pointLights = allPointLights.slice(0, pointLightParameter.count);
      const pointLightTransforms = range(pointLights.length).map(() => {
        const { mesh, transform } = createDynamicMesh(models.pointLight.mesh);

        sceneRenderer.addSubject({ mesh });

        return transform;
      });

      return {
        directionalLights,
        directionalLightTransforms,
        encodingRenderer,
        encodingTexture,
        move: configuration.move,
        pointLights,
        pointLightTransforms,
        sceneRenderer,
        release: () => {
          encodingRenderer?.release();
          encodingTexture?.release();
          sceneRenderer.release();
        },
      };
    },

    release() {
      models.cube.release();
      models.directionalLight.release();
      models.ground.release();
      models.pointLight.release();
      runtime.release();
    },

    render(state) {
      // Clear screen
      target.clear();

      // Draw scene
      const scene: DeferredLightingScene = {
        ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
        directionalLights: state.directionalLights,
        pointLights: state.pointLights,
        projection,
        view: camera.viewMatrix,
      };

      state.sceneRenderer.render(target, scene);

      // Draw debug
      if (state.encodingTexture !== undefined) {
        state.encodingRenderer?.render(target, state.encodingTexture);
      }
    },

    resize(state, size) {
      state.sceneRenderer.setSize(size);

      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      target.setSize(size);
    },

    update(state, dt) {
      for (let i = 0; i < state.directionalLights.length; ++i) {
        const { direction, mover } = state.directionalLights[i];
        const transform = state.directionalLightTransforms[i];

        direction.set(mover(Vector3.zero, time * 0.001));
        direction.normalize();
        direction.scale(10);

        transform.set(Matrix4.identity);
        transform.translate(direction);
      }

      for (let i = 0; i < state.pointLights.length; ++i) {
        const { mover, position } = state.pointLights[i];
        const transform = state.pointLightTransforms[i];

        position.set(mover(Vector3.zero, time * 0.0002));

        transform.set(Matrix4.identity);
        transform.translate(position);
      }

      // Move camera
      camera.update(dt);

      time += state.move ? dt : 0;
    },
  };
};

const process = declare(
  "Deferred rendering",
  createWebGLScreen,
  createApplication,
  configurator,
);

export { process };
