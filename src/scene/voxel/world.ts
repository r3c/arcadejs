import { flattenModel, mergeModels } from "../../engine/graphic/model";
import { Instance, Model } from "../../engine/graphic/model/definition";
import {
  deleteModel,
  GlRenderer,
  GlSubject,
  loadLibrary,
  loadModel,
} from "../../engine/graphic/webgl";
import { range } from "../../engine/language/functional";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";

interface Block {
  state: State;
  voxel: Voxel;
}

interface State {
  momentum: MutableVector3;
  shift: MutableVector3;
}

interface Voxel {
  mass: number;
}

interface WorldChunk {
  cubes: Map<number, WorldCube>;
}

interface WorldCube {
  modelIndex: number;
  transform: Matrix4;
}

interface WorldEvent {
  onChange: (
    this: WorldPhysic,
    offset: Vector3,
    voxel: Voxel | undefined
  ) => void;
  onCreate: (this: WorldPhysic, offset: Vector3) => Voxel | undefined;
}

interface WorldGraphic {
  findOffsetPosition: (renderPosition: Vector3) => Vector3 | undefined;
  findRenderPosition: (offsetPosition: Vector3) => Vector3;
  getSubjects: () => Iterable<GlSubject>;
  setVoxel: (offset: Vector3, modelIndex: number | undefined) => void;
  offsetSize: Vector3;
  renderSize: Vector3;
}

interface WorldPhysic {
  clear: (offset: Vector3) => void;
  findVoxel: (offset: Vector3) => Voxel | undefined;
  poke: (offset: Vector3, force: Vector3) => void;
  put: (offset: Vector3, voxel: Voxel) => void;
  tick: () => void;
}

const aboveIncrement: Vector3 = { x: 0, y: 1, z: 0 };
const belowIncrement: Vector3 = { x: 0, y: -1, z: 0 };
const gravityIncrement: Vector3 = Vector3.fromCustom(
  ["set", belowIncrement],
  ["scale", 0.02]
);

interface WorldCubeFace {
  faceIndex: number;
  shift: Vector3;
}

const cubeFaces: WorldCubeFace[] = [
  {
    faceIndex: 0,
    shift: { x: -1, y: 0, z: 0 },
  },
  {
    faceIndex: 1,
    shift: { x: 1, y: 0, z: 0 },
  },
  {
    faceIndex: 2,
    shift: { x: 0, y: -1, z: 0 },
  },
  {
    faceIndex: 3,
    shift: { x: 0, y: 1, z: 0 },
  },
  {
    faceIndex: 4,
    shift: { x: 0, y: 0, z: -1 },
  },
  {
    faceIndex: 5,
    shift: { x: 0, y: 0, z: 1 },
  },
];

