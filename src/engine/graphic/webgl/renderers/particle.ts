import { createFlexibleBuffer } from "../../../io/memory";
import { range } from "../../../language/iterable";
import { Matrix4, MutableMatrix4 } from "../../../math/matrix";
import {
  MutableVector3,
  MutableVector4,
  Vector3,
  Vector4,
} from "../../../math/vector";
import { Renderer } from "../../display";
import { GlPainter, GlRuntime, GlTarget } from "../../webgl";
import { SinglePainter } from "../painters/single";
import { GlBuffer, GlContext, createIndexBuffer } from "../resource";
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
  set: (particles: ArrayLike<ParticleSpark>) => void;
  index: GlBuffer;
  polygon: ParticlePolygon;
  sprite: GlTexture | undefined;
};

type ParticleDefinition = {
  create: (spark: ParticleSpark, rankSpan: number) => void;
  update: (spark: ParticleSpark, rankSpan: number, timeSpan: number) => void;
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
  billboard: ParticleBillboard;
  center: Vector3;
  duration: number;
  elapsed: number;
  sparks: ParticleSpark[];
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

const emptyFloat32s = new Float32Array();
const emptyInt32s = new Uint32Array();

const createBillboard = (
  gl: GlContext,
  sprite: GlTexture | undefined,
  nbVariants: number
): ParticleBillboard => {
  const indexBuffer = createFlexibleBuffer(Uint32Array, 5);
  const particleCoordinateBuffer = createFlexibleBuffer(Float32Array, 5);
  const particleCornerBuffer = createFlexibleBuffer(Float32Array, 5);
  const particlePositionBuffer = createFlexibleBuffer(Float32Array, 5);
  const particleRadiusBuffer = createFlexibleBuffer(Float32Array, 5);
  const particleTintBuffer = createFlexibleBuffer(Float32Array, 5);

  const index = createIndexBuffer(gl, emptyInt32s, 0, true);
  const particleCoordinate = createAttribute(gl, emptyFloat32s, 0, 2, true);
  const particleCorner = createAttribute(gl, emptyFloat32s, 0, 2, true);
  const particlePosition = createAttribute(gl, emptyFloat32s, 0, 3, true);
  const particleRadius = createAttribute(gl, emptyFloat32s, 0, 1, true);
  const particleTint = createAttribute(gl, emptyFloat32s, 0, 4, true);

  return {
    dispose: () => {
      index.dispose();
      particleCoordinate.dispose();
      particleCorner.dispose();
      particlePosition.dispose();
      particleRadius.dispose();
      particleTint.dispose();
    },
    set: (sparks) => {
      const nbIndex = 6;
      const nbVertex = 4;

      indexBuffer.resize(sparks.length * nbIndex);
      particleCoordinateBuffer.resize(sparks.length * 2 * 4); // 2 coordinates & 4 vertices
      particleCornerBuffer.resize(sparks.length * 2 * 4); // 2 coordinates & 4 vertices
      particlePositionBuffer.resize(sparks.length * 3 * 4); // 3 dimensions & 4 vertices
      particleRadiusBuffer.resize(sparks.length * 4); // 4 vertices
      particleTintBuffer.resize(sparks.length * 4 * 4); // 4 components & 4 vertices

      const indexArray = indexBuffer.array;
      const particleCoordinateArray = particleCoordinateBuffer.array;
      const particleCornerArray = particleCornerBuffer.array;
      const particlePositionArray = particlePositionBuffer.array;
      const particleRadiusArray = particleRadiusBuffer.array;
      const particleTintArray = particleTintBuffer.array;

      for (let i = 0; i < sparks.length; ++i) {
        const { position, radius, rotation, tint, variant } = sparks[i];
        const indexOffset = i * nbIndex;
        const vertexOffset = i * nbVertex;
        const coordinate0 = variant / nbVariants;
        const coordinate1 = (variant + 1) / nbVariants;

        for (let vertex = 0; vertex < nbVertex; ++vertex) {
          const angle = rotation + Math.PI * (vertex * 0.5 + 0.25);
          const offset1 = vertexOffset + vertex;
          const offset2 = (vertexOffset + vertex) * 2;
          const offset3 = (vertexOffset + vertex) * 3;
          const offset4 = (vertexOffset + vertex) * 4;

          particleCornerArray[offset2 + 0] = Math.cos(angle) * radius;
          particleCornerArray[offset2 + 1] = Math.sin(angle) * radius;
          particlePositionArray[offset3 + 0] = position.x;
          particlePositionArray[offset3 + 1] = position.y;
          particlePositionArray[offset3 + 2] = position.z;
          particleRadiusArray[offset1] = radius;
          particleTintArray[offset4 + 0] = tint.x;
          particleTintArray[offset4 + 1] = tint.y;
          particleTintArray[offset4 + 2] = tint.z;
          particleTintArray[offset4 + 3] = tint.w;
        }

        indexArray[indexOffset + 0] = vertexOffset + 0;
        indexArray[indexOffset + 1] = vertexOffset + 1;
        indexArray[indexOffset + 2] = vertexOffset + 2;
        indexArray[indexOffset + 3] = vertexOffset + 0;
        indexArray[indexOffset + 4] = vertexOffset + 2;
        indexArray[indexOffset + 5] = vertexOffset + 3;

        const offset2 = vertexOffset * 2;

        particleCoordinateArray[offset2 + 0] = 0;
        particleCoordinateArray[offset2 + 1] = coordinate0;
        particleCoordinateArray[offset2 + 2] = 1;
        particleCoordinateArray[offset2 + 3] = coordinate0;
        particleCoordinateArray[offset2 + 4] = 1;
        particleCoordinateArray[offset2 + 5] = coordinate1;
        particleCoordinateArray[offset2 + 6] = 0;
        particleCoordinateArray[offset2 + 7] = coordinate1;
      }

      index.set(indexArray, indexBuffer.length);
      particleCoordinate.buffer.set(
        particleCoordinateArray,
        particleCoordinateBuffer.length
      );
      particleCorner.buffer.set(
        particleCornerArray,
        particleCornerBuffer.length
      );
      particlePosition.buffer.set(
        particlePositionArray,
        particlePositionBuffer.length
      );
      particleRadius.buffer.set(
        particleRadiusArray,
        particleRadiusBuffer.length
      );
      particleTint.buffer.set(particleTintArray, particleTintBuffer.length);
    },
    index,
    polygon: {
      corner: particleCorner,
      coordinate: particleCoordinate,
      position: particlePosition,
      tint: particleTint,
    },
    sprite,
  };
};

class ParticleRenderer implements Renderer<ParticleScene> {
  private readonly painter: GlPainter<ParticleState>;
  private readonly runtime: GlRuntime;
  private readonly sceneBinding: GlShaderBinding<SceneState>;
  private readonly sceneState: SceneState;
  private readonly shader: GlShader;
  private readonly sources: ParticleSource[];
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
      shaderUniform.quadWhite(({ sprite }) => sprite)
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

    this.painter = new SinglePainter(billboardBinding, ({ index }) => index);
    this.runtime = runtime;
    this.sceneBinding = sceneBinding;
    this.sceneState = {
      billboardMatrix: Matrix4.fromIdentity(),
      projectionMatrix: Matrix4.fromIdentity(),
      viewMatrix: Matrix4.fromIdentity(),
    };
    this.shader = shader;
    this.sources = [];
    this.target = target;
  }

  public register<TSeed>(
    count: number,
    duration: number,
    sprite: GlTexture | undefined,
    variants: number,
    define: (seed: TSeed) => ParticleDefinition
  ): ParticleEmitter<TSeed> {
    const sources = this.sources;

    return (center, seed) => {
      const { create, update } = define(seed);

      const billboard = createBillboard(this.runtime.context, sprite, variants);

      sources.push({
        update,
        billboard,
        center,
        duration,
        elapsed: 0,
        sparks: range(count).map((i) => {
          const spark = {
            position: Vector3.fromZero(),
            radius: 0,
            rotation: 0,
            tint: Vector4.fromZero(),
            variant: 0,
          };

          create(spark, i / count);

          return spark;
        }),
      });
    };
  }

  public dispose() {
    for (const { billboard } of this.sources) {
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

    for (let i = 0; i < this.sources.length; ++i) {
      const billboard = this.sources[i].billboard;

      this.painter.paint(this.target, billboard);
    }
  }

  public resize(_width: number, _height: number) {}

  public update(dt: number) {
    for (let i = this.sources.length; i > 0; --i) {
      const source = this.sources[i - 1];

      source.elapsed += dt;

      if (source.elapsed >= source.duration) {
        source.billboard.dispose();

        this.sources.splice(i - 1, 1);

        continue;
      }

      const { billboard, center, duration, elapsed, sparks, update } = source;

      for (let i = 0; i < sparks.length; ++i) {
        const spark = sparks[i];

        update(spark, i / sparks.length, elapsed / duration);

        spark.position.add(center);
      }

      billboard.set(sparks);
    }
  }
}

export { type ParticleEmitter, type ParticleScene, ParticleRenderer };
