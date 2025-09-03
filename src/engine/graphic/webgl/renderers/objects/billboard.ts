import { createFlexibleArray } from "../../../../io/memory";
import { Disposable } from "../../../../language/lifecycle";
import {
  GlBuffer,
  GlContext,
  createDynamicArrayBuffer,
  createDynamicIndexBuffer,
  createStaticArrayBuffer,
} from "../../resource";
import { GlShaderAttribute, createAttribute } from "../../shader";
import { PointLight } from "../../shaders/light";

type GlDirectionalLightBillboard = Disposable & {
  index: GlBuffer;
  polygon: GlDirectionalLightPolygon;
};

type GlDirectionalLightPolygon = {
  lightPosition: GlShaderAttribute;
};

type GlPointLightBillboard = Disposable & {
  set: (lights: ArrayLike<PointLight>) => void;
  index: GlBuffer;
  polygon: GlPointLightPolygon;
};

type GlPointLightPolygon = {
  lightColor: GlShaderAttribute;
  lightPosition: GlShaderAttribute;
  lightRadius: GlShaderAttribute;
  lightShift: GlShaderAttribute;
};

/**
 * Relative indices of light half cube vertices.
 */
const indexOffsets = [
  0, 7, 3, 4, 7, 0, 2, 5, 1, 6, 5, 2, 0, 1, 4, 5, 4, 1, 2, 3, 6, 7, 6, 3, 4, 5,
  7, 5, 6, 7,
];

/**
 * Relative shift factors of light half cube vertices.
 */
const shiftFactors = [
  -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, -1, 1, -1, -1, 1, 1, -1, -1,
  1, -1,
];

const nbCubeIndices = 30;
const nbCubeVertices = 8;

/**
 * Build simple quad intended to be displayed full screen.
 */
const createDirectionalLightBillboard = (
  gl: GlContext
): GlDirectionalLightBillboard => {
  const index = createDynamicIndexBuffer(gl, Uint32Array, 10);

  index.set(new Uint32Array([0, 1, 2, 0, 2, 3]), 6);

  const lightPositionBuffer = createStaticArrayBuffer(gl, Float32Array);
  const lightPosition = createAttribute(lightPositionBuffer, 3);

  lightPositionBuffer.set(
    new Float32Array([
      -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, 1.0, 1.0, 0.0, -1.0, 1.0, 0.0,
    ]),
    12
  );

  return {
    dispose: () => {
      index.dispose();
      lightPositionBuffer.dispose();
    },
    index,
    polygon: {
      lightPosition,
    },
  };
};

/**
 * Build billboard mask suitable for rendering point lights. For each point
 * light half a cube is built to cover the light influence sphere. It's
 * intended to be displayed always facing camera using a custom view matrix
 * with no rotation.
 */
const createPointLightBillboard = (gl: GlContext): GlPointLightBillboard => {
  const color = createDynamicArrayBuffer(gl, Float32Array, 10);
  const colorBuffer = createFlexibleArray(Float32Array, 10);
  const index = createDynamicIndexBuffer(gl, Uint32Array, 10);
  const indexBuffer = createFlexibleArray(Uint32Array, 10);
  const position = createDynamicArrayBuffer(gl, Float32Array, 10);
  const positionBuffer = createFlexibleArray(Float32Array, 10);
  const radius = createDynamicArrayBuffer(gl, Float32Array, 10);
  const radiusBuffer = createFlexibleArray(Float32Array, 10);
  const shift = createDynamicArrayBuffer(gl, Float32Array, 10);
  const shiftBuffer = createFlexibleArray(Float32Array, 10);

  return {
    dispose: () => {
      color.dispose();
      index.dispose();
      position.dispose();
      radius.dispose();
      shift.dispose();
    },
    set: (lights) => {
      const nbIndices = lights.length * nbCubeIndices;
      const nbVertices = lights.length * nbCubeVertices;

      colorBuffer.resize(nbVertices * 3);
      indexBuffer.resize(nbIndices);
      positionBuffer.resize(nbVertices * 3);
      radiusBuffer.resize(nbVertices * 1);
      shiftBuffer.resize(nbVertices * 3);

      for (let i = 0; i < lights.length; ++i) {
        const { color, position, radius } = lights[i];
        const indexStart = i * nbCubeIndices;
        const vertexStart = i * nbCubeVertices;

        for (let vertexIndex = 0; vertexIndex < nbCubeVertices; ++vertexIndex) {
          const start1 = (vertexStart + vertexIndex) * 1;
          const start3 = (vertexStart + vertexIndex) * 3;

          colorBuffer.buffer[start3 + 0] = color.x;
          colorBuffer.buffer[start3 + 1] = color.y;
          colorBuffer.buffer[start3 + 2] = color.z;
          positionBuffer.buffer[start3 + 0] = position.x;
          positionBuffer.buffer[start3 + 1] = position.y;
          positionBuffer.buffer[start3 + 2] = position.z;
          radiusBuffer.buffer[start1] = radius;
        }

        for (let j = indexOffsets.length; j-- > 0; ) {
          indexBuffer.buffer[indexStart + j] = vertexStart + indexOffsets[j];
        }

        const start3 = vertexStart * 3;

        for (let j = shiftFactors.length; j-- > 0; ) {
          shiftBuffer.buffer[start3 + j] = shiftFactors[j] * radius;
        }
      }

      color.resize(colorBuffer.length);
      color.update(0, colorBuffer.buffer, colorBuffer.length);
      index.resize(indexBuffer.length);
      index.update(0, indexBuffer.buffer, indexBuffer.length);
      position.resize(positionBuffer.length);
      position.update(0, positionBuffer.buffer, positionBuffer.length);
      radius.resize(radiusBuffer.length);
      radius.update(0, radiusBuffer.buffer, radiusBuffer.length);
      shift.resize(shiftBuffer.length);
      shift.update(0, shiftBuffer.buffer, shiftBuffer.length);
    },
    index,
    polygon: {
      lightColor: createAttribute(color, 3),
      lightPosition: createAttribute(position, 3),
      lightRadius: createAttribute(radius, 1),
      lightShift: createAttribute(shift, 3),
    },
  };
};

export {
  type GlDirectionalLightBillboard,
  type GlDirectionalLightPolygon,
  type GlPointLightBillboard,
  type GlPointLightPolygon,
  createDirectionalLightBillboard,
  createPointLightBillboard,
};
