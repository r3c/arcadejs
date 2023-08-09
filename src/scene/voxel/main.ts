import {
  type Tweak,
  Application,
  configure,
  declare,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingModel,
  ForwardLightingPipeline,
  ModelState,
  SceneState,
  hasShadowState,
} from "../../engine/graphic/webgl/pipelines/forward-lighting";
import { range } from "../../engine/language/functional";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import * as view from "../view";
import {
  WorldPhysic,
  createWorldPhysic,
  WorldGraphic,
  createWorldGraphic,
} from "./world";
import { noise } from "./perlin";
import {
  GlModel,
  GlScene,
  GlTarget,
  createRenderer,
  loadModel,
} from "../../engine/graphic/webgl";
import { orbitatePosition } from "../move";
import { Library } from "../../engine/graphic/model/definition";

interface SceneConfiguration {}

interface ApplicationState {
  camera: view.Camera;
  currentOffset: Vector3;
  input: Input;
  lights: {
    position: Vector3;
    radius: number;
  }[];
  models: {
    select: GlModel;
  };
  move: number;
  pipelines: {
    forwardLighting: ForwardLightingPipeline;
  };
  projectionMatrix: Matrix4;
  target: GlTarget;
  time: number;
  tweak: Tweak<SceneConfiguration>;
  viewMatrix: Matrix4;
  worldGraphic: WorldGraphic;
  worldPhysic: WorldPhysic;
}

const configuration: SceneConfiguration = {};

const worldChunkCount = { x: 8, y: 2, z: 8 };
const worldChunkSize = { x: 16, y: 16, z: 16 };
const worldScale = { x: 0.1, y: 0.1, z: 0.1 };
const timeFactor = 20;

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const renderer = createRenderer(gl);
    const tweak = configure(configuration);

    // Load models
    const worldScaleVector = Vector3.fromZero();

    worldScaleVector.set(worldScale);
    worldScaleVector.scale(0.5);

    const library: Library = { textures: new Map() };
    const transform = Matrix4.fromCustom(["scale", worldScaleVector]);

    const levelModels = await Promise.all(
      range(10, (level) =>
        Promise.all(
          range(6, (faceIndex) =>
            loadModelFromJson(`model/voxel/face${faceIndex}.json`, {
              library,
              load: { variables: { level: level.toString() } },
              transform,
            })
          )
        )
      )
    );

    worldScaleVector.set(worldScale);
    worldScaleVector.scale(0.55);

    const selectModel = await loadModelFromJson("model/select/mesh.json", {
      transform: Matrix4.fromCustom(["scale", worldScaleVector]),
    });

    const select = loadModel(renderer, selectModel);

    const getModelIndex = (height: number): number => {
      const value = Math.pow(height, 0.5) / (1 / levelModels.length);

      return Math.floor(value);
    };

    // Create world
    const worldGraphic = createWorldGraphic(
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

    // Create state
    const maxWorldRenderSize = Math.max(
      worldGraphic.renderSize.x,
      worldGraphic.renderSize.y,
      worldGraphic.renderSize.z
    );
    const maxLights = 3;

    return {
      camera: new view.Camera(
        { x: 0, y: 0, z: -maxWorldRenderSize * 2 },
        { x: -Math.PI / 8, y: (5 * Math.PI) / 4, z: 0 }
      ),
      currentOffset: Vector3.zero,
      input: new Input(screen.canvas),
      lights: range(maxLights, (i) => ({
        position: {
          x: worldGraphic.renderSize.x * (i / (maxLights - 1) - 0.5),
          y: worldGraphic.renderSize.y * 0.5,
          z: worldGraphic.renderSize.z * (i / (maxLights - 1) - 0.5),
        },
        radius: maxWorldRenderSize,
      })),
      models: {
        select,
      },
      move: 0,
      pipelines: {
        forwardLighting: new ForwardLightingPipeline(renderer, {
          light: {
            maxPointLights: maxLights,
            model: ForwardLightingModel.Phong,
            noShadow: true,
          },
        }),
      },
      projectionMatrix: Matrix4.identity,
      target: new GlTarget(gl, screen.getWidth(), screen.getHeight()),
      time: 0,
      tweak,
      viewMatrix: Matrix4.identity,
      worldGraphic,
      worldPhysic,
    };
  },

  update(state: ApplicationState, dt: number) {
    const { camera, input, worldPhysic, worldGraphic } = state;

    // Move camera & define view matrix accordingly
    camera.move(input);

    const viewMatrix = Matrix4.fromCustom(
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    // Locate cell being looked at
    const viewMatrixInverse = Matrix4.fromCustom(
      ["set", viewMatrix],
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
    if (input.fetchPressed("arrowdown") && lookVoxel !== undefined) {
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
    if (input.fetchPressed("arrowup") && lookVoxel !== undefined) {
      worldPhysic.poke(lookOffset, { x: 0, y: 0.5, z: 0 });
    }

    // Simulate push force
    if (input.fetchPressed("space") && lookVoxel !== undefined) {
      const direction =
        Math.abs(cameraDirection.x) > Math.abs(cameraDirection.z)
          ? Vector3.fromObject({ x: Math.sign(cameraDirection.x), y: 0, z: 0 })
          : Vector3.fromObject({ x: 0, y: 0, z: Math.sign(cameraDirection.z) });

      direction.scale(-0.5);

      worldPhysic.poke(lookOffset, direction);
    }

    // Move lights
    const maxWorldRenderSize = Math.max(
      worldGraphic.renderSize.x,
      worldGraphic.renderSize.y,
      worldGraphic.renderSize.z
    );

    state.move += dt * 0.00025;

    for (let i = 0; i < state.lights.length; ++i) {
      state.lights[i].position = orbitatePosition(
        state.move,
        i,
        1,
        maxWorldRenderSize
      );
    }

    // Update state
    state.currentOffset = lookOffset;
    state.viewMatrix = viewMatrix;

    for (state.time += dt; state.time >= timeFactor; state.time -= timeFactor) {
      worldPhysic.tick();
    }
  },

  render(state: ApplicationState) {
    const {
      currentOffset,
      models,
      pipelines,
      projectionMatrix,
      target,
      viewMatrix,
      worldGraphic,
    } = state;

    // Clear screen
    target.clear(0);

    // Create subjects
    const subjects = Array.from(worldGraphic.getSubjects());

    const worldSubjectMatrix = Matrix4.fromIdentity();

    worldSubjectMatrix.translate(
      worldGraphic.findRenderPosition(currentOffset)
    );

    subjects.push({
      matrix: worldSubjectMatrix,
      model: models.select,
      state: hasShadowState,
    });

    // Forward pass
    const lightPipeline = pipelines.forwardLighting;
    const lightScene: GlScene<SceneState, ModelState> = {
      state: {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        pointLights: state.lights.map(({ position, radius }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          position,
          radius,
        })),
        projectionMatrix,
        viewMatrix,
      },
      subjects,
    };

    lightPipeline.process(target, lightScene);
  },

  resize(state: ApplicationState, screen: WebGLScreen) {
    state.pipelines.forwardLighting.resize(
      screen.getWidth(),
      screen.getHeight()
    );
    state.projectionMatrix = Matrix4.fromPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );
    state.target.resize(screen.getWidth(), screen.getHeight());
  },
};

const process = declare("Voxel Simulation", WebGLScreen, application);

export { process };
