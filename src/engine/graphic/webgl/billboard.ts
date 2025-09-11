import { createFlexibleArray } from "../../io/memory";
import { Disposable } from "../../language/lifecycle";
import {
  GlBuffer,
  GlContext,
  createDynamicArrayBuffer,
  createDynamicIndexBuffer,
  createStaticArrayBuffer,
} from "./resource";
import { GlShaderAttribute, createAttribute } from "./shader";
import { PointLight } from "./shaders/light";

type GlDirectionalLightBillboard = Disposable & {
  indexBuffer: GlBuffer;
  polygon: GlDirectionalLightPolygon;
};

type GlDirectionalLightPolygon = {
  lightPosition: GlShaderAttribute;
};

type GlPointLightBillboard = Disposable & {
  set: (lights: ArrayLike<PointLight>) => void;
  indexBuffer: GlBuffer;
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
  const indexBuffer = createDynamicIndexBuffer(gl, Uint32Array, 10);

  indexBuffer.set(new Uint32Array([0, 1, 2, 0, 2, 3]), 6);

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
      indexBuffer.dispose();
      lightPositionBuffer.dispose();
    },
    indexBuffer,
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
  const colorArray = createFlexibleArray(Float32Array, 10);
  const colorBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);
  const indexArray = createFlexibleArray(Uint32Array, 10);
  const indexBuffer = createDynamicIndexBuffer(gl, Uint32Array, 10);
  const positionArray = createFlexibleArray(Float32Array, 10);
  const positionBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);
  const radiusArray = createFlexibleArray(Float32Array, 10);
  const radiusBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);
  const shiftArray = createFlexibleArray(Float32Array, 10);
  const shiftBuffer = createDynamicArrayBuffer(gl, Float32Array, 10);

  return {
    dispose: () => {
      colorBuffer.dispose();
      indexBuffer.dispose();
      positionBuffer.dispose();
      radiusBuffer.dispose();
      shiftBuffer.dispose();
    },
    set: (lights) => {
      const nbIndices = lights.length * nbCubeIndices;
      const nbVertices = lights.length * nbCubeVertices;

      colorArray.resize(nbVertices * 3);
      indexArray.resize(nbIndices);
      positionArray.resize(nbVertices * 3);
      radiusArray.resize(nbVertices * 1);
      shiftArray.resize(nbVertices * 3);

      for (let i = 0; i < lights.length; ++i) {
        const { color, position, radius } = lights[i];
        const indexStart = i * nbCubeIndices;
        const vertexStart = i * nbCubeVertices;

        for (let vertexIndex = 0; vertexIndex < nbCubeVertices; ++vertexIndex) {
          const start1 = (vertexStart + vertexIndex) * 1;
          const start3 = (vertexStart + vertexIndex) * 3;

          colorArray.buffer[start3 + 0] = color.x;
          colorArray.buffer[start3 + 1] = color.y;
          colorArray.buffer[start3 + 2] = color.z;
          positionArray.buffer[start3 + 0] = position.x;
          positionArray.buffer[start3 + 1] = position.y;
          positionArray.buffer[start3 + 2] = position.z;
          radiusArray.buffer[start1] = radius;
        }

        for (let j = indexOffsets.length; j-- > 0; ) {
          indexArray.buffer[indexStart + j] = vertexStart + indexOffsets[j];
        }

        const start3 = vertexStart * 3;

        for (let j = shiftFactors.length; j-- > 0; ) {
          shiftArray.buffer[start3 + j] = shiftFactors[j] * radius;
        }
      }

      colorBuffer.resize(colorArray.length);
      colorBuffer.update(0, colorArray.buffer, colorArray.length);
      indexBuffer.resize(indexArray.length);
      indexBuffer.update(0, indexArray.buffer, indexArray.length);
      positionBuffer.resize(positionArray.length);
      positionBuffer.update(0, positionArray.buffer, positionArray.length);
      radiusBuffer.resize(radiusArray.length);
      radiusBuffer.update(0, radiusArray.buffer, radiusArray.length);
      shiftBuffer.resize(shiftArray.length);
      shiftBuffer.update(0, shiftArray.buffer, shiftArray.length);
    },
    indexBuffer,
    polygon: {
      lightColor: createAttribute(colorBuffer, 3),
      lightPosition: createAttribute(positionBuffer, 3),
      lightRadius: createAttribute(radiusBuffer, 1),
      lightShift: createAttribute(shiftBuffer, 3),
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
