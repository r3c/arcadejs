import { type Application, declare } from "../../engine/application";
import { Gamepad, Pointer } from "../../engine/io/gamepad";
import { type Screen, createWebGLScreen } from "../../engine/graphic/screen";
import { range } from "../../engine/language/iterable";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix3, Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector2, Vector3 } from "../../engine/math/vector";
import { createRuntime, createScreenTarget } from "../../engine/graphic/webgl";
import {
  createModel,
  createDynamicMesh,
} from "../../engine/graphic/webgl/model";
import { Mover, createOrbitMover } from "../move";
import { MutableQuaternion, Quaternion } from "../../engine/math/quaternion";
import { Camera, createOrbitCamera } from "../../engine/stage/camera";
import { createSemiImplicitEulerMovement } from "../../engine/motion/movement";
import {
  createForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/renderer";

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
  gamepad: Gamepad;
  lights: Light[];
  surfaces: { setCollision: (flag: boolean) => void; plane: Plane }[];
  player: Player;
  sphereTransform: MutableMatrix4;
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
    const { gamepad: input, player, sphereTransform, surfaces } = state;

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

      surface.setCollision(collision !== undefined);
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
    sphereTransform.setFromRotationPosition(
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

const createApplication = async (
  screen: Screen<WebGL2RenderingContext>,
  gamepad: Gamepad
): Promise<Application<unknown>> => {
  const gl = screen.getContext();
  const runtime = createRuntime(gl);
  const target = createScreenTarget(gl);

  // Load meshes
  const floor0Mesh = await loadMeshFromJson("model/cube/mesh.json", {
    transform: Matrix4.fromIdentity(["scale", { x: 2, y: 0.01, z: 2 }]),
  });

  const floor1Mesh = await loadMeshFromJson("model/cube-color/mesh.json", {
    transform: Matrix4.fromIdentity(["scale", { x: 2, y: 0.01, z: 2 }]),
  });

  const sphereMesh = await loadMeshFromJson("model/sphere/mesh.json", {
    transform: Matrix4.fromIdentity(["scale", { x: 0.25, y: 0.25, z: 0.25 }]),
  });

  // Declare collision surfaces
  const planes: Plane[] = [
    {
      distance: 1,
      normal: Vector3.fromSource({ x: 0, y: -1, z: 0 }, ["normalize"]),
    },
    {
      distance: 1,
      normal: Vector3.fromSource({ x: 0, y: 1, z: 0 }, ["normalize"]),
    },
    {
      distance: 1,
      normal: Vector3.fromSource({ x: 1, y: 1, z: 0 }, ["normalize"]),
    },
    {
      distance: 1,
      normal: Vector3.fromSource({ x: -1, y: -1, z: 0 }, ["normalize"]),
    },
  ];

  // Create renderer
  const renderer = createForwardLightingRenderer(runtime, {
    maxPointLights: 3,
    noShadow: true,
  });

  const sphereModel = createModel(gl, sphereMesh);
  const sphere = createDynamicMesh(sphereModel.mesh);

  renderer.addSubject({ mesh: sphere.mesh });

  const floor0Model = createModel(gl, floor0Mesh);
  const floor1Model = createModel(gl, floor1Mesh);
  const surfaces: ApplicationState["surfaces"] = [];

  for (const plane of planes) {
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

    const floor0 = createDynamicMesh(floor0Model.mesh);

    floor0.transform.setFromRotationPosition(rotation, Vector3.zero);
    floor0.transform.translate({ x: 0, y: plane.distance, z: 0 });

    const floor1 = createDynamicMesh(floor1Model.mesh);

    floor1.transform.setFromRotationPosition(rotation, Vector3.zero);
    floor1.transform.translate({ x: 0, y: plane.distance, z: 0 });

    let collision = true;
    let remove = () => {};

    const setCollision = (flag: boolean) => {
      if (collision === flag) {
        return;
      }

      remove();

      collision = flag;
      remove = renderer.addSubject({ mesh: flag ? floor1.mesh : floor0.mesh });
    };

    surfaces.push({ plane, setCollision });

    setCollision(false);
  }

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
  const projection = Matrix4.fromIdentity();
  const state: ApplicationState = {
    camera,
    gamepad: gamepad,
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
    sphereTransform: sphere.transform,
    surfaces,
  };
  const updaters = [
    createCameraUpdater(),
    createPlayerUpdater(),
    createLightUpdater(),
  ];

  return {
    async setConfiguration() {},

    release() {
      renderer.release();
      runtime.release();
      floor0Model.release();
      sphereModel.release();
    },

    render() {
      // Draw scene
      target.clear();

      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
        pointLights: state.lights.map(({ position }) => ({
          color: { x: 1, y: 1, z: 1 },
          position,
          radius: 100,
        })),
        projection,
        view: camera.viewMatrix,
      };

      renderer.render(target, scene);
    },

    setSize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 10000);
      renderer.setSize(size);
      target.setSize(size);
    },

    update(dt) {
      for (const updater of updaters) {
        updater(state, dt);
      }
    },
  };
};

const process = declare("Collision", createWebGLScreen, createApplication, {});

export { process };
