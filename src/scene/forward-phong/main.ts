import {
  type Application,
  ApplicationConfigurator,
  createCheckbox,
  createRange,
  createSelect,
  declare,
} from "../../engine/application";
import { Gamepad, Pointer } from "../../engine/io/gamepad";
import { type Screen, createWebGLScreen } from "../../engine/graphic/screen";
import { range } from "../../engine/language/iterable";
import { Releasable } from "../../engine/io/resource";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { Vector2, Vector3 } from "../../engine/math/vector";
import { createRuntime } from "../../engine/graphic/webgl";
import { createScreenTarget } from "../../engine/graphic/webgl/target";
import { createCircleMover, createOrbitMover } from "../move";
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
  GlEncodingRenderer,
} from "../../engine/graphic/renderer";
import {
  createGlEncodingRenderer,
  GlEncodingChannel,
  GlEncodingFormat,
} from "../../engine/graphic/renderer";
import { GlEncodingSource } from "../../engine/graphic/renderer/gl-encoding";
import {
  DirectionalLight,
  PointLight,
} from "../../engine/graphic/webgl/shaders/light";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const getDirectionalShadowMap = (r: ForwardLightingRenderer) =>
  r.directionalShadowMaps[0];
const getPointShadowMap = (r: ForwardLightingRenderer) => r.pointShadowMaps[0];
const debugModes = [
  {
    name: "Directional",
    source: GlEncodingSource.Quad,
    getTexture: getDirectionalShadowMap,
  },
  {
    name: "Point -X",
    source: GlEncodingSource.CubeNegativeX,
    getTexture: getPointShadowMap,
  },
  {
    name: "Point +X",
    source: GlEncodingSource.CubePositiveX,
    getTexture: getPointShadowMap,
  },
  {
    name: "Point -Y",
    source: GlEncodingSource.CubeNegativeY,
    getTexture: getPointShadowMap,
  },
  {
    name: "Point +Y",
    source: GlEncodingSource.CubePositiveY,
    getTexture: getPointShadowMap,
  },
  {
    name: "Point -Z",
    source: GlEncodingSource.CubeNegativeZ,
    getTexture: getPointShadowMap,
  },
  {
    name: "Point +Z",
    source: GlEncodingSource.CubePositiveZ,
    getTexture: getPointShadowMap,
  },
];

const configurator = {
  speed: createRange("Animation speed", -3, 3, 3),
  nbDirectionalLights: createSelect(
    "Nb of Directional Lights",
    ["0", "1", "2", "3"],
    0,
  ),
  nbPointLights: createSelect("Nb of Point Lights", ["0", "1", "2", "3"], 1),
  lightAmbient: createCheckbox("Ambient Light", true),
  lightDiffuse: createCheckbox("Diffuse Light", true),
  lightSpecular: createCheckbox("Specular Light", true),
  useNormalMap: createCheckbox("Normal Map", true),
  useHeightMap: createCheckbox("Height Map", true),
  debugMode: createSelect(
    "Show debug buffer",
    ["None", ...debugModes.map(({ name }) => name)],
    0,
  ),
};

type Configuration =
  typeof configurator extends ApplicationConfigurator<infer T> ? T : never;

type State = Releasable &
  Pick<Configuration, "debugMode" | "speed"> & {
    directionalLights: (DirectionalLight & { transform: MutableMatrix4 })[];
    encodingRenderer: GlEncodingRenderer;
    pointLights: (PointLight & { transform: MutableMatrix4 })[];
    renderer: ForwardLightingRenderer;
  };

