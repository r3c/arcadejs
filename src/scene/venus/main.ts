import { type Application, declare } from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import {
  Mesh,
  changeMeshCenter,
  loadMeshFrom3ds,
  loadMeshFromJson,
  loadMeshFromObj,
} from "../../engine/graphic/mesh";
import { Matrix3, Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import {
  GlTarget,
  createRuntime,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import {
  ParticleRenderer,
  ParticleEmitter,
} from "../../engine/graphic/webgl/renderers/particle";
import { loadFromURL } from "../../engine/graphic/image";
import { EasingType, getEasing } from "../../engine/math/easing";
import { createModel } from "../../engine/graphic/webgl/model";
import { createFloatSequence } from "../../engine/math/random";
import { Mover, createOrbitMover } from "../move";
import { MutableQuaternion, Quaternion } from "../../engine/math/quaternion";
import { Camera, createBehindCamera } from "../../engine/stage/camera";
import { createSemiImplicitEulerMovement } from "../../engine/motion/movement";
import {
  createForwardLightingRenderer,
  ForwardLightingScene,
  RendererSubject,
} from "../../engine/graphic/renderer";

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
  input: Input;
  lights: Light[];
  lightSubjects: RendererSubject[];
  player: Player;
  particleRenderer: ParticleRenderer;
  particleEmitter0: ParticleEmitter<number>;
  shipSubject: RendererSubject;
  stars: Star[];
  starSubjects: RendererSubject[];
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
    const { lights, lightSubjects, player } = state;

    for (let i = lights.length; i-- > 0; ) {
      const lightSubject = lightSubjects[i];
      const { mover, position } = lights[i];

      position.set(mover(player.position, time * 0.001));

      lightSubject.transform.set(Matrix4.identity);
      lightSubject.transform.translate(position);
    }

    time += dt;
  };
};

// Emit particles & update them
const createParticleUpdater = (): Updater => {
  const smokeOrigin = Vector3.fromZero();

  let smoke = 0;

  return (state, dt) => {
    const { particleEmitter0, particleRenderer, player } = state;

    smoke += dt;

    if (smoke >= 20) {
      for (const smokeCenter of playerSmokeCenters) {
        smokeOrigin.set(smokeCenter);
        smokeOrigin.rotate(player.rotation);
        smokeOrigin.add(player.position);

        particleEmitter0(10, smokeOrigin, Math.random());
      }

      smoke -= 20;
    }

    particleRenderer.update(dt);
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
    const { input, player, shipSubject } = state;

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

    shipSubject.transform.setFromRotationPosition(
      Matrix3.fromIdentity(["setFromQuaternion", player.rotation]),
      player.position
    );
  };
};

// Update star positions
const createStarUpdater = (): Updater => {
  return (state, dt) => {
    const { player, stars, starSubjects } = state;

    for (let i = stars.length; i-- > 0; ) {
      const star = stars[i];
      const starSubject = starSubjects[i];
      const { position, rotationAxis } = star;

      position.x = warp(position.x, player.position.x, 100);
      position.y = warp(position.y, player.position.y, 100);
      position.z = warp(position.z, player.position.z, 100);

      star.rotationAmount += dt * star.rotationSpeed;

      starSubject.transform.set(Matrix4.identity);
      starSubject.transform.translate(position);
      starSubject.transform.rotate(rotationAxis, star.rotationAmount);
    }
  };
};

const warp = (position: number, center: number, radius: number): number => {
  const range = radius * 2;
  const shift = center - radius;

  return ((position - shift + range) % range) + shift;
};

const applicationBuilder = async (
  screen: WebGLScreen
): Promise<Application<unknown>> => {
  const gl = screen.context;
  const input = new Input(screen.canvas);
  const runtime = createRuntime(gl);
  const target = new GlTarget(gl, screen.getSize());

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
  const particleRenderer = new ParticleRenderer(runtime, target);

  const particleEasing0 = getEasing(EasingType.QuadraticOut);
  const particleEmitter0 = particleRenderer.register<number>(
    1000,
    sprite,
    5,
    (seed) => {
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
    }
  );

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
    getZoom: () => input.fetchZoom(),
  });

  const sceneRenderer = createForwardLightingRenderer(runtime, target, {
    maxPointLights: 3,
    noShadow: true,
  });

  // Ship
  const shipModel = createModel(gl, shipMesh);
  const shipSubject = sceneRenderer.register({
    mesh: shipModel.mesh,
  });

  // Lights
  const lights = range(2).map((i) => ({
    mover: createOrbitMover(i, 5, 5, 2),
    position: Vector3.fromZero(),
  }));

  const lightModel = createModel(gl, lightMesh);
  const lightSubjects = lights.map(() =>
    sceneRenderer.register({ mesh: lightModel.mesh, noShadow: true })
  );

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
  const starSubjects = stars.map(({ variant }) =>
    sceneRenderer.register({ mesh: starModels[variant].mesh })
  );

  // Create state
  const projectionMatrix = Matrix4.fromIdentity();
  const state: ApplicationState = {
    input,
    lights,
    lightSubjects,
    player,
    particleEmitter0,
    particleRenderer,
    shipSubject,
    stars,
    starSubjects,
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

    dispose() {
      for (const starModel of starModels) {
        starModel.dispose();
      }

      lightModel.dispose();
      particleRenderer.dispose();
      runtime.dispose();
      sceneRenderer.dispose();
      shipModel.dispose();
      sprite.dispose();
      target.dispose();
    },

    render() {
      // Draw scene
      target.clear(0);

      const scene: ForwardLightingScene = {
        ambientLightColor: { x: 0, y: 0, z: 0 },
        pointLights: state.lights.map(({ position }) => ({
          color: { x: 1, y: 1, z: 1 },
          position,
          radius: 100,
        })),
        projectionMatrix,
        viewMatrix: camera.viewMatrix,
      };

      sceneRenderer.render(scene);
      particleRenderer.render(scene);
    },

    resize(size) {
      particleRenderer.resize(size);
      projectionMatrix.setFromPerspective(
        Math.PI / 4,
        size.x / size.y,
        0.1,
        10000
      );
      sceneRenderer.resize(size);
      target.resize(size);
    },

    update(dt) {
      for (const updater of updaters) {
        updater(state, dt);
      }
    },
  };
};

const process = declare("Venus³", WebGLScreen, applicationBuilder, {});

export { process };
