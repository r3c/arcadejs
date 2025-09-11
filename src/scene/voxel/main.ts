import { Application, declare } from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/screen";
import { range } from "../../engine/language/iterable";
import { createLibrary, loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import { createWorldGraphic, createWorldPhysic } from "./world";
import { noise } from "./perlin";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { createOrbitMover } from "../move";
import {
  createModel,
  createTransformableMesh,
} from "../../engine/graphic/webgl/model";
import { createOrbitCamera } from "../../engine/stage/camera";
import {
  createForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/renderer";

const worldChunkCount = { x: 8, y: 2, z: 8 };
const worldChunkSize = { x: 16, y: 16, z: 16 };
const worldScale = { x: 0.1, y: 0.1, z: 0.1 };
const timeFactor = 20;

const applicationBuilder = async (
  screen: WebGLScreen
): Promise<Application<unknown>> => {
  const gl = screen.context;
  const input = new Input(screen.canvas);
  const runtime = createRuntime(gl);
  const target = new GlTarget(gl, screen.getSize());

  // Load models
  const worldScaleVector = Vector3.fromZero();

  worldScaleVector.set(worldScale);
  worldScaleVector.scale(0.5);

  const library = createLibrary();
  const transform = Matrix4.fromSource(Matrix4.identity, [
    "scale",
    worldScaleVector,
  ]);

  const levelModels = await Promise.all(
    range(10).map((level) =>
      Promise.all(
        range(6).map((faceIndex) =>
          loadMeshFromJson(`model/voxel/face${faceIndex}.json`, {
            library,
            format: { variables: { level: level.toString() } },
            transform,
          })
        )
      )
    )
  );

  worldScaleVector.set(worldScale);
  worldScaleVector.scale(0.55);

  const getModelIndex = (height: number): number => {
    const value = Math.pow(height, 0.5) / (1 / levelModels.length);

    return Math.floor(value);
  };

  // Create world
  const maxLights = 3;
  const renderer = createForwardLightingRenderer(runtime, {
    maxPointLights: maxLights,
    noShadow: true,
  });

  const worldGraphic = createWorldGraphic(
    runtime,
    renderer,
    worldChunkCount,
    worldChunkSize,
    worldScale,
    levelModels
  );

  const worldPhysic = createWorldPhysic(worldGraphic.offsetSize, {
    onChange(offset, voxel) {
      worldGraphic.setVoxel(
        offset,
        voxel !== undefined
          ? getModelIndex(offset.y / worldGraphic.offsetSize.y)
          : undefined
      );
    },
    onCreate(offset) {
      const height = (offset.y * 2) / worldGraphic.offsetSize.y - 1;
      const x = offset.x / worldGraphic.offsetSize.x;
      const y = offset.z / worldGraphic.offsetSize.z;

      if (height > noise(x, y)) {
        return undefined;
      }

      worldGraphic.setVoxel(
        offset,
        getModelIndex(offset.y / worldGraphic.offsetSize.y)
      );

      return {
        mass: 1,
      };
    },
  });

  // Create select box

  const selectMesh = await loadMeshFromJson("model/select/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      worldScaleVector,
    ]),
  });

  const selectModel = createModel(gl, selectMesh);
  const select = createTransformableMesh(selectModel.mesh);
  const selectTransform = select.transform;

  renderer.append({
    mesh: select.mesh,
    noShadow: false,
  });

  // Create state
  const maxWorldRenderSize = Math.max(
    worldGraphic.renderSize.x,
    worldGraphic.renderSize.y,
    worldGraphic.renderSize.z
  );

  const camera = createOrbitCamera(
    {
      getRotate: () => input.fetchMove(Pointer.Grab),
      getMove: () => input.fetchMove(Pointer.Drag),
      getZoom: () => input.fetchZoom(),
    },
    { x: 0, y: 0, z: -maxWorldRenderSize * 2 },
    { x: -Math.PI / 8, y: (5 * Math.PI) / 4 }
  );
  const lights = range(maxLights).map((i) => ({
    mover: createOrbitMover(i, 1, maxWorldRenderSize, 1),
    position: Vector3.fromZero([
      "setFromXYZ",
      worldGraphic.renderSize.x * (i / (maxLights - 1) - 0.5),
      worldGraphic.renderSize.y * 0.5,
      worldGraphic.renderSize.z * (i / (maxLights - 1) - 0.5),
    ]),
    radius: maxWorldRenderSize,
  }));
  const projection = Matrix4.fromIdentity();

  let move = 0;
  let time = 0;

  return {
    async change() {},

    dispose() {},

    update(dt) {
      // Move camera & define view matrix accordingly
      camera.update(dt);

      // Locate cell being looked at
      const viewMatrixInverse = Matrix4.fromSource(
        Matrix4.identity,
        ["set", camera.viewMatrix],
        ["invert"]
      );

      const cameraDirection = {
        x: viewMatrixInverse.v20,
        y: viewMatrixInverse.v21,
        z: viewMatrixInverse.v22,
      };

      const cameraPosition = {
        x: viewMatrixInverse.v30,
        y: viewMatrixInverse.v31,
        z: viewMatrixInverse.v32,
      };

      const lookVector = Vector3.fromZero();
      let lookOffset = Vector3.zero;
      let lookVoxel = undefined;

      for (let i = 0; lookVoxel === undefined && i < 100; ++i) {
        lookVector.set(cameraPosition);
        lookVector.add({
          x: worldScale.x * cameraDirection.x * -i,
          y: worldScale.y * cameraDirection.y * -i,
          z: worldScale.z * cameraDirection.z * -i,
        });

        const offset = worldGraphic.findOffsetPosition(lookVector);

        if (offset !== undefined) {
          lookOffset = offset;
          lookVoxel = worldPhysic.findVoxel(offset);
        }
      }

      // Simulate falling cell
      if (input.fetchPress("arrowdown") && lookVoxel !== undefined) {
        const sourceOffset = lookOffset;
        const targetOffset: Vector3 = {
          x: sourceOffset.x,
          y: worldGraphic.offsetSize.y - 1,
          z: sourceOffset.z,
        };

        if (worldPhysic.findVoxel(targetOffset) !== undefined) {
          console.error("target is occupied");
        } else {
          worldPhysic.clear(sourceOffset);
          worldPhysic.put(targetOffset, lookVoxel);
          worldPhysic.poke(targetOffset, Vector3.zero);
          worldPhysic.poke(
            {
              x: sourceOffset.x,
              y: sourceOffset.y + 1,
              z: sourceOffset.z,
            },
            Vector3.zero
          );
        }
      }

      // Simulate upward force
      if (input.fetchPress("arrowup") && lookVoxel !== undefined) {
        worldPhysic.poke(lookOffset, { x: 0, y: 0.5, z: 0 });
      }

      // Simulate push force
      if (input.fetchPress("space") && lookVoxel !== undefined) {
        const direction = Vector3.fromZero(
          Math.abs(cameraDirection.x) > Math.abs(cameraDirection.z)
            ? ["setFromXYZ", Math.sign(cameraDirection.x), 0, 0]
            : ["setFromXYZ", 0, 0, Math.sign(cameraDirection.z)]
        );

        direction.scale(-0.5);

        worldPhysic.poke(lookOffset, direction);
      }

      // Move lights
      for (let i = 0; i < lights.length; ++i) {
        const { mover, position } = lights[i];

        position.set(mover(Vector3.zero, move * 0.0005));
      }

      // Update state
      selectTransform.set(Matrix4.fromIdentity());
      selectTransform.translate(worldGraphic.findRenderPosition(lookOffset));

      for (time += dt; time >= timeFactor; time -= timeFactor) {
        worldPhysic.tick();
      }

      worldGraphic.update();

      move += dt;
    },

    render() {
      // Clear screen
      target.clear(0);

      // Forward pass
      const lightScene: ForwardLightingScene = {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        pointLights: lights.map(({ position, radius }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          position,
          radius,
        })),
        projection,
        view: camera.viewMatrix,
      };

      renderer.render(target, lightScene);
    },

    resize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      renderer.resize(size);
      target.resize(size);
    },
  };
};

const process = declare(
  "Voxel Simulation",
  WebGLScreen,
  applicationBuilder,
  {}
);

export { process };
