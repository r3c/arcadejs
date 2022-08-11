import { type Tweak, declare, configure } from "../../engine/application";
import * as load from "../../engine/graphic/load";
import { Matrix4 } from "../../engine/math/matrix";
import * as painter from "../../engine/graphic/painters/singular";
import { Vector3 } from "../../engine/math/vector";
import * as view from "../view";
import * as webgl from "../../engine/graphic/webgl";
import { WebGLScreen } from "../../engine/graphic/display";
import { Input } from "../../engine/io/controller";

/*
 ** Source: https://nialltl.neocities.org/articles/mpm_guide.html
 */

const vsSource = `
in vec4 colors;
in vec2 coords;
in vec4 points;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out vec4 color;
out vec2 coord;

void main(void) {
	color = colors;
	coord = coords;

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const fsSource = `
in vec4 color;
in vec2 coord;

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;

layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = color * albedoFactor * texture(albedoMap, coord);
}`;

type Matrix3 = {
  v00: number;
  v01: number;
  v02: number;
  v10: number;
  v11: number;
  v12: number;
  v20: number;
  v21: number;
  v22: number;
};

type Cell = {
  mass: number;
  velocity: Vector3;
};

type Configuration = {
  applyGravity: boolean;
};

type Particle = {
  deformation: Matrix3;
  mass: number;
  momentum: Matrix3;
  position: Vector3;
  velocity: Vector3;
};

type Simulation = {
  particles: Particle[];
  cells: Cell[];
};

interface SceneState {
  camera: view.Camera;
  gl: WebGLRenderingContext;
  input: Input;
  mesh: webgl.Mesh;
  painter: webgl.Painter<ShaderState>;
  projectionMatrix: Matrix4;
  simulation: Simulation;
  target: webgl.Target;
  tweak: Tweak<Configuration>;
}

interface ShaderState {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

const gridSize = 64;
const gridSize2 = gridSize * gridSize;

const matrix3identity: Matrix3 = {
  v00: 1,
  v01: 0,
  v02: 0,
  v10: 0,
  v11: 1,
  v12: 0,
  v20: 0,
  v21: 0,
  v22: 1,
};

const matrix3zero: Matrix3 = {
  v00: 0,
  v01: 0,
  v02: 0,
  v10: 0,
  v11: 0,
  v12: 0,
  v20: 0,
  v21: 0,
  v22: 0,
};

function matrix3add(lhs: Matrix3, rhs: Matrix3): Matrix3 {
  return {
    v00: lhs.v00 + rhs.v00,
    v01: lhs.v01 + rhs.v01,
    v02: lhs.v02 + rhs.v02,
    v10: lhs.v10 + rhs.v10,
    v11: lhs.v11 + rhs.v11,
    v12: lhs.v12 + rhs.v12,
    v20: lhs.v20 + rhs.v20,
    v21: lhs.v21 + rhs.v21,
    v22: lhs.v22 + rhs.v22,
  };
}

function matrix3create3(a: Vector3, b: Vector3, c: Vector3): Matrix3 {
  return {
    v00: a.x,
    v01: b.x,
    v02: c.x,
    v10: a.y,
    v11: b.y,
    v12: c.y,
    v20: a.z,
    v21: b.z,
    v22: c.z,
  };
}

function matrix3mul3(matrix: Matrix3, factor: Vector3): Vector3 {
  return {
    x: factor.x * matrix.v00 + factor.y * matrix.v01 + factor.z * matrix.v02,
    y: factor.x * matrix.v10 + factor.y * matrix.v11 + factor.z * matrix.v12,
    z: factor.x * matrix.v20 + factor.y * matrix.v21 + factor.z * matrix.v22,
  };
}

function matrix3scale(matrix: Matrix3, factor: number): Matrix3 {
  return {
    v00: matrix.v00 * factor,
    v01: matrix.v01 * factor,
    v02: matrix.v02 * factor,
    v10: matrix.v10 * factor,
    v11: matrix.v11 * factor,
    v12: matrix.v12 * factor,
    v20: matrix.v20 * factor,
    v21: matrix.v21 * factor,
    v22: matrix.v22 * factor,
  };
}

const configuration: Configuration = {
  applyGravity: true,
};

function createParticle(): Particle {
  return {
    deformation: matrix3identity,
    mass: 1,
    momentum: matrix3zero,
    position: {
      x: Math.random() * (gridSize - 2) + 1,
      y: Math.random() * (gridSize - 2) + 1,
      z: Math.random() * (gridSize - 2) + 1,
    },
    velocity: Vector3.zero,
  };
}

function getGridCell(cells: Cell[], position: Vector3): Cell {
  const cellIndex = position.x * gridSize2 + position.y * gridSize + position.z;

  return cells[cellIndex];
}

const gravity = -0.1;
const half: Vector3 = { x: 0.5, y: 0.5, z: 0.5 };

const prepare = async (screen: WebGLScreen) => {
  const gl = screen.context;
  const shader = new webgl.Shader<ShaderState>(gl, vsSource, fsSource);
  const tweak = configure(configuration);

  shader.setupAttributePerGeometry("colors", (geometry) => geometry.colors);
  shader.setupAttributePerGeometry("coords", (geometry) => geometry.coords);
  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setupPropertyPerMaterial(
    "albedoFactor",
    (material) => material.albedoFactor,
    (gl) => gl.uniform4fv
  );
  shader.setupTexturePerMaterial(
    "albedoMap",
    undefined,
    webgl.TextureType.Quad,
    (material) => material.albedoMap
  );

  shader.setupMatrixPerNode(
    "modelMatrix",
    (state) => state.transform.toArray(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix.toArray(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "viewMatrix",
    (state) => state.viewMatrix.toArray(),
    (gl) => gl.uniformMatrix4fv
  );

  const simulation: Simulation = {
    particles: [...Array(100)].map(createParticle),
    cells: [...Array(gridSize * gridSize * gridSize)].map(() => ({
      mass: 0,
      velocity: Vector3.zero,
    })),
  };

  return {
    camera: new view.Camera(
      { x: -gridSize / 2, y: -gridSize / 2, z: -gridSize * 3 },
      Vector3.zero
    ),
    gl: gl,
    input: new Input(screen.canvas),
    mesh: webgl.loadMesh(
      gl,
      await load.fromJSON("./obj/cube/mesh.json", {
        transform: Matrix4.createIdentity().scale({
          x: 0.5,
          y: 0.5,
          z: 0.5,
        }),
      })
    ),
    painter: new painter.Painter(shader),
    projectionMatrix: Matrix4.createIdentity(),
    screen: screen,
    simulation,
    target: new webgl.Target(
      screen.context,
      screen.getWidth(),
      screen.getHeight()
    ),
    tweak,
  };
};

const render = (state: SceneState) => {
  const camera = state.camera;
  const gl = state.gl;
  const target = state.target;

  const viewMatrix = Matrix4.createIdentity()
    .translate(camera.position)
    .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
    .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

  const subjects = state.simulation.particles.map((particle) => ({
    matrix: Matrix4.createIdentity().translate(particle.position),
    mesh: state.mesh,
  }));

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  gl.cullFace(gl.BACK);

  target.clear(0);

  state.painter.paint(target, subjects, viewMatrix, {
    projectionMatrix: state.projectionMatrix,
    viewMatrix: viewMatrix,
  });
};

const resize = (state: SceneState, screen: WebGLScreen) => {
  state.projectionMatrix = Matrix4.createPerspective(
    45,
    screen.getRatio(),
    0.1,
    1000
  );

  state.target.resize(screen.getWidth(), screen.getHeight());
};

const update = (state: SceneState, dt: number) => {
  dt = 1; // Fake simulation speed

  state.camera.move(state.input);

  if (state.input.fetchPressed("space")) {
    for (let i = 0; i < state.simulation.particles.length; ++i) {
      state.simulation.particles[i] = createParticle();
    }
  }

  const { cells, particles } = state.simulation;
  cells.forEach((cell) => {
    cell.mass = 0;
    cell.velocity = Vector3.zero;
  });

  // Step 1: particle to grid
  for (let i = 0; i < particles.length; ++i) {
    const particle = particles[i];

    // quadratic interpolation weights
    const particleFloor = Vector3.apply(particle.position, Math.floor);
    const particleShift = Vector3.sub(
      Vector3.sub(particle.position, particleFloor),
      half
    );

    const weights = [
      Vector3.apply(particleShift, (v) => 0.5 * Math.pow(0.5 - v, 2)),
      Vector3.apply(particleShift, (v) => 0.75 - Math.pow(v, 2)),
      Vector3.apply(particleShift, (v) => 0.5 * Math.pow(0.5 + v, 2)),
    ];

    // for all surrounding 9 cells
    for (let gx = 0; gx < 3; ++gx) {
      for (let gy = 0; gy < 3; ++gy) {
        for (let gz = 0; gz < 3; ++gz) {
          const weight = weights[gx].x * weights[gy].y * weights[gz].z;

          const neighborFloor: Vector3 = {
            x: particleFloor.x + gx - 1,
            y: particleFloor.y + gy - 1,
            z: particleFloor.z + gz - 1,
          };

          const neighborDistance = Vector3.add(
            Vector3.sub(neighborFloor, particle.position),
            half
          );

          const Q = matrix3mul3(particle.momentum, neighborDistance);

          // MPM course, equation 172
          const contribMass = weight * particle.mass;
          const contribVelocity = Vector3.scale(
            Vector3.add(particle.velocity, Q),
            contribMass
          );

          // converting 2D index to 1D
          const cell = getGridCell(cells, neighborFloor);

          // scatter mass to the grid
          cell.mass += contribMass;
          cell.velocity = Vector3.add(cell.velocity, contribVelocity);
        }
      }
    }
  }

  // Step 2: grid momentum update
  for (let i = 0; i < cells.length; ++i) {
    const cell = cells[i];

    if (cell.mass > 0) {
      // convert momentum to velocity, apply gravity
      cell.velocity = Vector3.scale(cell.velocity, 1 / cell.mass);

      if (state.tweak.applyGravity) {
        cell.velocity = Vector3.add(cell.velocity, {
          x: 0,
          y: gravity * dt,
          z: 0,
        });
      }

      // boundary conditions
      const x = Math.floor(i / gridSize / gridSize);
      const y = Math.floor(i / gridSize) % gridSize;
      const z = i % gridSize;

      if (x < 2 || x > gridSize - 3) {
        cell.velocity = { x: 0, y: cell.velocity.y, z: cell.velocity.z };
      }

      if (y < 2 || y > gridSize - 3) {
        cell.velocity = { x: cell.velocity.x, y: 0, z: cell.velocity.z };
      }

      if (z < 2 || z > gridSize - 3) {
        cell.velocity = { x: cell.velocity.x, y: cell.velocity.y, z: 0 };
      }
    }
  }

  // Step 3: grid to particle
  for (let i = 0; i < particles.length; ++i) {
    const particle = particles[i];

    // reset particle velocity. we calculate it from scratch each step using the grid
    particle.velocity = Vector3.zero;

    // quadratic interpolation weights
    const particleFloor = Vector3.apply(particle.position, Math.floor);
    const particleShift = Vector3.sub(
      Vector3.sub(particle.position, particleFloor),
      half
    );

    const weights = [
      Vector3.apply(particleShift, (v) => 0.5 * Math.pow(0.5 - v, 2)),
      Vector3.apply(particleShift, (v) => 0.75 - Math.pow(v, 2)),
      Vector3.apply(particleShift, (v) => 0.5 * Math.pow(0.5 + v, 2)),
    ];

    // constructing affine per-particle momentum matrix from APIC / MLS-MPM.
    // see APIC paper (https://web.archive.org/web/20190427165435/https://www.math.ucla.edu/~jteran/papers/JSSTS15.pdf), page 6
    // below equation 11 for clarification. this is calculating C = B * (D^-1) for APIC equation 8,
    // where B is calculated in the inner loop at (D^-1) = 4 is a constant when using quadratic interpolation functions
    let B = matrix3zero;

    for (let gx = 0; gx < 3; ++gx) {
      for (let gy = 0; gy < 3; ++gy) {
        for (let gz = 0; gz < 3; ++gz) {
          const weight = weights[gx].x * weights[gy].y * weights[gz].z;

          const neighborFloor: Vector3 = {
            x: particleFloor.x + gx - 1,
            y: particleFloor.y + gy - 1,
            z: particleFloor.z + gz - 1,
          };

          const cell = getGridCell(cells, neighborFloor);
          const dist = Vector3.add(
            Vector3.sub(neighborFloor, particle.position),
            half
          );
          const weighted_velocity = Vector3.scale(cell.velocity, weight);

          // APIC paper equation 10, constructing inner term for B
          var term = matrix3create3(
            Vector3.scale(weighted_velocity, dist.x),
            Vector3.scale(weighted_velocity, dist.y),
            Vector3.scale(weighted_velocity, dist.z)
          );

          B = matrix3add(B, term);

          particle.velocity = Vector3.add(particle.velocity, weighted_velocity);
        }
      }
    }

    particle.momentum = matrix3scale(B, 9);

    // advect particles
    particle.position = Vector3.add(
      particle.position,
      Vector3.scale(particle.velocity, dt)
    );

    // safety clamp to ensure particles don't exit simulation domain
    particle.position = Vector3.apply(particle.position, (v) =>
      Math.max(Math.min(v, gridSize - 2), 1)
    );
  }
};

const process = declare("Material Point Method", WebGLScreen, {
  prepare,
  render,
  resize,
  update,
});

export { process };
