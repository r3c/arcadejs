import { type Application, configure, declare } from "../../engine/application";
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
  cameraRotation: MutableQuaternion;
  rotation: MutableQuaternion;
  position: MutableVector3;
  smoke: number;
  velocity: MutableVector3;
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
  time: number;
  viewMatrix: MutableMatrix4;
  zoom: number;
};

const pi2 = Math.PI * 2;

const friction = 0.001;
const mass = 1000;
const thrust = 0.05;

const playerSmokeCenters: Vector3[] = [
  { x: +0.7, y: +0.35, z: -4.2 },
  { x: +0, y: +0.9, z: -4.2 },
  { x: -0.7, y: +0.35, z: -4.2 },
];

const starFieldCount = 1000;
const starFieldRadius = 1000;

// See: https://gafferongames.com/post/integration_basics/
const movePlayer = (input: Input, player: Player, dt: number): void => {
  const rotationSpeed = 0.02;

  player.rotation.multiply(
    Quaternion.fromIdentity([
      "setRotation",
      { x: 0, y: 1, z: 0 },
      ((input.isPressed("arrowleft") ? 1 : 0) +
        (input.isPressed("arrowright") ? -1 : 0)) *
        rotationSpeed,
    ])
  );

  player.rotation.multiply(
    Quaternion.fromIdentity([
      "setRotation",
      { x: 1, y: 0, z: 0 },
      ((input.isPressed("arrowdown") ? 1 : 0) +
        (input.isPressed("arrowup") ? -1 : 0)) *
        rotationSpeed,
    ])
  );

  const velocity = Vector3.fromSource(player.velocity, [
    "scale",
    Math.min(dt * friction, 1),
  ]);

  const acceleration = Vector3.fromSource(
    Quaternion.rotate(
      { x: 0, y: 0, z: input.isPressed("space") ? 1 : 0 },
      player.rotation
    ),
    ["scale", (dt * thrust) / mass],
    ["sub", velocity]
  );

  player.velocity.add(acceleration);

  velocity.set(player.velocity);
  velocity.scale(dt);

  player.position.add(velocity);

  player.position.x = warp(player.position.x, 0, 1000);
  player.position.y = warp(player.position.y, 0, 1000);
  player.position.z = warp(player.position.z, 0, 1000);
};

const warp = (position: number, center: number, radius: number): number => {
  const range = radius * 2;
  const shift = center - radius;

  return ((position - shift + range) % range) + shift;
};

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getSize());

    configure(undefined);

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

    // Create state
    return {
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
      player: {
        cameraRotation: Quaternion.fromIdentity([
          "setRotation",
          { x: 1, y: 0, z: 0 },
          0,
        ]),
        rotation: Quaternion.fromIdentity([
          "setRotation",
          { x: 1, y: 0, z: 0 },
          0,
        ]),
        position: Vector3.fromZero(),
        smoke: 0,
        velocity: Vector3.fromZero(),
      },
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
      time: 0,
      viewMatrix: Matrix4.fromIdentity(),
      zoom: -25,
    };
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
      ambientLightColor: Vector3.zero,
      objects: [
        {
          matrix: Matrix4.fromIdentity([
            "setRotationPosition",
            Matrix3.fromIdentity(["setQuaternion", player.rotation]),
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
        radius: 25,
      })),
      projectionMatrix,
      viewMatrix,
    };

    sceneRenderer.render(scene);
    particleRenderer.render(scene);
  },

  resize(state, size) {
    state.projectionMatrix = Matrix4.fromIdentity([
      "setPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      10000,
    ]);

    state.particleRenderer.resize(size);
    state.sceneRenderer.resize(size);
    state.target.resize(size);
  },

  update(state, dt) {
    const {
      input,
      lights,
      player,
      particleEmitter0,
      particleRenderer,
      stars,
      viewMatrix,
    } = state;

    // Move player
    movePlayer(input, player, dt);

    // Move camera
    const zoom = input.fetchZoom();

    state.zoom += zoom * 0.2;

    player.cameraRotation.slerp(player.rotation, 0.05);

    const cameraRotation = Matrix4.fromIdentity([
      "setRotationPosition",
      Matrix3.fromIdentity([
        "setQuaternion",
        Quaternion.fromSource(player.cameraRotation, ["conjugate"]),
      ]),
      Vector3.zero,
    ]);
    const cameraPosition = Vector3.fromSource(player.position, ["negate"]);

    viewMatrix.set(Matrix4.identity);
    viewMatrix.translate({ x: 0, y: 0, z: state.zoom });
    viewMatrix.rotate({ x: 0, y: 1, z: 0 }, Math.PI);
    viewMatrix.multiply(cameraRotation);
    viewMatrix.translate(cameraPosition);

    // Update star positions
    const starCenter = Matrix4.fromSource(viewMatrix);

    starCenter.invert();

    for (let i = stars.length; i-- > 0; ) {
      const { position } = stars[i];

      position.x = warp(position.x, starCenter.v30, 50);
      position.y = warp(position.y, starCenter.v31, 50);
      position.z = warp(position.z, starCenter.v32, 50);

      stars[i].rotationAmount += dt * stars[i].rotationSpeed;
    }

    // Update light positions
    for (let i = lights.length; i-- > 0; ) {
      const { mover, position } = lights[i];

      position.set(mover(player.position, state.time * 0.001));
    }

    // Emit particles & update them
    player.smoke += dt;

    if (player.smoke >= 20) {
      for (const smokeCenter of playerSmokeCenters) {
        particleEmitter0(
          10,
          Vector3.fromSource(player.position, [
            "add",
            Quaternion.rotate(smokeCenter, player.rotation),
          ]),
          Math.random()
        );
      }

      player.smoke -= 20;
    }

    particleRenderer.update(dt);

    state.time += dt;
  },
};

const process = declare("Venus³", WebGLScreen, application);

export { process };
