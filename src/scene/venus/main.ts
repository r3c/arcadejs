import { type Application, configure, declare } from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/iterable";
import {
  Model,
  changeModelCenter,
  loadModelFrom3ds,
  loadModelFromJson,
  loadModelFromObj,
} from "../../engine/graphic/model";
import { Matrix4, MutableMatrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector3 } from "../../engine/math/vector";
import {
  GlTarget,
  createRuntime,
  loadTextureQuad,
} from "../../engine/graphic/webgl";
import { Camera } from "../view";
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

type Player = {
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
  variant: number;
};

type ApplicationState = {
  camera: Camera;
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

const friction = 0.008;
const mass = 1000;
const thrust = 0.1;

const starFieldCount = 1000;
const starFieldRadius = 1000;

// See: https://gafferongames.com/post/integration_basics/
const movePlayer = (input: Input, player: Player, dt: number): void => {
  const x =
    (input.isPressed("arrowleft") ? -1 : 0) +
    (input.isPressed("arrowright") ? 1 : 0);
  const y =
    (input.isPressed("arrowdown") ? -1 : 0) +
    (input.isPressed("arrowup") ? 1 : 0);
  const z = input.isPressed("space") ? -1 : 0;

  const acceleration = Vector3.fromXYZ(x, y, z);
  const velocity = Vector3.fromObject(player.velocity);

  velocity.scale(Math.min(dt * friction, 1));
  acceleration.scale((dt * thrust) / mass);
  acceleration.sub(velocity);

  player.velocity.add(acceleration);

  velocity.set(player.velocity);
  velocity.scale(dt);

  player.position.add(velocity);

  player.position.x = warp(player.position.x, 0, 1000);
  player.position.y = warp(player.position.y, 0, 1000);
  player.position.z = warp(player.position.z, 0, 1000);
};

const warp = (position: number, center: number, radius: number) => {
  const range = radius * 2;
  const shift = center - radius;

  return ((position - shift + range) % range) + shift;
};

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);
    const target = new GlTarget(gl, screen.getWidth(), screen.getHeight());

    configure(undefined);

    // Load meshes
    const lightModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.25, y: 0.25, z: 0.25 }]),
    });

    const shipModel = await loadModelFrom3ds("model/colmftr1/COLMFTR1.3DS", {
      transform: Matrix4.fromCustom(["translate", { x: 0, y: 4, z: 0 }]),
    });

    const starModel = await loadModelFromObj(
      "model/asteroid/Asteroid_Asset_Pack.obj",
      { format: { variables: { type: "rock_0005" } } }
    );

    const starModels: Model[] = starModel.meshes.map((mesh) =>
      changeModelCenter({ meshes: [mesh] })
    );

    // Load textures
    const spriteImage = await loadFromURL("model/particle/fire.png");
    const sprite = loadTextureQuad(gl, spriteImage);

    // Particle effects
    const particleRenderer = new ParticleRenderer(runtime, target);

    const particleEasing0 = getEasing(EasingType.QuadraticOut);
    const particleEmitter0 = particleRenderer.register<number>(
      10,
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
      camera: new Camera({ x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: 0 }),
      input: new Input(screen.canvas),
      lights: range(2).map((i) => ({
        mover: createOrbitMover(i, 5, 5, 2),
        position: Vector3.fromZero(),
      })),
      models: {
        light: createModel(gl, lightModel),
        ship: createModel(gl, shipModel),
        stars: starModels.map((model) => createModel(gl, model)),
      },
      move: 0,
      player: {
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
      stars: range(starFieldCount).map(() => ({
        position: Vector3.fromObject({
          x: (Math.random() * 2 - 1) * starFieldRadius,
          y: (Math.random() * 2 - 1) * starFieldRadius,
          z: (Math.random() * 2 - 1) * starFieldRadius,
        }),
        variant: Math.floor(Math.random() * starModels.length),
      })),
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
          matrix: Matrix4.fromCustom(
            ["translate", player.position],
            ["rotate", { x: 0, y: 1, z: 0 }, Math.PI]
          ),
          model: models.ship,
        },
        ...state.stars.map(({ position, variant }) => ({
          matrix: Matrix4.fromCustom(["translate", position]),
          model: models.stars[variant],
        })),
        ...state.lights.map(({ position }) => ({
          matrix: Matrix4.fromCustom(["translate", position]),
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

  resize(state, screen) {
    state.projectionMatrix = Matrix4.fromPerspective(
      Math.PI / 4,
      screen.getRatio(),
      0.1,
      10000
    );

    state.particleRenderer.resize(screen.getWidth(), screen.getHeight());
    state.sceneRenderer.resize(screen.getWidth(), screen.getHeight());
    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    const {
      camera,
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

    camera.move(input, dt);
    camera.position = Vector3.fromXYZ(
      -player.position.x,
      -player.position.y,
      -player.position.z
    );

    state.zoom += zoom * 0.2;

    viewMatrix.set(Matrix4.identity);
    viewMatrix.translate({ x: 0, y: 0, z: state.zoom });
    viewMatrix.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x);
    viewMatrix.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);
    viewMatrix.translate(camera.position);

    // Update star positions
    const starCenter = Matrix4.fromObject(viewMatrix);

    starCenter.invert();

    for (const { position } of stars) {
      position.x = warp(position.x, starCenter.v30, 50);
      position.y = warp(position.y, starCenter.v31, 50);
      position.z = warp(position.z, starCenter.v32, 50);
    }

    // Update light positions
    for (let i = lights.length; i-- > 0; ) {
      const { mover, position } = lights[i];

      position.set(mover(player.position, state.time * 0.001));
    }

    // Emit particles & update them
    player.smoke += dt;

    if (player.smoke >= 20) {
      const { x, y, z } = player.position;

      particleEmitter0({ x: x + 0.7, y: y + 0.35, z: z + 4.2 }, Math.random());
      particleEmitter0({ x: x + 0, y: y + 0.9, z: z + 4.2 }, Math.random());
      particleEmitter0({ x: x - 0.7, y: y + 0.35, z: z + 4.2 }, Math.random());

      player.smoke -= 20;
    }

    particleRenderer.update(dt);

    state.time += dt;
  },
};

const process = declare("Venus³", WebGLScreen, application);

export { process };