const createApplication = async (
  screen: Screen<WebGL2RenderingContext>,
  gamepad: Gamepad,
): Promise<Application<Configuration, State>> => {
  const gl = screen.getContext();
  const runtime = createRuntime(gl);
  const target = createScreenTarget(gl);

  // Load models
  const boxMesh = await loadMeshFromJson("model/stand/box.json");
  const cubeMesh = await loadMeshFromJson("model/cube/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      { x: 0.5, y: 0.5, z: 0.5 },
    ]),
  });
  const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      { x: 0.2, y: 0.2, z: 0.2 },
    ]),
  });
  const camera = createOrbitCamera(
    {
      getRotate: () => gamepad.fetchMove(Pointer.Grab),
      getMove: () => gamepad.fetchMove(Pointer.Drag),
      getZoom: () => gamepad.fetchZoom(),
    },
    { x: 0, y: 0, z: -5 },
    Vector2.zero,
  );
  const directionalLightParameters = range(3).map((i) => ({
    direction: Vector3.fromZero(),
    mover: createCircleMover(i),
  }));
  const pointLightParameters = range(3).map((i) => ({
    mover: createOrbitMover(i, 2, 2, 1),
    position: Vector3.fromZero(),
  }));
  const models = {
    box: createModel(gl, boxMesh),
    cube: createModel(gl, cubeMesh),
    light: createModel(gl, lightMesh),
  };
  const projection = Matrix4.fromIdentity();

  let time = 0;

  return {
    async configure(configuration) {
      const renderer = createForwardLightingRenderer(runtime, {
        maxDirectionalLights: 3,
        maxPointLights: 3,
        lightModel: ForwardLightingLightModel.Phong,
        lightModelPhongNoAmbient: !configuration.lightAmbient,
        lightModelPhongNoDiffuse: !configuration.lightDiffuse,
        lightModelPhongNoSpecular: !configuration.lightSpecular,
        noHeightMap: !configuration.useHeightMap,
        noNormalMap: !configuration.useNormalMap,
      });

      const cube1 = createDynamicMesh(models.cube.mesh);
      const cube2 = createDynamicMesh(models.cube.mesh);

      cube1.transform.translate({ x: -1, y: 0, z: 0 });
      cube2.transform.translate({ x: 1, y: 0, z: 0 });

      renderer.addSubject({ mesh: cube1.mesh });
      renderer.addSubject({ mesh: cube2.mesh });

      const box = createDynamicMesh(models.box.mesh);

      renderer.addSubject({ mesh: box.mesh });
      box.transform.scale({ x: 2.5, y: 2.5, z: 2.5 });

      const directionalLights = range(configuration.nbDirectionalLights).map(
        (i) => {
          const { direction } = directionalLightParameters[i];
          const { mesh, transform } = createDynamicMesh(models.light.mesh);

          renderer.addSubject({ mesh, noShadow: true });

          return {
            color: Vector3.fromSource({ x: 0.8, y: 0.8, z: 0.8 }, [
              "scale",
              1 / configuration.nbDirectionalLights,
            ]),
            direction,
            shadow: true,
            transform,
          };
        },
      );

      const pointLights = range(configuration.nbPointLights).map((i) => {
        const { position } = pointLightParameters[i];
        const { mesh, transform } = createDynamicMesh(models.light.mesh);

        renderer.addSubject({ mesh, noShadow: true });

        return {
          color: Vector3.fromSource({ x: 0.8, y: 0.8, z: 0.8 }, [
            "scale",
            1 / configuration.nbPointLights,
          ]),
          position,
          radius: 5,
          shadow: true,
          transform,
        };
      });

      const encodingRenderer = createGlEncodingRenderer(runtime, {
        channel: GlEncodingChannel.Red,
        format: GlEncodingFormat.Monochrome,
        source:
          configuration.debugMode > 0
            ? debugModes[configuration.debugMode - 1].source
            : GlEncodingSource.Quad,
        zNear: 0.1,
        zFar: 100,
      });

      return {
        debugMode: configuration.debugMode,
        directionalLights,
        encodingRenderer,
        pointLights,
        renderer,
        speed: configuration.speed,
        release: () => {
          encodingRenderer.release();
          renderer.release();
        },
      };
    },

    release() {
      models.box.release();
      models.cube.release();
      models.light.release();
      runtime.release();
    },

    render(state) {
      // Clear screen
      target.clear();

      // Draw scene
      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0.1, y: 0.1, z: 0.1 },
        directionalLights: state.directionalLights,
        pointLights: state.pointLights,
        projection,
        view: camera.viewMatrix,
      };

      state.renderer.render(target, scene);

      // Draw texture debug
      if (state.debugMode > 0) {
        const texture = debugModes[state.debugMode - 1].getTexture(
          state.renderer,
        );

        state.encodingRenderer.render(target, texture);
      }
    },

    resize(state, size) {
      state.renderer.setSize(size);

      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      target.setSize(size);
    },

    update(state, dt) {
      // Update light positions
      for (let i = 0; i < state.directionalLights.length; ++i) {
        const { direction, mover } = directionalLightParameters[i];
        const { transform } = state.directionalLights[i];

        direction.set(mover(Vector3.zero, -time * 0.0001));
        direction.normalize();
        direction.scale(10);

        transform.set(Matrix4.identity);
        transform.translate(direction);
      }

      for (let i = 0; i < state.pointLights.length; ++i) {
        const { mover, position } = pointLightParameters[i];
        const { transform } = state.pointLights[i];

        position.set(mover(Vector3.zero, time * 0.0001));

        transform.set(Matrix4.identity);
        transform.translate(position);
      }

      // Move camera
      camera.update(dt);

      time += dt * state.speed;
    },
  };
};

const process = declare(
  "Forward Phong lighting",
  createWebGLScreen,
  createApplication,
  configurator,
);

export { process };
