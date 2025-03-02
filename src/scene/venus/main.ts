import { type Application, declare } from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/iterable";
import {
  Mesh,
  changeMeshCenter,
  loadMeshFrom3ds,
  loadMeshFromJson,
  loadMeshFromObj,
} from "../../engine/graphic/model";
import { Matrix3, Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
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
import { GlModel, createModel } from "../../engine/graphic/webgl/model";
import { GlTexture } from "../../engine/graphic/webgl/texture";
import { createFloatSequence } from "../../engine/math/random";
import { Mover, createOrbitMover } from "../move";
import { MutableQuaternion, Quaternion } from "../../engine/math/quaternion";

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
  models: {
    light: GlModel;
    ship: GlModel;
    stars: GlModel[];
  };
  move: number;
  player: Player;
  particleRenderer: ParticleRenderer;
  particleEmitter0: ParticleEmitter<number>;
  projectionMatrix: Matrix4;
  sceneRenderer: ForwardLightingRenderer;
  sprite: GlTexture;
  stars: Star[];
  target: GlTarget;
  updaters: Updater[];
  viewMatrix: MutableMatrix4;
  zoom: number;
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
const createCameraUpdater = (initialRotation: Quaternion): Updater => {
  const position = Vector3.fromZero();
  const rotation = Quaternion.fromSource(initialRotation);
  const rotationInverse = Quaternion.fromIdentity();
  const rotationMatrix3 = Matrix3.fromIdentity();
  const rotationMatrix4 = Matrix4.fromIdentity();

  return (state) => {
    const { input, player, viewMatrix } = state;

    state.zoom += input.fetchZoom() * 0.2;

    position.set(player.position);
    position.negate();

    rotation.slerp(player.rotation, 0.05);
    rotationInverse.set(rotation);
    rotationInverse.conjugate();
    rotationMatrix3.setFromQuaternion(rotationInverse);
    rotationMatrix4.setFromRotationPosition(rotationMatrix3, Vector3.zero);

    viewMatrix.set(Matrix4.identity);
    viewMatrix.translate({ x: 0, y: 0, z: state.zoom });
    viewMatrix.rotate({ x: 0, y: 1, z: 0 }, Math.PI);
    viewMatrix.multiply(rotationMatrix4);
    viewMatrix.translate(position);
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
  const friction = 0.001;
  const mass = 1000;
  const rotationSpeed = 0.02;
  const thrust = 0.02;

  const acceleration = Vector3.fromZero();
  const rotation = Quaternion.fromIdentity();
  const velocity = Vector3.fromZero();
  const velocityDelta = Vector3.fromZero();

  return (state, dt) => {
    const { input, player } = state;

    const horizontalRotationSpeed =
      (input.isPressed("arrowleft") ? rotationSpeed : 0) +
      (input.isPressed("arrowright") ? -rotationSpeed : 0);
    const verticalRotationSpeed =
      (input.isPressed("arrowdown") ? rotationSpeed : 0) +
      (input.isPressed("arrowup") ? -rotationSpeed : 0);

    rotation.setFromRotation({ x: 0, y: 1, z: 0 }, horizontalRotationSpeed);
    player.rotation.multiply(rotation);
    rotation.setFromRotation({ x: 1, y: 0, z: 0 }, verticalRotationSpeed);
    player.rotation.multiply(rotation);

    // See: https://gafferongames.com/post/integration_basics/
    const accelerationFactor = input.isPressed("space") ? 1 : 0;

    velocityDelta.set(velocity);
    velocityDelta.scale(Math.min(dt * friction, 1));

    acceleration.setFromXYZ(0, 0, accelerationFactor);
    acceleration.rotate(player.rotation);
    acceleration.scale((dt * thrust) / mass);
    acceleration.sub(velocityDelta);

    velocity.add(acceleration);

    velocityDelta.set(velocity);
    velocityDelta.scale(dt);

    player.position.add(velocityDelta);

    player.position.x = warp(player.position.x, 0, 10000);
    player.position.y = warp(player.position.y, 0, 10000);
    player.position.z = warp(player.position.z, 0, 10000);
  };
};

// Update star positions
const createStarUpdater = (): Updater => {
  return (state, dt) => {
    const { player, stars } = state;

    for (let i = stars.length; i-- > 0; ) {
      const { position } = stars[i];

      position.x = warp(position.x, player.position.x, 100);
      position.y = warp(position.y, player.position.y, 100);
      position.z = warp(position.z, player.position.z, 100);

      stars[i].rotationAmount += dt * stars[i].rotationSpeed;
    }
  };
};

const warp = (position: number, center: number, radius: number): number => {
  const range = radius * 2;
  const shift = center - radius;

  return ((position - shift + range) % range) + shift;
};

const application: Application<WebGLScreen, ApplicationState, undefined> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getSize());

    // Load meshes
    const lightModel = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.25, y: 0.25, z: 0.25 },
      ]),
    });

    const shipModel = await loadMeshFrom3ds("model/colmftr1/COLMFTR1.3DS", {
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

    // Create state
    const state: ApplicationState = {
      input: new Input(screen.canvas),
      lights: range(2).map((i) => ({
        mover: createOrbitMover(i, 5, 5, 2),
        position: Vector3.fromZero(),
      })),
      models: {
        light: createModel(gl, lightModel),
        ship: createModel(gl, shipModel),
        stars: starMeshes.map((mesh) => createModel(gl, mesh)),
      },
      move: 0,
      player,
      particleEmitter0,
      particleRenderer,
      projectionMatrix: Matrix4.identity,
      sceneRenderer: new ForwardLightingRenderer(runtime, target, {
        maxPointLights: 3,
        noShadow: true,
      }),
      sprite,
      stars: range(starFieldCount).map(() => {
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
      }),
      target,
      updaters: [
        createCameraUpdater(player.rotation),
        createPlayerUpdater(),
        createParticleUpdater(),
        createStarUpdater(),
        createLightUpdater(),
      ],
      viewMatrix: Matrix4.fromIdentity(),
      zoom: -25,
    };

    return state;
  },

  render(state) {
    const {
      models,
      player,
      particleRenderer,
      projectionMatrix,
      sceneRenderer,
      target,
      viewMatrix,
    } = state;

    // Draw scene
    target.clear(0);

    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0, y: 0, z: 0 },
      objects: [
        {
          matrix: Matrix4.fromIdentity([
            "setFromRotationPosition",
            Matrix3.fromIdentity(["setFromQuaternion", player.rotation]),
            player.position,
          ]),
          model: models.ship,
        },
        ...state.stars.map(
          ({ position, rotationAmount, rotationAxis, variant }) => ({
            matrix: Matrix4.fromSource(
              Matrix4.identity,
              ["translate", position],
              ["rotate", rotationAxis, rotationAmount]
            ),
            model: models.stars[variant],
          })
        ),
        ...state.lights.map(({ position }) => ({
          matrix: Matrix4.fromSource(Matrix4.identity, ["translate", position]),
          model: models.light,
          noShadow: true,
        })),
      ],
      pointLights: state.lights.map(({ position }) => ({
        color: { x: 1, y: 1, z: 1 },
        position,
        radius: 100,
      })),
      projectionMatrix,
      viewMatrix,
    };

    sceneRenderer.render(scene);
    particleRenderer.render(scene);
  },

  resize(state, _, size) {
    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      10000,
    ]);

    state.particleRenderer.resize(size);
    state.sceneRenderer.resize(size);
    state.target.resize(size);
  },

  update(state, _, dt) {
    for (const updater of state.updaters) {
      updater(state, dt);
    }
  },
};

const process = declare("Venus³", WebGLScreen, undefined, application);

export { process };