const createWorldGraphic = (
  renderer: GlRenderer,
  chunkCount: Vector3,
  chunkSize: Vector3,
  scale: Vector3,
  models: Model[][]
): WorldGraphic => {
  const offsetSize = {
    x: chunkCount.x * chunkSize.x,
    y: chunkCount.y * chunkSize.y,
    z: chunkCount.z * chunkSize.z,
  };

  const renderSize = {
    x: offsetSize.x * scale.x,
    y: offsetSize.y * scale.y,
    z: offsetSize.z * scale.z,
  };

  const shift = Vector3.fromCustom(["set", renderSize], ["scale", -0.5]);

  const chunks = range<WorldChunk>(
    chunkCount.x * chunkCount.y * chunkCount.z,
    () => ({
      cubes: new Map<number, WorldCube>(),
    })
  );

  const chunkSubjects = range<GlSubject>(chunks.length, () => ({
    matrix: Matrix4.identity,
    model: { library: undefined, meshes: [] },
  }));

  const chunkUpdates = new Set<number>();

  const keyToOffset = (key: number): Vector3 => {
    const x = key % offsetSize.x;

    key = Math.floor(key / offsetSize.x);

    const y = key % offsetSize.y;

    key = Math.floor(key / offsetSize.y);

    const z = key;

    return { x, y, z };
  };

  const offsetToChunkIndex = (offset: Vector3): number | undefined => {
    const { x, y, z } = offset;

    const xChunk = Math.floor(x / chunkSize.x);
    const yChunk = Math.floor(y / chunkSize.y);
    const zChunk = Math.floor(z / chunkSize.z);
    const index = xChunk + (yChunk + zChunk * chunkCount.y) * chunkCount.x;

    return index >= 0 && index < chunks.length ? index : undefined;
  };

  const offsetToKey = (offset: Vector3): number => {
    const { x, y, z } = offset;

    return x + (y + z * offsetSize.y) * offsetSize.x;
  };

  const isValid = (offset: Vector3): boolean => {
    const { x, y, z } = offset;

    return (
      x >= 0 &&
      x < offsetSize.x &&
      y >= 0 &&
      y < offsetSize.y &&
      z >= 0 &&
      z < offsetSize.z
    );
  };

  const library = loadLibrary(
    renderer.context,
    mergeModels(
      models.flatMap((faces) =>
        faces.map((face) => ({
          model: face,
          transform: Matrix4.identity,
        }))
      )
    )
  );

  const worldGraphic: WorldGraphic = {
    findOffsetPosition: (renderPosition) => {
      const offset = {
        x: Math.floor((renderPosition.x - shift.x) / scale.x),
        y: Math.floor((renderPosition.y - shift.y) / scale.y),
        z: Math.floor((renderPosition.z - shift.z) / scale.z),
      };

      return isValid(offset) ? offset : undefined;
    },

    findRenderPosition: (offsetPosition) => {
      return {
        x: offsetPosition.x * scale.x + shift.x,
        y: offsetPosition.y * scale.y + shift.y,
        z: offsetPosition.z * scale.z + shift.z,
      };
    },

    getSubjects: () => {
      if (chunkUpdates.size > 0) {
        for (const chunkIndex of chunkUpdates) {
          const chunk = chunks[chunkIndex];

          deleteModel(renderer.context, chunkSubjects[chunkIndex].model);

          const instances: Instance[] = [];
          const nextOffset = Vector3.fromZero();

          for (const [key, cube] of chunk.cubes.entries()) {
            const { modelIndex, transform } = cube;
            const offset = keyToOffset(key);

            // Push only visible faces depending on neighbor of current cube
            for (const { faceIndex, shift } of cubeFaces) {
              nextOffset.set(offset);
              nextOffset.add(shift);

              const nextValid = offsetToChunkIndex(nextOffset) === chunkIndex;

              if (!nextValid || !chunk.cubes.has(offsetToKey(nextOffset))) {
                instances.push({
                  model: models[modelIndex][faceIndex],
                  transform,
                });
              }
            }
          }

          const mergedModel = mergeModels(instances);
          const flattenedModel = flattenModel(mergedModel);
          const model = loadModel(renderer, flattenedModel, { library });

          chunkSubjects[chunkIndex].model = model;
        }

        chunkUpdates.clear();
      }

      return chunkSubjects;
    },

    setVoxel: (offset, modelIndex) => {
      const chunkIndex = offsetToChunkIndex(offset);

      if (chunkIndex === undefined) {
        return;
      }

      const chunk = chunks[chunkIndex];
      const key = offsetToKey(offset);

      if (modelIndex !== undefined) {
        const position = worldGraphic.findRenderPosition(offset);
        const transform = Matrix4.fromCustom(["translate", position]);

        chunk.cubes.set(key, { modelIndex, transform });
      } else {
        chunk.cubes.delete(key);
      }

      chunkUpdates.add(chunkIndex);
    },

    offsetSize,

    renderSize,
  };

  return worldGraphic;
};

