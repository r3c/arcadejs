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
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector2, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { createCircleMover, createOrbitMover } from "../move";
import { createModel } from "../../engine/graphic/webgl/model";
import {
  DebugTextureRenderer,
  DebugTextureEncoding,
  DebugTextureChannel,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import { createOrbitCamera } from "../../engine/stage/camera";
import {
  createForwardLightingRenderer,
  ForwardLightingHandle,
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
  nbDirectionalLights: createSelect("dLights", ["0", "1", "2", "3"], 0),
  nbPointLights: createSelect("pLights", ["0", "1", "2", "3"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightDiffuse: createCheckbox("diffuse", true),
  lightSpecular: createCheckbox("specular", true),
  useNormalMap: createCheckbox("nMap", true),
  useHeightMap: createCheckbox("hMap", true),
  debugMode: createSelect("debug", ["None", "Shadow"], 0),
};

type Configuration = typeof configurator extends ApplicationConfigurator<
  infer T
>
  ? T
  : never;

const applicationBuilder = async (
  screen: WebGLScreen
): Promise<Application<Configuration>> => {
  const gl = screen.context;
  const input = new Input(screen.canvas);
  const runtime = createRuntime(screen.context);
  const target = new GlTarget(gl, screen.getSize());

  // Load models
  const cubeMesh = await loadMeshFromJson("model/cube/mesh.json");
  const groundMesh = await loadMeshFromJson("model/ground/mesh.json");
  const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      { x: 0.2, y: 0.2, z: 0.2 },
    ]),
  });

  const camera = createOrbitCamera(
    {
      getRotate: () => input.fetchMove(Pointer.Grab),
      getMove: () => input.fetchMove(Pointer.Drag),
      getZoom: () => input.fetchZoom(),
    },
    { x: 0, y: 0, z: -5 },
    Vector2.zero
  );
  const directionalLights = range(3).map((i) => ({
    direction: Vector3.fromZero(),
    mover: createCircleMover(i),
  }));
  const pointLights = range(3).map((i) => ({
    mover: createOrbitMover(i, 2, 2, 1),
    position: Vector3.fromZero(),
  }));
  const debugRenderer = new DebugTextureRenderer(runtime, target, {
    encoding: DebugTextureEncoding.Monochrome,
    channel: DebugTextureChannel.Red,
    zNear: 0.1,
    zFar: 100,
  });
  const models = {
    cube: createModel(gl, cubeMesh),
    ground: createModel(gl, groundMesh),
    light: createModel(gl, lightMesh),
  };
  const projection = Matrix4.fromIdentity();

  let debugMode = false;
  let directionalLightHandles: ForwardLightingHandle[] = [];
  let move = false;
  let pointLightHandles: ForwardLightingHandle[] = [];
  let renderer: ForwardLightingRenderer | undefined = undefined;
  let time = 0;

  return {
    async change(configuration) {
      renderer?.dispose();

      const newRenderer = createForwardLightingRenderer(runtime, target, {
        maxDirectionalLights: 3,
        maxPointLights: 3,
        lightModel: ForwardLightingLightModel.Phong,
        lightModelPhongNoAmbient: !configuration.lightAmbient,
        lightModelPhongNoDiffuse: !configuration.lightDiffuse,
        lightModelPhongNoSpecular: !configuration.lightSpecular,
        noHeightMap: !configuration.useHeightMap,
        noNormalMap: !configuration.useNormalMap,
      });

      newRenderer.append({ mesh: models.cube.mesh });

      const groundHandle = newRenderer.append({ mesh: models.ground.mesh });

      groundHandle.transform.translate({ x: 0, y: -1.5, z: 0 });

      directionalLightHandles = range(configuration.nbDirectionalLights).map(
        () => newRenderer.append({ mesh: models.light.mesh, noShadow: true })
      );
      pointLightHandles = range(configuration.nbPointLights).map(() =>
        newRenderer.append({ mesh: models.light.mesh, noShadow: true })
      );

      debugMode = configuration.debugMode !== 0;
      move = configuration.move;
      renderer = newRenderer;
    },

    dispose() {
      models.cube.dispose();
      models.ground.dispose();
      models.light.dispose();
      renderer?.dispose();
      runtime.dispose();
      target.dispose();
    },

    render() {
      // Clear screen
      target.clear(0);

      // Draw scene
      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        directionalLights: directionalLights
          .slice(0, directionalLightHandles.length)
          .map(({ direction }) => ({
            color: { x: 0.8, y: 0.8, z: 0.8 },
            direction,
            shadow: true,
          })),
        pointLights: pointLights
          .slice(0, pointLightHandles.length)
          .map(({ position }) => ({
            color: { x: 0.8, y: 0.8, z: 0.8 },
            position,
            radius: 5,
          })),
        projection,
        view: camera.viewMatrix,
      };

      renderer?.render(scene);

      // Draw texture debug
      if (debugMode && renderer !== undefined) {
        debugRenderer.render(renderer.directionalShadowBuffers[0]);
      }
    },

    resize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      renderer?.resize(size);
      target.resize(size);
    },

    update(dt) {
      // Update light positions
      for (let i = 0; i < directionalLightHandles.length; ++i) {
        const { direction, mover } = directionalLights[i];
        const { transform } = directionalLightHandles[i];

        direction.set(mover(Vector3.zero, -time * 0.0005));
        direction.normalize();
        direction.scale(10);

        transform.set(Matrix4.identity);
        transform.translate(direction);
      }

      for (let i = 0; i < pointLightHandles.length; ++i) {
        const { mover, position } = pointLights[i];
        const { transform } = pointLightHandles[i];

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
  WebGLScreen,
  applicationBuilder,
  configurator
);

export { process };
