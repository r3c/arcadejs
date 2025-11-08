import { type Application, declare } from "../../engine/application";
import { Gamepad } from "../../engine/io/gamepad";
import { type Screen, createWebGLScreen } from "../../engine/graphic/screen";
import { range } from "../../engine/language/iterable";
import {
  Mesh,
  changeMeshCenter,
  loadMeshFrom3ds,
  loadMeshFromJson,
  loadMeshFromObj,
} from "../../engine/graphic/mesh";
import { Matrix3, Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import {
  createRuntime,
  createScreenTarget,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import {
  ForwardLightingScene,
  createForwardLightingRenderer,
} from "../../engine/graphic/renderer";
import { loadFromURL } from "../../engine/graphic/image";
import { EasingType, getEasing } from "../../engine/math/easing";
import {
  createModel,
  createDynamicMesh,
} from "../../engine/graphic/webgl/model";
import { createFloatSequence } from "../../engine/math/random";
import { Mover, createOrbitMover } from "../move";
import { MutableQuaternion, Quaternion } from "../../engine/math/quaternion";
import { Camera, createBehindCamera } from "../../engine/stage/camera";
import { createSemiImplicitEulerMovement } from "../../engine/motion/movement";
import {
  createParticleEmitter,
  ParticleEmitter,
  ParticleSpawn,
} from "../../engine/graphic/webgl/particle";

type Player = {
  rotation: MutableQuaternion;
  position: MutableVector3;
};

type Light = {
  mover: Mover;
  position: MutableVector3;
};

type Star = {
  position: MutableVector3;
  rotationAmount: number;
  rotationAxis: Vector3;
  rotationSpeed: number;
  variant: number;
};

type Updater = (state: ApplicationState, dt: number) => void;

type ApplicationState = {
  gamepad: Gamepad;
  lights: Light[];
  lightTransforms: MutableMatrix4[];
  player: Player;
  particleEmitter: ParticleEmitter;
  particleSpawn0: ParticleSpawn<number>;
  shipTransform: MutableMatrix4;
  stars: Star[];
  starTransforms: MutableMatrix4[];
};

const pi2 = Math.PI * 2;

const playerSmokeCenters: Vector3[] = [
  { x: +0.7, y: +0.35, z: -4.2 },
  { x: +0, y: +0.9, z: -4.2 },
  { x: -0.7, y: +0.35, z: -4.2 },
];

const starFieldCount = 1000;
const starFieldRadius = 1000;

// Move camera
const createCameraUpdater = (camera: Camera): Updater => {
  return (_, dt) => {
    camera.update(dt);
  };
};

// Update light positions
const createLightUpdater = (): Updater => {
  let time = 0;

  return (state, dt) => {
    const { lights, lightTransforms, player } = state;

    for (let i = lights.length; i-- > 0; ) {
      const { mover, position } = lights[i];
      const transform = lightTransforms[i];

      position.set(mover(player.position, time * 0.001));

      transform.set(Matrix4.identity);
      transform.translate(position);
    }

    time += dt;
  };
};

// Emit particles & update them
const createParticleUpdater = (): Updater => {
  const smokeOrigin = Vector3.fromZero();

  let smoke = 0;

  return (state, dt) => {
    const { particleSpawn0, particleEmitter, player } = state;

    smoke += dt;

    if (smoke >= 20) {
      for (const smokeCenter of playerSmokeCenters) {
        smokeOrigin.set(smokeCenter);
        smokeOrigin.rotate(player.rotation);
        smokeOrigin.add(player.position);

        particleSpawn0(10, smokeOrigin, Math.random());
      }

      smoke -= 20;
    }

    particleEmitter.update(dt);
  };
};

// Move player
const createPlayerUpdater = (): Updater => {
  const mass = 1000;
  const pFriction = 0.001;
  const pThrust = 0.02;
  const rFriction = 0.005;
  const rThrust = 0.005;

  const positionDelta = Vector3.fromZero();
  const rotation = Quaternion.fromIdentity();
  const x = createSemiImplicitEulerMovement();
  const y = createSemiImplicitEulerMovement();
  const z = createSemiImplicitEulerMovement();
  const h = createSemiImplicitEulerMovement();
  const v = createSemiImplicitEulerMovement();

  return (state, dt) => {
    const { gamepad: input, player, shipTransform } = state;

    const horizontalDelta =
      (input.isPressed("arrowleft") ? rThrust : 0) +
      (input.isPressed("arrowright") ? -rThrust : 0);
    const verticalDelta =
      (input.isPressed("arrowdown") ? rThrust : 0) +
      (input.isPressed("arrowup") ? -rThrust : 0);

    const horizontalSpeed = h.impulse(horizontalDelta, rFriction, mass, dt);
    const verticalSpeed = v.impulse(verticalDelta, rFriction, mass, dt);

    rotation.setFromRotation({ x: 0, y: 1, z: 0 }, horizontalSpeed);
    player.rotation.multiply(rotation);
    rotation.setFromRotation({ x: 1, y: 0, z: 0 }, verticalSpeed);
    player.rotation.multiply(rotation);

    const positionFactor = input.isPressed("space") ? 1 : 0;

    positionDelta.setFromXYZ(0, 0, positionFactor * pThrust);
    positionDelta.rotate(player.rotation);

    player.position.x += x.impulse(positionDelta.x, pFriction, mass, dt);
    player.position.y += y.impulse(positionDelta.y, pFriction, mass, dt);
    player.position.z += z.impulse(positionDelta.z, pFriction, mass, dt);
    player.position.x = warp(player.position.x, 0, 10000);
    player.position.y = warp(player.position.y, 0, 10000);
    player.position.z = warp(player.position.z, 0, 10000);

    shipTransform.setFromRotationPosition(
      Matrix3.fromIdentity(["setFromQuaternion", player.rotation]),
      player.position
    );
  };
};

// Update star positions
const createStarUpdater = (): Updater => {
  return (state, dt) => {
    const { player, stars, starTransforms } = state;

    for (let i = stars.length; i-- > 0; ) {
      const star = stars[i];
      const { position, rotationAxis } = star;
      const transform = starTransforms[i];

      position.x = warp(position.x, player.position.x, 100);
      position.y = warp(position.y, player.position.y, 100);
      position.z = warp(position.z, player.position.z, 100);

      star.rotationAmount += dt * star.rotationSpeed;

      transform.set(Matrix4.identity);
      transform.translate(position);
      transform.rotate(rotationAxis, star.rotationAmount);
    }
  };
};

const warp = (position: number, center: number, radius: number): number => {
  const range = radius * 2;
  const shift = center - radius;

  return ((position - shift + range) % range) + shift;
};

const createApplication = async (
  screen: Screen<WebGL2RenderingContext>,
  gamepad: Gamepad
): Promise<Application<unknown>> => {
  const gl = screen.getContext();
  const runtime = createRuntime(gl);
  const target = createScreenTarget(gl);

  // Load meshes
  const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "scale",
      { x: 0.25, y: 0.25, z: 0.25 },
    ]),
  });

  const shipMesh = await loadMeshFrom3ds("model/colmftr1/COLMFTR1.3DS", {
    transform: Matrix4.fromSource(Matrix4.identity, [
      "translate",
      { x: 0, y: 4, z: 0 },
    ]),
  });

  const starMesh = await loadMeshFromObj(
    "model/asteroid/Asteroid_Asset_Pack.obj",
    { format: { variables: { type: "rock_0005" } } }
  );

  const starMeshes: Mesh[] = starMesh.children.map((child) =>
    changeMeshCenter(child)
  );

  // Load textures
  const spriteImage = await loadFromURL("model/particle/fire.png");
  const sprite = loadTextureQuad(gl, spriteImage);

  // Particle effects
  const particleEmitter = createParticleEmitter(runtime);

  const particleEasing0 = getEasing(EasingType.QuadraticOut);
  const particleSpawn0 = particleEmitter.define<number>({
    initialize: (seed) => {
      const sequence = createFloatSequence(seed);

      return (spark, rankSpan, timeSpan) => {
        const pitch = sequence(rankSpan + 0.1) * pi2;
        const roll = sequence(rankSpan + 0.2) * pi2;
        const rotationAngle = sequence(rankSpan + 0.3) * pi2;
        const rotationSpeed = sequence(rankSpan + 0.4) - 0.5;
        const velocity = sequence(rankSpan + 0.5) * 0.5;
        const position = particleEasing0(timeSpan * velocity);

        spark.position.x = Math.cos(pitch) * Math.cos(roll) * position;
        spark.position.y = Math.sin(pitch) * Math.cos(roll) * position;
        spark.position.z = Math.sin(roll) * position;
        spark.radius = (1 - timeSpan) * 0.5;
        spark.rotation = (rotationAngle + timeSpan * rotationSpeed) * pi2;
        spark.tint.x = 0.4;
        spark.tint.y = 0.4;
        spark.tint.z = 1;
        spark.tint.w = (1 - timeSpan) * 0.5;
        spark.variant = Math.floor((rankSpan * 5) % 5);
      };
    },
    duration: 1000,
    sprite,
    variants: 5,
  });

  const player: Player = {
    rotation: Quaternion.fromIdentity([
      "setFromRotation",
      { x: 1, y: 0, z: 0 },
      0,
    ]),
    position: Vector3.fromZero(),
  };

  const camera = createBehindCamera({
    getPosition: () => player.position,
    getRotation: () => player.rotation,
    getZoom: () => gamepad.fetchZoom(),
  });

  const sceneRenderer = createForwardLightingRenderer(runtime, {
    maxPointLights: 3,
    noShadow: true,
  });

  // Ship
  const shipModel = createModel(gl, shipMesh);
  const ship = createDynamicMesh(shipModel.mesh);
  const shipTransform = ship.transform;

  sceneRenderer.append({ mesh: ship.mesh });

  // Lights
  const lights = range(2).map((i) => ({
    mover: createOrbitMover(i, 5, 5, 2),
    position: Vector3.fromZero(),
  }));

  const lightModel = createModel(gl, lightMesh);
  const lightTransforms = lights.map(() => {
    const { mesh, transform } = createDynamicMesh(lightModel.mesh);

    sceneRenderer.append({ mesh, noShadow: true });

    return transform;
  });

  // Stars
  const stars = range(starFieldCount).map(() => {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const z = Math.sqrt(x * x + y * y);

    return {
      position: Vector3.fromSource({
        x: (Math.random() * 2 - 1) * starFieldRadius,
        y: (Math.random() * 2 - 1) * starFieldRadius,
        z: (Math.random() * 2 - 1) * starFieldRadius,
      }),
      rotationAmount: 0,
      rotationAxis: { x, y, z },
      rotationSpeed: Math.random() * 0.001,
      variant: Math.floor(Math.random() * starMeshes.length),
    };
  });

  const starModels = starMeshes.map((mesh) => createModel(gl, mesh));
  const starTransforms = stars.map(({ variant }) => {
    const { mesh, transform } = createDynamicMesh(starModels[variant].mesh);

    sceneRenderer.append({ mesh });

    return transform;
  });

  // Create state
  const projection = Matrix4.fromIdentity();
  const state: ApplicationState = {
    gamepad: gamepad,
    lights,
    lightTransforms,
    player,
    particleEmitter,
    particleSpawn0,
    shipTransform,
    stars,
    starTransforms,
  };
  const updaters = [
    createCameraUpdater(camera),
    createPlayerUpdater(),
    createParticleUpdater(),
    createStarUpdater(),
    createLightUpdater(),
  ];

  return {
    async change() {},

    release() {
      for (const starModel of starModels) {
        starModel.release();
      }

      lightModel.release();
      particleEmitter.release();
      runtime.release();
      sceneRenderer.release();
      shipModel.release();
      sprite.release();
    },

    render() {
      // Draw scene
      target.clear();

      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0, y: 0, z: 0 },
        pointLights: state.lights.map(({ position }) => ({
          color: { x: 1, y: 1, z: 1 },
          position,
          radius: 100,
        })),
        projection,
        view: camera.viewMatrix,
      };

      sceneRenderer.render(target, scene);
      particleEmitter.render(target, scene);
    },

    resize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 10000);
      sceneRenderer.resize(size);
      target.setSize(size);
    },

    update(dt) {
      for (const updater of updaters) {
        updater(state, dt);
      }
    },
  };
};

const process = declare("Venus³", createWebGLScreen, createApplication, {});

export { process };
