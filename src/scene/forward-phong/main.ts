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
import { GlTexture } from "../../engine/graphic/webgl/texture";
import { GlEncodingSource } from "../../engine/graphic/renderer/gl-encoding";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const debugModes: {
  name: string;
  source: GlEncodingSource;
  getTexture: (renderer: ForwardLightingRenderer) => GlTexture;
}[] = [
  {
    name: "Directional",
    source: GlEncodingSource.Quad,
    getTexture: (renderer) => renderer.directionalShadowMaps[0],
  },
  {
    name: "Point -X",
    source: GlEncodingSource.CubeNegativeX,
    getTexture: (renderer) => renderer.pointShadowMaps[0],
  },
  {
    name: "Point +X",
    source: GlEncodingSource.CubePositiveX,
    getTexture: (renderer) => renderer.pointShadowMaps[0],
  },
  {
    name: "Point -Y",
    source: GlEncodingSource.CubeNegativeY,
    getTexture: (renderer) => renderer.pointShadowMaps[0],
  },
  {
    name: "Point +Y",
    source: GlEncodingSource.CubePositiveY,
    getTexture: (renderer) => renderer.pointShadowMaps[0],
  },
  {
    name: "Point -Z",
    source: GlEncodingSource.CubeNegativeZ,
    getTexture: (renderer) => renderer.pointShadowMaps[0],
  },
  {
    name: "Point +Z",
    source: GlEncodingSource.CubePositiveZ,
    getTexture: (renderer) => renderer.pointShadowMaps[0],
  },
];

const configurator = {
  nbDirectionalLights: createSelect(
    "Directional Lights",
    ["0", "1", "2", "3"],
    0,
  ),
  nbPointLights: createSelect("Point Lights", ["0", "1", "2", "3"], 1),
  move: createCheckbox("Move", true),
  lightAmbient: createCheckbox("Ambient Light", true),
  lightDiffuse: createCheckbox("Diffuse Light", true),
  lightSpecular: createCheckbox("Specular Light", true),
  useNormalMap: createCheckbox("Normal Map", true),
  useHeightMap: createCheckbox("Height Map", true),
  debugMode: createSelect(
    "Debug",
    ["None", ...debugModes.map(({ name }) => name)],
    0,
  ),
};

type Configuration =
  typeof configurator extends ApplicationConfigurator<infer T> ? T : never;

const createApplication = async (
  screen: Screen<WebGL2RenderingContext>,
  gamepad: Gamepad,
): Promise<Application<Configuration>> => {
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
  const directionalLights = range(3).map((i) => ({
    direction: Vector3.fromZero(),
    mover: createCircleMover(i),
  }));
  const pointLights = range(3).map((i) => ({
    mover: createOrbitMover(i, 2, 2, 1),
    position: Vector3.fromZero(),
  }));
  const models = {
    box: createModel(gl, boxMesh),
    cube: createModel(gl, cubeMesh),
    light: createModel(gl, lightMesh),
  };
  const projection = Matrix4.fromIdentity();

  let debugMode = 0;
  let directionalLightTransforms: MutableMatrix4[] = [];
  let encodingRenderer: GlEncodingRenderer | undefined = undefined;
  let move = false;
  let pointLightTransforms: MutableMatrix4[] = [];
  let renderer: ForwardLightingRenderer | undefined = undefined;
  let time = 0;

  return {
    async setConfiguration(configuration) {
      encodingRenderer?.release();
      renderer?.release();

      const newRenderer = createForwardLightingRenderer(runtime, {
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

      newRenderer.addSubject({ mesh: cube1.mesh });
      newRenderer.addSubject({ mesh: cube2.mesh });

      const box = createDynamicMesh(models.box.mesh);

      newRenderer.addSubject({ mesh: box.mesh });

      box.transform.scale({ x: 2.5, y: 2.5, z: 2.5 });

      directionalLightTransforms = range(configuration.nbDirectionalLights).map(
        () => {
          const { mesh, transform } = createDynamicMesh(models.light.mesh);

          newRenderer.addSubject({ mesh, noShadow: true });

          return transform;
        },
      );
      pointLightTransforms = range(configuration.nbPointLights).map(() => {
        const { mesh, transform } = createDynamicMesh(models.light.mesh);

        newRenderer.addSubject({ mesh, noShadow: true });

        return transform;
      });

      debugMode = configuration.debugMode;
      encodingRenderer = createGlEncodingRenderer(runtime, {
        channel: GlEncodingChannel.Red,
        format: GlEncodingFormat.Monochrome,
        source:
          configuration.debugMode > 0
            ? debugModes[configuration.debugMode - 1].source
            : GlEncodingSource.Quad,
        zNear: 0.1,
        zFar: 100,
      });
      move = configuration.move;
      renderer = newRenderer;
    },

    release() {
      encodingRenderer?.release();
      models.box.release();
      models.cube.release();
      models.light.release();
      renderer?.release();
      runtime.release();
    },

    render() {
      // Clear screen
      target.clear();

      // Draw scene
      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        directionalLights: directionalLights
          .slice(0, directionalLightTransforms.length)
          .map(({ direction }) => ({
            color: { x: 0.8, y: 0.8, z: 0.8 },
            direction,
            shadow: true,
          })),
        pointLights: pointLights
          .slice(0, pointLightTransforms.length)
          .map(({ position }) => ({
            color: { x: 0.8, y: 0.8, z: 0.8 },
            position,
            radius: 5,
            shadow: true,
          })),
        projection,
        view: camera.viewMatrix,
      };

      renderer?.render(target, scene);

      // Draw texture debug
      if (
        debugMode > 0 &&
        renderer !== undefined &&
        encodingRenderer !== undefined
      ) {
        encodingRenderer.render(
          target,
          debugModes[debugMode - 1].getTexture(renderer),
        );
      }
    },

    setSize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      renderer?.setSize(size);
      target.setSize(size);
    },

    update(dt) {
      // Update light positions
      for (let i = 0; i < directionalLightTransforms.length; ++i) {
        const { direction, mover } = directionalLights[i];
        const transform = directionalLightTransforms[i];

        direction.set(mover(Vector3.zero, -time * 0.0005));
        direction.normalize();
        direction.scale(10);

        transform.set(Matrix4.identity);
        transform.translate(direction);
      }

      for (let i = 0; i < pointLightTransforms.length; ++i) {
        const { mover, position } = pointLights[i];
        const transform = pointLightTransforms[i];

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
  "Forward Phong lighting",
  createWebGLScreen,
  createApplication,
  configurator,
);

export { process };
