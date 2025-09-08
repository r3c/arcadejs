import { Disposable } from "../../language/lifecycle";
import { createFlexibleArray } from "../../io/memory";
import { range } from "../../language/iterable";
import { Matrix4, MutableMatrix4 } from "../../math/matrix";
import {
  MutableVector3,
  MutableVector4,
  Vector2,
  Vector3,
  Vector4,
} from "../../math/vector";
import { Renderer } from "./definition";
import { GlRuntime, GlTarget } from "../webgl";
import { SinglePainter } from "../webgl/painters/single";
import {
  GlBuffer,
  GlContext,
  createDynamicArrayBuffer,
  createDynamicIndexBuffer,
} from "../webgl/resource";
import {
  GlShaderAttribute,
  createAttribute,
  shaderUniform,
} from "../webgl/shader";
import { GlTexture } from "../webgl/texture";

type ParticleAction<TSeed> = {
  emit: (count: number, center: Vector3, seed: TSeed) => void;
};

type ParticleBillboard = {
  dispose: () => void;
  flush: () => void;
  reserve: (nbSources: number) => void;
  write: (sparkIndex: number) => void;
  index: GlBuffer;
  polygon: ParticlePolygon;
  sources: ParticleSource[];
  spark: ParticleSpark;
  sprite: GlTexture | undefined;
};

type ParticlePolygon = {
  coordinate: GlShaderAttribute;
  corner: GlShaderAttribute;
  position: GlShaderAttribute;
  tint: GlShaderAttribute;
};

type ParticleRenderer<TSeed> = Disposable &
  Renderer<ParticleScene, ParticleSubject<TSeed>, ParticleAction<TSeed>> & {
    update: (dt: number) => void;
  };

type ParticleSource = {
  update: ParticleUpdater;
  center: Vector3;
  count: number;
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

type ParticleSubject<TSeed> = {
  duration: number;
  sprite: GlTexture | undefined;
  variants: number;
  define: (seed: TSeed) => ParticleUpdater;
};

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
  sprite: GlTexture | undefined,
  nbVariants: number
): ParticleBillboard => {
  const nbQuadIndices = 6;
  const nbQuadVertices = 4;

  const coordinates = createFlexibleArray(Float32Array, 10);
  const corners = createFlexibleArray(Float32Array, 10);
  const indices = createFlexibleArray(Uint32Array, 10);
  const positions = createFlexibleArray(Float32Array, 10);
  const tints = createFlexibleArray(Float32Array, 10);

  const coordinateBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);
  const cornerBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);
  const indexBuffer = createDynamicIndexBuffer(gl, Uint32Array, 10);
  const positionBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);
  const tintBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);

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

  const spark: ParticleSpark = {
    position: Vector3.fromZero(),
    radius: 0,
    rotation: 0,
    tint: Vector4.fromZero(),
    variant: 0,
  };

  return {
    dispose: () => {
      coordinateBuffer.dispose();
      cornerBuffer.dispose();
      indexBuffer.dispose();
      positionBuffer.dispose();
      tintBuffer.dispose();
    },
    flush: () => {
      coordinateBuffer.update(0, coordinates.buffer, coordinates.length);
      cornerBuffer.update(0, corners.buffer, corners.length);
      indexBuffer.update(0, indices.buffer, indices.length);
      positionBuffer.update(0, positions.buffer, positions.length);
      tintBuffer.update(0, tints.buffer, tints.length);
    },
    reserve: (nbSparks) => {
      // Prepare buffers so they can store up to `nbSparks` each.
      const nbIndices = nbSparks * nbQuadIndices;
      const nbVertices = nbSparks * nbQuadVertices;

      coordinates.resize(nbVertices * 2); // 2 coordinates per vertex
      corners.resize(nbVertices * 2); // 2 coordinates per vertex
      indices.resize(nbIndices); // 6 indices per spark
      positions.resize(nbVertices * 3); // 3 dimensions per vertex
      tints.resize(nbVertices * 4); // 4 components per vertex

      coordinateBuffer.resize(nbVertices * 2);
      cornerBuffer.resize(nbVertices * 2);
      indexBuffer.resize(nbIndices);
      positionBuffer.resize(nbVertices * 3);
      tintBuffer.resize(nbVertices * 4);
    },
    write: (sparkIndex) => {
      const { position, radius, rotation, tint, variant } = spark;

      const sparkCoordinates = coordinatesByVariant[variant];
      const indexStart = sparkIndex * nbQuadIndices;
      const vertexStart = sparkIndex * nbQuadVertices;

      for (let vertexIndex = 0; vertexIndex < nbQuadVertices; ++vertexIndex) {
        const angle = rotation + Math.PI * (vertexIndex * 0.5 + 0.25);
        const coordinate = sparkCoordinates[vertexIndex];
        const start2 = (vertexStart + vertexIndex) * 2;
        const start3 = (vertexStart + vertexIndex) * 3;
        const start4 = (vertexStart + vertexIndex) * 4;

        coordinates.buffer[start2 + 0] = coordinate.x;
        coordinates.buffer[start2 + 1] = coordinate.y;
        corners.buffer[start2 + 0] = Math.cos(angle) * radius;
        corners.buffer[start2 + 1] = Math.sin(angle) * radius;
        positions.buffer[start3 + 0] = position.x;
        positions.buffer[start3 + 1] = position.y;
        positions.buffer[start3 + 2] = position.z;
        tints.buffer[start4 + 0] = tint.x;
        tints.buffer[start4 + 1] = tint.y;
        tints.buffer[start4 + 2] = tint.z;
        tints.buffer[start4 + 3] = tint.w;
      }

      indices.buffer[indexStart + 0] = vertexStart + 0;
      indices.buffer[indexStart + 1] = vertexStart + 1;
      indices.buffer[indexStart + 2] = vertexStart + 2;
      indices.buffer[indexStart + 3] = vertexStart + 0;
      indices.buffer[indexStart + 4] = vertexStart + 2;
      indices.buffer[indexStart + 5] = vertexStart + 3;
    },
    index: indexBuffer,
    polygon: {
      coordinate: createAttribute(coordinateBuffer, 2),
      corner: createAttribute(cornerBuffer, 2),
      position: createAttribute(positionBuffer, 3),
      tint: createAttribute(tintBuffer, 4),
    },
    sources: [],
    spark,
    sprite,
  };
};