function createWorldPhysic(
  worldSize: Vector3,
  worldEvent: WorldEvent
): WorldPhysic {
  const { onChange, onCreate } = worldEvent;

  const activeIndices = new Set<number>();
  const blocks = range<Block | undefined>(
    worldSize.x * worldSize.y * worldSize.z,
    () => undefined
  );

  const extractMove = (shift: Vector3): Vector3 | undefined => {
    const x = Math.abs(shift.x);
    const y = Math.abs(shift.y);
    const z = Math.abs(shift.z);

    if (x >= 1 && x >= y && x >= z) {
      return { x: Math.sign(shift.x), y: 0, z: 0 };
    } else if (y >= 1 && y >= x && y >= z) {
      return { x: 0, y: Math.sign(shift.y), z: 0 };
    } else if (z >= 1 && z >= x && z >= y) {
      return { x: 0, y: 0, z: Math.sign(shift.z) };
    }

    return undefined;
  };

  const indexOf = (offset: Vector3): number => {
    const { x, y, z } = offset;

    return x + (y + z * worldSize.y) * worldSize.x;
  };

  const isValid = (offset: Vector3): boolean => {
    const { x, y, z } = offset;

    return (
      x >= 0 &&
      x < worldSize.x &&
      y >= 0 &&
      y < worldSize.y &&
      z >= 0 &&
      z < worldSize.z
    );
  };

  const offsetOf = (index: number): Vector3 => {
    const x = index % worldSize.x;
    const yRemainder = Math.floor(index / worldSize.x);
    const y = yRemainder % worldSize.y;
    const zRemainer = Math.floor(yRemainder / worldSize.y);
    const z = zRemainer % worldSize.z;

    return { x, y, z };
  };

  const worldPhysic: WorldPhysic = {
    clear: (offset) => {
      if (isValid(offset)) {
        const index = indexOf(offset);

        blocks[index] = undefined;

        onChange.call(worldPhysic, offset, undefined);
      }
    },

    findVoxel: (offset) => {
      return isValid(offset) ? blocks[indexOf(offset)]?.voxel : undefined;
    },

    poke: (offset, force) => {
      if (isValid(offset)) {
        const index = indexOf(offset);
        const block = blocks[index];

        if (block !== undefined) {
          block.state.momentum.add(force);

          activeIndices.add(index);
        }
      }
    },

    put: (offset, voxel) => {
      if (isValid(offset)) {
        const index = indexOf(offset);

        blocks[index] = {
          state: {
            momentum: Vector3.fromZero(),
            shift: Vector3.fromZero(),
          },
          voxel,
        };

        onChange.call(worldPhysic, offset, voxel);
      }
    },

    tick: () => {
      if (activeIndices.size > 0) {
        console.log("actives", [...activeIndices]);
      }

      const gravity = Vector3.fromZero();
      const velocity = Vector3.fromZero();

      for (const activeIndex of activeIndices) {
        const activeBlock = blocks[activeIndex];

        if (activeBlock === undefined) {
          console.log(`[${activeIndex}]: unknown`);
          activeIndices.delete(activeIndex);

          continue;
        }

        const { state, voxel } = activeBlock;

        // Apply gravity
        gravity.set(gravityIncrement);
        gravity.scale(voxel.mass);

        state.momentum.add(gravity);

        // Move if possible
        velocity.set(state.momentum);
        velocity.scale(1 / voxel.mass);

        state.shift.add(velocity);

        const move = extractMove(state.shift);

        // No move
        if (move === undefined) {
          // No-op
          console.log(
            `[${activeIndex}]`,
            "position",
            offsetOf(activeIndex),
            "velocity",
            velocity,
            "shift",
            state.shift,
            "no move this turn"
          );
        } else {
          const activeOffset = offsetOf(activeIndex);
          const nextOffset = Vector3.fromCustom(
            ["set", activeOffset],
            ["add", move]
          );
          const nextIndex = indexOf(nextOffset);

          state.shift.sub(move);

          if (isValid(nextOffset) && blocks[nextIndex] === undefined) {
            // Move active block to next index
            activeIndices.delete(activeIndex);
            activeIndices.add(nextIndex);

            blocks[activeIndex] = undefined;
            blocks[nextIndex] = activeBlock;

            onChange.call(worldPhysic, activeOffset, undefined);
            onChange.call(worldPhysic, nextOffset, activeBlock.voxel);

            // Activate block above moved one if any
            const aboveOffset = Vector3.fromCustom(
              ["set", activeOffset],
              ["add", aboveIncrement]
            );

            if (isValid(aboveOffset)) {
              activeIndices.add(indexOf(aboveOffset));
            }

            console.log(
              `[${activeIndex}]`,
              "position",
              activeOffset,
              "velocity",
              velocity,
              "shift",
              state.shift,
              "move at",
              activeOffset,
              "to",
              nextOffset
            );
          } else {
            // Transfer momentum to next block if any
            if (isValid(nextOffset)) {
              const nextBlock = blocks[nextIndex];

              if (nextBlock !== undefined) {
                nextBlock.state.momentum.add(state.momentum);

                activeIndices.add(nextIndex);
              }
            }

            // Stop current block if on top of another one
            const belowOffset = Vector3.fromCustom(
              ["set", activeOffset],
              ["add", belowIncrement]
            );

            if (
              !isValid(belowOffset) ||
              blocks[indexOf(belowOffset)] !== undefined
            ) {
              activeIndices.delete(activeIndex);
            }

            state.momentum.set(Vector3.zero);
            state.shift.set(Vector3.zero);

            console.log(
              `[${activeIndex}]`,
              "position",
              activeOffset,
              "velocity",
              velocity,
              "shift",
              state.shift,
              "blocked"
            );
          }
        }
      }
    },
  };

  // Initialize blocks
  for (let y = 0; y < worldSize.y; ++y) {
    for (let x = 0; x < worldSize.x; ++x) {
      for (let z = 0; z < worldSize.z; ++z) {
        const offset = { x, y, z };
        const voxel = onCreate.call(worldPhysic, offset);

        if (voxel !== undefined) {
          const index = indexOf(offset);

          blocks[index] = {
            state: {
              momentum: Vector3.fromZero(),
              shift: Vector3.fromZero(),
            },
            voxel,
          };
        }
      }
    }
  }

  return worldPhysic;
}

export {
  type Voxel,
  type WorldGraphic,
  type WorldPhysic,
  createWorldGraphic,
  createWorldPhysic,
};
