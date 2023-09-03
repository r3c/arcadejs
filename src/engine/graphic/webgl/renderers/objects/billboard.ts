import { createFlexibleBuffer } from "../../../../io/memory";
import { Disposable } from "../../../../language/lifecycle";
import {
  GlBuffer,
  GlContext,
  createDynamicArrayBuffer,
  createDynamicIndexBuffer,
  createStaticArrayBuffer,
} from "../../resource";
import { GlShaderAttribute, createAttribute } from "../../shader";
import { PointLight } from "../snippets/light";

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
const directionalLightBillboard = (
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
const pointLightBillboard = (gl: GlContext): GlPointLightBillboard => {
  const color = createDynamicArrayBuffer(gl, Float32Array, 10);
  const colorBuffer = createFlexibleBuffer(Float32Array, 10);
  const index = createDynamicIndexBuffer(gl, Uint32Array, 10);
  const indexBuffer = createFlexibleBuffer(Uint32Array, 10);
  const position = createDynamicArrayBuffer(gl, Float32Array, 10);
  const positionBuffer = createFlexibleBuffer(Float32Array, 10);
  const radius = createDynamicArrayBuffer(gl, Float32Array, 10);
  const radiusBuffer = createFlexibleBuffer(Float32Array, 10);
  const shift = createDynamicArrayBuffer(gl, Float32Array, 10);
  const shiftBuffer = createFlexibleBuffer(Float32Array, 10);

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

      colorBuffer.reserve(nbVertices * 3);
      indexBuffer.reserve(nbIndices);
      positionBuffer.reserve(nbVertices * 3);
      radiusBuffer.reserve(nbVertices * 1);
      shiftBuffer.reserve(nbVertices * 3);

      for (let i = 0; i < lights.length; ++i) {
        const { color, position, radius } = lights[i];
        const indexStart = i * nbCubeIndices;
        const vertexStart = i * nbCubeVertices;

        for (let vertexIndex = 0; vertexIndex < nbCubeVertices; ++vertexIndex) {
          const start1 = (vertexStart + vertexIndex) * 1;
          const start3 = (vertexStart + vertexIndex) * 3;

          colorBuffer.array[start3 + 0] = color.x;
          colorBuffer.array[start3 + 1] = color.y;
          colorBuffer.array[start3 + 2] = color.z;
          positionBuffer.array[start3 + 0] = position.x;
          positionBuffer.array[start3 + 1] = position.y;
          positionBuffer.array[start3 + 2] = position.z;
          radiusBuffer.array[start1] = radius;
        }

        for (let j = indexOffsets.length; j-- > 0; ) {
          indexBuffer.array[indexStart + j] = vertexStart + indexOffsets[j];
        }

        const start3 = vertexStart * 3;

        for (let j = shiftFactors.length; j-- > 0; ) {
          shiftBuffer.array[start3 + j] = shiftFactors[j] * radius;
        }
      }

      color.reserve(colorBuffer.length);
      color.update(0, colorBuffer.array, colorBuffer.length);
      index.reserve(indexBuffer.length);
      index.update(0, indexBuffer.array, indexBuffer.length);
      position.reserve(positionBuffer.length);
      position.update(0, positionBuffer.array, positionBuffer.length);
      radius.reserve(radiusBuffer.length);
      radius.update(0, radiusBuffer.array, radiusBuffer.length);
      shift.reserve(shiftBuffer.length);
      shift.update(0, shiftBuffer.array, shiftBuffer.length);
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
  directionalLightBillboard,
  pointLightBillboard,
};
