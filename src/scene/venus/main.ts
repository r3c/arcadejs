import { type Application, configure, declare } from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import {
  ForwardLightingRenderer,
  ForwardLightingScene,
} from "../../engine/graphic/webgl/renderers/forward-lighting";
import { range } from "../../engine/language/iterable";
import {
  loadModelFrom3ds,
  loadModelFromJson,
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

type Player = {
  position: MutableVector3;
  smoke: number;
  velocity: MutableVector3;
};

type ApplicationState = {
  camera: Camera;
  input: Input;
  lights: MutableVector3[];
  models: {
    ship: GlModel;
    star: GlModel;
  };
  move: number;
  player: Player;
  particleRenderer: ParticleRenderer;
  particleEmitter0: ParticleEmitter<number>;
  projectionMatrix: Matrix4;
  sceneRenderer: ForwardLightingRenderer;
  sprite: GlTexture;
  stars: MutableVector3[];
  target: GlTarget;
  viewMatrix: MutableMatrix4;
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
    const shipModel = await loadModelFrom3ds("model/colmftr1/COLMFTR1.3DS", {
      transform: Matrix4.fromCustom(["translate", { x: 0, y: 4, z: 0 }]),
    });

    const starModel = await loadModelFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromCustom(["scale", { x: 0.1, y: 0.1, z: 0.1 }]),
    });

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
      lights: [Vector3.fromXYZ(0, 0, 50)],
      models: {
        ship: createModel(gl, shipModel),
        star: createModel(gl, starModel),
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
      stars: range(starFieldCount).map(() =>
        Vector3.fromObject({
          x: (Math.random() * 2 - 1) * starFieldRadius,
          y: (Math.random() * 2 - 1) * starFieldRadius,
          z: (Math.random() * 2 - 1) * starFieldRadius,
        })
      ),
      target,
      viewMatrix: Matrix4.fromIdentity(),
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
      ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
      objects: [
        {
          matrix: Matrix4.fromCustom(
            ["translate", player.position],
            ["rotate", { x: 0, y: 1, z: 0 }, Math.PI]
          ),
          model: models.ship,
          noShadow: false,
        },
        ...state.stars.map((position) => ({
          matrix: Matrix4.fromCustom(["translate", position]),
          model: models.star,
          noShadow: false,
        })),
      ],
      pointLights: state.lights.map((position) => ({
        color: { x: 1, y: 1, z: 1 },
        position,
        radius: 50,
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
      player,
      particleEmitter0,
      particleRenderer,
      stars,
      viewMatrix,
    } = state;

    // Move player
    movePlayer(input, player, dt);

    // Move camera
    camera.move(input, dt * 1000); // FIXME: scale camera movement
    camera.position = Vector3.fromXYZ(
      -player.position.x,
      -player.position.y,
      -player.position.z
    );

    viewMatrix.set(Matrix4.identity);
    viewMatrix.translate({ x: 0, y: 0, z: -25 });
    viewMatrix.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x);
    viewMatrix.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);
    viewMatrix.translate(camera.position);

    // Update star positions
    const starCenter = Matrix4.fromObject(viewMatrix);

    starCenter.invert();

    for (const star of stars) {
      star.x = warp(star.x, starCenter.v30, 50);
      star.y = warp(star.y, starCenter.v31, 50);
      star.z = warp(star.z, starCenter.v32, 50);
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
  },
};

const process = declare("Venus³", WebGLScreen, application);

export { process };
