import { range } from "../../../language/iterable";
import { Matrix4, MutableMatrix4 } from "../../../math/matrix";
import {
  MutableVector3,
  MutableVector4,
  Vector2,
  Vector3,
  Vector4,
} from "../../../math/vector";
import { Renderer } from "../../display";
import { GlPainter, GlRuntime, GlTarget } from "../../webgl";
import { SinglePainter } from "../painters/single";
import {
  GlBuffer,
  GlContext,
  createDynamicArrayBuffer,
  createDynamicIndexBuffer,
} from "../resource";
import {
  GlShader,
  GlShaderAttribute,
  GlShaderBinding,
  createAttribute,
  shaderUniform,
} from "../shader";
import { GlTexture } from "../texture";

type ParticleBillboard = {
  dispose: () => void;
  finalize: (nbSources: number) => void;
  prepare: (nbSources: number) => void;
  write: (sourceIndex: number) => void;
  index: GlBuffer;
  polygon: ParticlePolygon;
  sources: ParticleSource[];
  sparks: ParticleSpark[];
  sprite: GlTexture | undefined;
};

type ParticleEmitter<TSeed> = (center: Vector3, seed: TSeed) => void;

type ParticlePolygon = {
  coordinate: GlShaderAttribute;
  corner: GlShaderAttribute;
  position: GlShaderAttribute;
  tint: GlShaderAttribute;
};

type ParticleSource = {
  update: (spark: ParticleSpark, rankSpan: number, timeSpan: number) => void;
  center: Vector3;
  duration: number;
  elapsed: number;
};

type ParticleSpark = {
  position: MutableVector3;
  radius: number;
  rotation: number;
  tint: MutableVector4;
  variant: number;
};

