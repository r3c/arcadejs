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
 * Try to reuse given array if length is close enough from required one to
 * reduce number of buffer allocations
 */
const recycleArray = <TArray extends Float32Array | Uint32Array>(
  constructor: { new (length: number): TArray },
  array: TArray,
  length: number
): TArray => {
  return array.length < length || array.length >= length * 2
    ? new constructor(length)
    : array;
};

/**
 * Build simple quad intended to be displayed full screen.
 */
const directionalLightBillboard = (
  gl: GlContext
): GlDirectionalLightBillboard => {
  const index = createDynamicIndexBuffer(gl, Uint32Array, 10);

  index.reset(new Uint32Array([0, 1, 2, 0, 2, 3]), 6);

  const lightPositionBuffer = createStaticArrayBuffer(gl, Float32Array);
  const lightPosition = createAttribute(lightPositionBuffer, 3);

  lightPositionBuffer.reset(
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
  const index = createDynamicIndexBuffer(gl, Uint32Array, 10);
  const lightColor = createDynamicArrayBuffer(gl, Float32Array, 10);
  const lightPosition = createDynamicArrayBuffer(gl, Float32Array, 10);
  const lightRadius = createDynamicArrayBuffer(gl, Float32Array, 10);
  const lightShift = createDynamicArrayBuffer(gl, Float32Array, 10);
  const nbIndex = 30;
  const nbVertex = 8;

  let indexArray = new Uint32Array();
  let lightColorArray = new Float32Array();
  let lightPositionArray = new Float32Array();
  let lightRadiusArray = new Float32Array();
  let lightShiftArray = new Float32Array();

  return {
    dispose: () => {
      index.dispose();
      lightColor.dispose();
      lightPosition.dispose();
      lightRadius.dispose();
      lightShift.dispose();
    },
    set: (lights) => {
      const indexLength = lights.length * nbIndex;
      const lightColorLength = lights.length * 3 * nbVertex;
      const lightPositionLength = lights.length * 3 * nbVertex;
      const lightRadiusLength = lights.length * nbVertex;
      const lightShiftLength = lights.length * 3 * nbVertex;

      indexArray = recycleArray(Uint32Array, indexArray, indexLength);
      lightColorArray = recycleArray(
        Float32Array,
        lightColorArray,
        lightColorLength
      );
      lightPositionArray = recycleArray(
        Float32Array,
        lightPositionArray,
        lightPositionLength
      );
      lightRadiusArray = recycleArray(
        Float32Array,
        lightRadiusArray,
        lightRadiusLength
      );
      lightShiftArray = recycleArray(
        Float32Array,
        lightShiftArray,
        lightShiftLength
      );

      for (let i = 0; i < lights.length; ++i) {
        const { color, position, radius } = lights[i];
        const indexOffset = i * nbIndex;
        const vertexOffset = i * nbVertex;

        for (let vertex = 0; vertex < nbVertex; ++vertex) {
          lightColorArray[(vertexOffset + vertex) * 3 + 0] = color.x;
          lightColorArray[(vertexOffset + vertex) * 3 + 1] = color.y;
          lightColorArray[(vertexOffset + vertex) * 3 + 2] = color.z;
          lightPositionArray[(vertexOffset + vertex) * 3 + 0] = position.x;
          lightPositionArray[(vertexOffset + vertex) * 3 + 1] = position.y;
          lightPositionArray[(vertexOffset + vertex) * 3 + 2] = position.z;
          lightRadiusArray[vertexOffset + vertex] = radius;
        }

        indexArray.set(
          [
            vertexOffset + 0,
            vertexOffset + 7,
            vertexOffset + 3,
            vertexOffset + 4,
            vertexOffset + 7,
            vertexOffset + 0,
            vertexOffset + 2,
            vertexOffset + 5,
            vertexOffset + 1,
            vertexOffset + 6,
            vertexOffset + 5,
            vertexOffset + 2,
            vertexOffset + 0,
            vertexOffset + 1,
            vertexOffset + 4,
            vertexOffset + 5,
            vertexOffset + 4,
            vertexOffset + 1,
            vertexOffset + 2,
            vertexOffset + 3,
            vertexOffset + 6,
            vertexOffset + 7,
            vertexOffset + 6,
            vertexOffset + 3,
            vertexOffset + 4,
            vertexOffset + 5,
            vertexOffset + 7,
            vertexOffset + 5,
            vertexOffset + 6,
            vertexOffset + 7,
          ],
          indexOffset
        );

        lightShiftArray.set(
          [
            -radius,
            -radius,
            0,
            radius,
            -radius,
            0,
            radius,
            radius,
            0,
            -radius,
            radius,
            0,
            -radius,
            -radius,
            -radius,
            radius,
            -radius,
            -radius,
            radius,
            radius,
            -radius,
            -radius,
            radius,
            -radius,
          ],
          vertexOffset * 3
        );
      }

      index.reset(indexArray, indexLength);
      lightColor.reset(lightColorArray, lightColorLength);
      lightPosition.reset(lightPositionArray, lightPositionLength);
      lightRadius.reset(lightRadiusArray, lightRadiusLength);
      lightShift.reset(lightShiftArray, lightShiftLength);
    },
    index,
    polygon: {
      lightColor: createAttribute(lightColor, 3),
      lightPosition: createAttribute(lightPosition, 3),
      lightRadius: createAttribute(lightRadius, 1),
      lightShift: createAttribute(lightShift, 3),
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
