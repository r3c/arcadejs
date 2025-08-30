import { type Application, declare } from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix3, Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector2, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { createModel } from "../../engine/graphic/webgl/model";
import { Mover, createOrbitMover } from "../move";
import { MutableQuaternion, Quaternion } from "../../engine/math/quaternion";
import { Camera, createOrbitCamera } from "../../engine/stage/camera";
import { createSemiImplicitEulerMovement } from "../../engine/motion/movement";
import {
  createForwardLightingRenderer,
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/renderer/forward-lighting";
import { RendererSubject } from "../../engine/graphic/renderer";

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
  surfaces: { collision: boolean; plane: Plane }[];
  player: Player;
  projectionMatrix: Matrix4;
  renderer: ForwardLightingRenderer;
  sphereSubject: RendererSubject;
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
  const friction = 0.01;
  const mass = 2000;
  const thrust = 0.1;

  const target = Vector3.fromZero();
  const undesired = Vector3.fromZero();
  const velocity = Vector3.fromZero();
  const xMovement = createSemiImplicitEulerMovement();
  const yMovement = createSemiImplicitEulerMovement();

  return (state, dt) => {
    const { input, player, sphereSubject, surfaces } = state;

    const xDelta =
      (input.isPressed("arrowleft") ? -thrust : 0) +
      (input.isPressed("arrowright") ? thrust : 0);
    const yDelta =
      (input.isPressed("arrowdown") ? -thrust : 0) +
      (input.isPressed("arrowup") ? thrust : 0);

    const xSpeed = xMovement.impulse(xDelta, friction, mass, dt);
    const ySpeed = yMovement.impulse(yDelta, friction, mass, dt);

    velocity.setFromXYZ(xSpeed, ySpeed, 0);

    // Collision step 1: collide and slide
    for (const surface of surfaces) {
      target.set(player.position);
      target.add(velocity);

      const collision = intersectLineWithPlane(
        player.position,
        target,
        surface.plane
      );

      if (collision !== undefined) {
        // Slide along wall https://gamedev.stackexchange.com/questions/200354/how-to-slide-along-a-wall-at-full-speed
        undesired.set(surface.plane.normal);
        undesired.normalize();
        undesired.scale(Vector3.getDot(undesired, velocity));
        velocity.sub(undesired);
      }

      surface.collision = collision !== undefined;
    }

    // Collision step 2: prevent crossing a wall
    for (const surface of surfaces) {
      target.set(player.position);
      target.add(velocity);

      const collision = intersectLineWithPlane(
        player.position,
        target,
        surface.plane
      );

      if (collision !== undefined) {
        velocity.scale(collision);
      }
    }

    // Update position
    player.position.add(velocity);

    // Reflect into subject
    sphereSubject.transform.setFromRotationPosition(
      Matrix3.fromIdentity(["setFromQuaternion", player.rotation]),
      player.position
    );
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

  if (normalDotRay < 0) {
    return undefined;
  }

  const intersection = (plane.distance - normalDotStart) / normalDotRay;

  return intersection >= 0 && intersection <= 1 ? intersection : undefined;
};

const application: Application<WebGLScreen, ApplicationState, object> = {
  async create(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getSize());

    // Load meshes
    const floor0 = await loadMeshFromJson("model/cube/mesh.json", {
      transform: Matrix4.fromIdentity(["scale", { x: 2, y: 0.01, z: 2 }]),
    });

    const sphere = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromIdentity(["scale", { x: 0.25, y: 0.25, z: 0.25 }]),
    });

    // Declare collision surfaces
    const surfaces: { collision: boolean; plane: Plane }[] = [
      {
        collision: false,
        plane: {
          distance: 1,
          normal: Vector3.fromSource({ x: 0, y: -1, z: 0 }, ["normalize"]),
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
          distance: 1,
          normal: Vector3.fromSource({ x: 1, y: 1, z: 0 }, ["normalize"]),
        },
      },
      {
        collision: false,
        plane: {
          distance: 1,
          normal: Vector3.fromSource({ x: -1, y: -1, z: 0 }, ["normalize"]),
        },
      },
    ];

    // Create renderer
    const renderer = createForwardLightingRenderer(runtime, target, {
      maxPointLights: 3,
      noShadow: true,
    });

    const sphereSubject = renderer.register({ model: createModel(gl, sphere) });

    const floor0Model = createModel(gl, floor0);

    for (const { plane } of surfaces) {
      const t0 = Vector3.fromSource(
        plane.normal,
        ["cross", { x: 1, y: 0, z: 0 }],
        ["normalize"]
      );

      const t2 = Vector3.fromSource(plane.normal, ["cross", t0], ["normalize"]);

      const rotation = Matrix3.fromIdentity([
        "setFromVectors",
        t0,
        plane.normal,
        t2,
      ]);

      const subject = renderer.register({ model: floor0Model });

      subject.transform.setFromRotationPosition(rotation, Vector3.zero);
      subject.transform.translate({ x: 0, y: plane.distance, z: 0 });
    }

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
      player: {
        rotation: Quaternion.fromIdentity([
          "setFromRotation",
          { x: 0, y: 0, z: 1 },
          0,
        ]),
        position: Vector3.fromZero(),
      },
      projectionMatrix: Matrix4.identity,
      renderer,
      sphereSubject,
      surfaces,
      target,
      updaters: [
        createCameraUpdater(),
        createPlayerUpdater(),
        createLightUpdater(),
      ],
    };

    return state;
  },

  async change() {},

  render(state) {
    const { camera, projectionMatrix, renderer, target } = state;

    // Draw scene
    target.clear(0);

    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
      pointLights: state.lights.map(({ position }) => ({
        color: { x: 1, y: 1, z: 1 },
        position,
        radius: 100,
      })),
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
    };

    renderer.render(scene);
  },

  resize(state, size) {
    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      10000,
    ]);

    state.renderer.resize(size);
    state.target.resize(size);
  },

  update(state, dt) {
    for (const updater of state.updaters) {
      updater(state, dt);
    }
  },
};

const process = declare("Collision", WebGLScreen, {}, application);

export { process };