const createParticleRenderer = <TSeed>(
  runtime: GlRuntime,
  target: GlTarget
): ParticleRenderer<TSeed> => {
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

  billboardBinding.setAttribute("particleTint", ({ polygon }) => polygon.tint);

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

  const billboards: ParticleBillboard[] = [];
  const painter = new SinglePainter(billboardBinding, ({ index }) => index);
  const sceneState = {
    billboardMatrix: Matrix4.fromIdentity(),
    projectionMatrix: Matrix4.identity,
    viewMatrix: Matrix4.identity,
  };

  return {
    append(subject) {
      const { define, duration, sprite, variants } = subject;

      const billboard = createBillboard(runtime.context, sprite, variants);

      billboards.push(billboard);

      return {
        action: {
          emit: (count, center, seed) => {
            billboard.sources.push({
              center: { x: center.x, y: center.y, z: center.z },
              count,
              duration,
              elapsed: 0,
              update: define(seed),
            });
          },
        },

        remove: () => {}, // FIXME: not implemented
      };
    },

    dispose() {
      for (const billboard of billboards) {
        billboard.dispose();
      }

      shader.dispose();
    },

    render(scene) {
      const { projectionMatrix, viewMatrix } = scene;
      const gl = runtime.context;

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

      sceneBinding.bind(sceneState);

      for (let i = 0; i < billboards.length; ++i) {
        painter.paint(target, billboards[i]);
      }
    },

    resize() {},

    update(dt) {
      for (const billboard of billboards) {
        const { flush, reserve, sources, spark, write } = billboard;

        // Update all sources and remove expired ones
        let nbSparks = 0;

        for (let sourceIndex = 0; sourceIndex < sources.length; ) {
          const source = sources[sourceIndex];

          source.elapsed += dt;

          if (source.elapsed >= source.duration) {
            sources[sourceIndex] = sources[sources.length - 1];
            sources.pop();

            continue;
          }

          nbSparks += source.count;

          sourceIndex++;
        }

        reserve(nbSparks);

        let sparkIndex = 0;

        for (let sourceIndex = 0; sourceIndex < sources.length; ++sourceIndex) {
          const source = sources[sourceIndex];
          const { center, count, duration, elapsed, update } = source;

          for (let i = count; i-- > 0; ) {
            update(spark, i / count, elapsed / duration);

            spark.position.add(center);

            write(sparkIndex++);
          }
        }

        flush();
      }
    },
  };
};

export {
  type ParticleAction,
  type ParticleRenderer,
  type ParticleScene,
  createParticleRenderer,
};
