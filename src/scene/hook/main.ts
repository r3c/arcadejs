import { type Application, declare } from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/iterable";
import { loadMeshFromJson } from "../../engine/graphic/model";
import { Matrix3, Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector2, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { GlModel, createModel } from "../../engine/graphic/webgl/model";
import { Mover, createOrbitMover } from "../move";
import { MutableQuaternion, Quaternion } from "../../engine/math/quaternion";
import { Camera, createOrbitCamera } from "../../engine/stage/camera";

type Plane = {
  distance: number;
  normal: Vector3;
};

type Player = {
  rotation: MutableQuaternion;
  position: MutableVector3;
};

type Light = {
  mover: Mover;
  position: MutableVector3;
};

type Updater = (state: ApplicationState, dt: number) => void;

type ApplicationState = {
  camera: Camera;
  input: Input;
  lights: Light[];
  models: {
    floor: GlModel;
    sphere: GlModel;
  };
  surfaces: { collision: boolean; plane: Plane }[];
  player: Player;
  projectionMatrix: Matrix4;
  sceneRenderer: ForwardLightingRenderer;
  target: GlTarget;
  updaters: Updater[];
};

// Move camera
const createCameraUpdater = (): Updater => {
  return (state, dt) => {
    const { camera } = state;

    camera.update(dt);
  };
};

// Update light positions
const createLightUpdater = (): Updater => {
  let time = 0;

  return (state, dt) => {
    const { lights, player } = state;

    for (let i = lights.length; i-- > 0; ) {
      const { mover, position } = lights[i];

      position.set(mover(player.position, time * 0.001));
    }

    time += dt;
  };
};

// Move player
const createPlayerUpdater = (): Updater => {
  const friction = 0.02;
  const mass = 1000;
  const thrust = 0.1;

  const acceleration = Vector3.fromZero();
  const position = Vector3.fromZero();
  const velocityNext = Vector3.fromZero();
  const velocity = Vector3.fromZero();

  let debugNextFrame = false;

  return (state, dt) => {
    const { input, player, surfaces } = state;

    debugNextFrame = input.isPressed("tab");

    // Compute velocity, see: https://gafferongames.com/post/integration_basics/
    const xFactor =
      (input.isPressed("arrowleft") ? -1 : 0) +
      (input.isPressed("arrowright") ? 1 : 0);
    const yFactor =
      (input.isPressed("arrowdown") ? -1 : 0) +
      (input.isPressed("arrowup") ? 1 : 0);

    velocity.set(velocityNext);
    velocity.scale(Math.min(dt * friction, 1));

    acceleration.setFromXYZ(thrust * xFactor, thrust * yFactor, 0);
    acceleration.scale(dt / mass);
    acceleration.sub(velocity);

    velocityNext.add(acceleration);

    velocity.set(velocityNext);
    velocity.scale(dt);

    // Check for collision
    if (Vector3.getLength(velocity) > 0.0001) {
      const positionDelta = Vector3.fromSource(velocity);

      for (const surface of surfaces) {
        position.set(player.position);
        position.add(positionDelta);

        const collision = intersectLineWithPlane(
          player.position,
          position,
          surface.plane
        );

        // Adjust next position according to collision
        surface.collision = collision !== undefined;

        if (collision !== undefined) {
          const ratio = Math.max(collision - 1 / 32, 0);

          if (true) {
            position.set(positionDelta);
            position.scale(ratio);
          } else {
            // FIXME: slide
            position.set(positionDelta);
            position.scale(1 - ratio);
            const undesiredMotion = Vector3.fromSource(surface.plane.normal);
            undesiredMotion.normalize();
            undesiredMotion.scale(Vector3.getDot(undesiredMotion, position));
            position.sub(undesiredMotion);
          }

          // Assign
          positionDelta.set(position);
          position.add(player.position);
        }

        if (debugNextFrame) {
          const p = JSON.stringify(player.position);
          const pn = JSON.stringify(position);
          const v = JSON.stringify(velocity);

          console.log(`p = ${p}, v = ${v}, c = ${collision}, pn = ${pn}`);
        }
      }

      // Update position
      player.position.set(position);
    }
  };
};

// See https://stackoverflow.com/a/35396994
// TODO: avoid allocations
const intersectLineWithPlane = (
  start: Vector3,
  stop: Vector3,
  plane: Plane
): number | undefined => {
  const ray = Vector3.fromSource(stop, ["sub", start]);
  const normalDotRay = Vector3.getDot(plane.normal, ray);
  const normalDotStart = Vector3.getDot(plane.normal, start);

  if (Math.abs(normalDotRay) < Number.EPSILON) {
    return undefined;
  }

  const intersection = (plane.distance - normalDotStart) / normalDotRay;

  return intersection >= 0 && intersection <= 1 ? intersection : undefined;
};

const application: Application<WebGLScreen, ApplicationState, undefined> = {
  async prepare(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getSize());

    // Load meshes
    const sphere = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromIdentity(["scale", { x: 0.25, y: 0.25, z: 0.25 }]),
    });

    const cube = await loadMeshFromJson("model/cube/mesh.json", {
      transform: Matrix4.fromIdentity(["scale", { x: 2, y: 0.01, z: 2 }]),
    });

    // Create state
    const state: ApplicationState = {
      camera: createOrbitCamera(
        {
          getRotate: () => input.fetchMove(Pointer.Grab),
          getMove: () => input.fetchMove(Pointer.Drag),
          getZoom: () => input.fetchZoom(),
        },
        { x: 0, y: 0, z: -5 },
        Vector2.zero
      ),
      input,
      lights: range(2).map((i) => ({
        mover: createOrbitMover(i, 5, 5, 2),
        position: Vector3.fromZero(),
      })),
      models: {
        floor: createModel(gl, cube),
        sphere: createModel(gl, sphere),
      },
      player: {
        rotation: Quaternion.fromIdentity([
          "setFromRotation",
          { x: 0, y: 0, z: 1 },
          0,
        ]),
        position: Vector3.fromZero(),
      },
      projectionMatrix: Matrix4.identity,
      sceneRenderer: new ForwardLightingRenderer(runtime, target, {
        maxPointLights: 3,
        noShadow: true,
      }),
      surfaces: [
        {
          collision: false,
          plane: {
            distance: -1,
            normal: Vector3.fromSource({ x: 0, y: 1, z: 0 }, ["normalize"]),
          },
        },
        {
          collision: false,
          plane: {
            distance: 1,
            normal: Vector3.fromSource({ x: 0, y: 1, z: 0 }, ["normalize"]),
          },
        },
        {
          collision: false,
          plane: {
            distance: -1,
            normal: Vector3.fromSource({ x: 1, y: 1, z: 0 }, ["normalize"]),
          },
        },
        {
          collision: false,
          plane: {
            distance: 1,
            normal: Vector3.fromSource({ x: 1, y: 1, z: 0 }, ["normalize"]),
          },
        },
      ],
      target,
      updaters: [
        createCameraUpdater(),
        createPlayerUpdater(),
        createLightUpdater(),
      ],
    };

    return state;
  },

  render(state) {
    const {
      camera,
      models,
      player,
      projectionMatrix,
      sceneRenderer,
      surfaces,
      target,
    } = state;

    // Draw scene
    target.clear(0);

    const scene: ForwardLightingScene = {
      ambientLightColor: { x: surfaces[0].collision ? 1 : 0.2, y: 0.2, z: 0.2 },
      objects: [
        {
          matrix: Matrix4.fromIdentity([
            "setFromRotationPosition",
            Matrix3.fromIdentity(["setFromQuaternion", player.rotation]),
            player.position,
          ]),
          model: models.sphere,
        },
        ...surfaces.map(({ plane }) => {
          const rotation0 = Matrix3.fromIdentity([
            "setFromQuaternion",
            { scalar: 0, vector: plane.normal },
          ]);

          return {
            matrix: Matrix4.fromIdentity(
              ["setFromRotationPosition", rotation0, Vector3.zero],
              ["translate", { x: 0, y: plane.distance, z: 0 }]
            ),
            model: models.floor,
          };
        }),
      ],
      pointLights: state.lights.map(({ position }) => ({
        color: { x: 1, y: 1, z: 1 },
        position,
        radius: 100,
      })),
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
    };

    sceneRenderer.render(scene);
  },

  resize(state, _, size) {
    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      10000,
    ]);

    state.sceneRenderer.resize(size);
    state.target.resize(size);
  },

  update(state, _, dt) {
    for (const updater of state.updaters) {
      updater(state, dt);
    }
  },
};

const process = declare("Hook", WebGLScreen, undefined, application);

export { process };