type ParticleScene = {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type ParticleState = Pick<ParticleBillboard, "index" | "polygon" | "sprite">;

type ParticleUpdater = (
  spark: ParticleSpark,
  rankSpan: number,
  timeSpan: number
) => void;

type SceneState = ParticleScene & {
  billboardMatrix: MutableMatrix4;
};

const particleVertexShader = `
uniform mat4 billboardMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 particleCoordinate;
in vec2 particleCorner;
in vec3 particlePosition;
in vec4 particleTint;

out vec2 coordinate;
out vec4 tint;

void main(void) {
    coordinate = particleCoordinate;
    tint = particleTint;

    gl_Position =
      projectionMatrix * billboardMatrix * vec4(particleCorner, 0.0, 0.0) +
      projectionMatrix * viewMatrix * vec4(particlePosition, 1.0);
}`;

const particleFragmentShader = `
uniform sampler2D sprite;

in vec2 coordinate;
in vec4 tint;

layout(location=0) out vec4 fragColor;

void main(void) {
  vec4 emissiveColor = texture(sprite, coordinate);

  fragColor = emissiveColor * tint;
}`;

const createBillboard = (
  gl: GlContext,
  nbSparks: number,
  sprite: GlTexture | undefined,
  nbVariants: number
): ParticleBillboard => {
  const nbQuadIndices = 6;
  const nbQuadVertices = 4;

  const coordinates = new Float32Array(nbSparks * nbQuadVertices * 2); // 2 coordinates & 4 vertices per spark
  const corners = new Float32Array(nbSparks * nbQuadVertices * 2); // 2 coordinates & 4 vertices per spark
  const indices = new Uint32Array(nbSparks * nbQuadIndices); // 6 indices per spark
  const positions = new Float32Array(nbSparks * nbQuadVertices * 3); // 3 dimensions & 4 vertices per spark
  const tints = new Float32Array(nbSparks * nbQuadVertices * 4); // 4 components & 4 vertices

  const coordinate = createDynamicArrayBuffer(gl, Float32Array, 10);
  const corner = createDynamicArrayBuffer(gl, Float32Array, 10);
  const index = createDynamicIndexBuffer(gl, Uint32Array, 10);
  const position = createDynamicArrayBuffer(gl, Float32Array, 10);
  const tint = createDynamicArrayBuffer(gl, Float32Array, 10);

  const coordinatesByVariant = range(nbVariants).map<Vector2[]>((i) => {
    const coordinate0 = (i + 0) / nbVariants;
    const coordinate1 = (i + 1) / nbVariants;

    return [
      { x: 0, y: coordinate0 },
      { x: 1, y: coordinate0 },
      { x: 1, y: coordinate1 },
      { x: 0, y: coordinate1 },
    ];
  });

  const sparks = range(nbSparks).map<ParticleSpark>(() => ({
    position: Vector3.fromZero(),
    radius: 0,
    rotation: 0,
    tint: Vector4.fromZero(),
    variant: 0,
  }));

  return {
    dispose: () => {
      coordinate.dispose();
      corner.dispose();
      index.dispose();
      position.dispose();
      tint.dispose();
    },
    finalize: (nbSources) => {
      // Set index buffer length after updating all particle sources for a given
      // billboard as some of them may have expired and been removed from
      // sources array so we need to render less indices than last allocation.
      index.length = nbSources * nbSparks * nbQuadIndices;
    },
    prepare: (nbSources) => {
      // Prepare index buffer and vertex attributes so they can store up to
      // `nbSources` instances of particle effects with `nbSparks` each.
      const nbIndices = nbSources * nbSparks * nbQuadIndices;
      const nbVertices = nbSources * nbSparks * nbQuadVertices;

      coordinate.reserve(nbVertices * 2);
      corner.reserve(nbVertices * 2);
      index.reserve(nbIndices);
      position.reserve(nbVertices * 3);
      tint.reserve(nbVertices * 4);
    },
    write: (sourceIndex) => {
      const indexOffset = sourceIndex * nbSparks * nbQuadVertices;

      for (let i = nbSparks; i-- > 0; ) {
        const { position, radius, rotation, tint, variant } = sparks[i];
        const indexStart = i * nbQuadIndices;
        const vertexStart = i * nbQuadVertices;
        const variantCoordinates = coordinatesByVariant[variant];

        for (let vertexIndex = 0; vertexIndex < nbQuadVertices; ++vertexIndex) {
          const angle = rotation + Math.PI * (vertexIndex * 0.5 + 0.25);
          const start2 = (vertexStart + vertexIndex) * 2;
          const start3 = (vertexStart + vertexIndex) * 3;
          const start4 = (vertexStart + vertexIndex) * 4;

          coordinates[start2 + 0] = variantCoordinates[vertexIndex].x;
          coordinates[start2 + 1] = variantCoordinates[vertexIndex].y;
          corners[start2 + 0] = Math.cos(angle) * radius;
          corners[start2 + 1] = Math.sin(angle) * radius;
          positions[start3 + 0] = position.x;
          positions[start3 + 1] = position.y;
          positions[start3 + 2] = position.z;
          tints[start4 + 0] = tint.x;
          tints[start4 + 1] = tint.y;
          tints[start4 + 2] = tint.z;
          tints[start4 + 3] = tint.w;
        }

        indices[indexStart + 0] = indexOffset + vertexStart + 0;
        indices[indexStart + 1] = indexOffset + vertexStart + 1;
        indices[indexStart + 2] = indexOffset + vertexStart + 2;
        indices[indexStart + 3] = indexOffset + vertexStart + 0;
        indices[indexStart + 4] = indexOffset + vertexStart + 2;
        indices[indexStart + 5] = indexOffset + vertexStart + 3;
      }

      const indexStart = sourceIndex * nbSparks * nbQuadIndices;
      const vertexStart = sourceIndex * nbSparks * nbQuadVertices;
      const start2 = vertexStart * 2;
      const start3 = vertexStart * 3;
      const start4 = vertexStart * 4;

      coordinate.update(start2, coordinates, coordinates.length);
      corner.update(start2, corners, corners.length);
      index.update(indexStart, indices, indices.length);
      position.update(start3, positions, positions.length);
      tint.update(start4, tints, tints.length);
    },
    index,
    polygon: {
      corner: createAttribute(corner, 2),
      coordinate: createAttribute(coordinate, 2),
      position: createAttribute(position, 3),
      tint: createAttribute(tint, 4),
    },
    sources: [],
    sparks,
    sprite,
  };
};

class ParticleRenderer implements Renderer<ParticleScene> {
  private readonly billboards: ParticleBillboard[];
  private readonly painter: GlPainter<ParticleState>;
  private readonly runtime: GlRuntime;
  private readonly sceneBinding: GlShaderBinding<SceneState>;
  private readonly sceneState: SceneState;
  private readonly shader: GlShader;
  private readonly target: GlTarget;

  public constructor(runtime: GlRuntime, target: GlTarget) {
    const shader = runtime.createShader(
      particleVertexShader,
      particleFragmentShader,
      {}
    );

    // Declare billboard binding (unique to each particle source)
    const billboardBinding = shader.declare<ParticleBillboard>();

    billboardBinding.setAttribute(
      "particleCoordinate",
      ({ polygon }) => polygon.coordinate
    );

    billboardBinding.setAttribute(
      "particleCorner",
      ({ polygon }) => polygon.corner
    );

    billboardBinding.setAttribute(
      "particlePosition",
      ({ polygon }) => polygon.position
    );

    billboardBinding.setAttribute(
      "particleTint",
      ({ polygon }) => polygon.tint
    );

    billboardBinding.setUniform(
      "sprite",
      shaderUniform.tex2dWhite(({ sprite }) => sprite)
    );

    // Declare scene binding (shared by all particle sources)
    const sceneBinding = shader.declare<SceneState>();

    sceneBinding.setUniform(
      "billboardMatrix",
      shaderUniform.matrix4f(({ billboardMatrix }) => billboardMatrix)
    );

    sceneBinding.setUniform(
      "projectionMatrix",
      shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
    );

    sceneBinding.setUniform(
      "viewMatrix",
      shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
    );

    this.billboards = [];
    this.painter = new SinglePainter(billboardBinding, ({ index }) => index);
    this.runtime = runtime;
    this.sceneBinding = sceneBinding;
    this.sceneState = {
      billboardMatrix: Matrix4.fromIdentity(),
      projectionMatrix: Matrix4.fromIdentity(),
      viewMatrix: Matrix4.fromIdentity(),
    };
    this.shader = shader;
    this.target = target;
  }

  public register<TSeed>(
    count: number,
    duration: number,
    sprite: GlTexture | undefined,
    variants: number,
    define: (seed: TSeed) => ParticleUpdater
  ): ParticleEmitter<TSeed> {
    const billboard = createBillboard(
      this.runtime.context,
      count,
      sprite,
      variants
    );

    this.billboards.push(billboard);

    return (center, seed) => {
      billboard.sources.push({
        center,
        duration,
        elapsed: 0,
        update: define(seed),
      });
    };
  }

  public dispose() {
    for (const billboard of this.billboards) {
      billboard.dispose();
    }

    this.shader.dispose();
  }

  public render(scene: ParticleScene) {
    const { projectionMatrix, viewMatrix } = scene;
    const gl = this.runtime.context;
    const sceneState = this.sceneState;

    // Build billboard matrix from view matrix to get camera-facing quads by
    // copying view matrix and cancelling any rotation.
    sceneState.billboardMatrix.v00 = 1;
    sceneState.billboardMatrix.v01 = 0;
    sceneState.billboardMatrix.v02 = 0;
    sceneState.billboardMatrix.v03 = viewMatrix.v03;
    sceneState.billboardMatrix.v10 = 0;
    sceneState.billboardMatrix.v11 = 1;
    sceneState.billboardMatrix.v12 = 0;
    sceneState.billboardMatrix.v13 = viewMatrix.v13;
    sceneState.billboardMatrix.v20 = 0;
    sceneState.billboardMatrix.v21 = 0;
    sceneState.billboardMatrix.v22 = 1;
    sceneState.billboardMatrix.v23 = viewMatrix.v23;
    sceneState.billboardMatrix.v30 = viewMatrix.v30;
    sceneState.billboardMatrix.v31 = viewMatrix.v31;
    sceneState.billboardMatrix.v32 = viewMatrix.v32;
    sceneState.billboardMatrix.v33 = viewMatrix.v33;

    // Copy projection & view matrices from input scene
    sceneState.projectionMatrix = projectionMatrix;
    sceneState.viewMatrix = viewMatrix;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);

    this.sceneBinding.bind(sceneState);

    for (let i = 0; i < this.billboards.length; ++i) {
      this.painter.paint(this.target, this.billboards[i]);
    }
  }

  public resize(_size: Vector2) {}

  public update(dt: number) {
    for (const billboard of this.billboards) {
      const { finalize, prepare, sources, sparks, write } = billboard;

      prepare(sources.length);

      for (let sourceIndex = 0; sourceIndex < sources.length; ) {
        const source = sources[sourceIndex];

        source.elapsed += dt;

        if (source.elapsed >= source.duration) {
          sources[sourceIndex] = sources[sources.length - 1];
          sources.pop();

          continue;
        }

        const { center, duration, elapsed, update } = source;

        // FIXME: write to a single "spark" instance, copy to GlArrays on each iteration and write to GlBuffers once
        for (let i = sparks.length; i-- > 0; ) {
          const spark = sparks[i];

          update(spark, i / sparks.length, elapsed / duration);

          spark.position.add(center);
        }

        write(sourceIndex++);
      }

      finalize(sources.length);
    }
  }
}

export { type ParticleEmitter, type ParticleScene, ParticleRenderer };
