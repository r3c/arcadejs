import { Matrix4 } from "../../../../math/matrix";
import { GlModel, defaultMaterial } from "../../model";
import { GlContext, indexBuffer } from "../../resource";
import { GlShaderAttribute, shaderAttribute } from "../../shader";
import { PointLight } from "../snippets/light";

const emptyFloat32s = new Float32Array();
const emptyInt32s = new Uint32Array();

type GlLightBillboard = {
  dispose: () => void;
  set: (lights: ArrayLike<PointLight>) => void;
  model: GlModel<GlLightPolygon>;
};

type GlLightPolygon = {
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
 * Build billboard mask suitable for rendering point lights. For each point
 * light half a cube is built to cover the light influence sphere. It's
 * intended to be displayed always facing camera using a custom view matrix
 * with no rotation.
 */
const pointLightBillboard = (gl: GlContext): GlLightBillboard => {
  const index = indexBuffer(gl, emptyInt32s, 0, true);
  const lightColor = shaderAttribute(gl, emptyFloat32s, 0, 3, true);
  const lightPosition = shaderAttribute(gl, emptyFloat32s, 0, 3, true);
  const lightRadius = shaderAttribute(gl, emptyFloat32s, 0, 1, true);
  const lightShift = shaderAttribute(gl, emptyFloat32s, 0, 3, true);

  let indexArray = new Uint32Array();
  let lightColorArray = new Float32Array();
  let lightPositionArray = new Float32Array();
  let lightRadiusArray = new Float32Array();
  let lightShiftArray = new Float32Array();

  return {
    dispose: () => {
      lightColor.dispose();
      lightPosition.dispose();
      lightRadius.dispose();
      lightShift.dispose();
      index.dispose();
    },
    set: (lights) => {
      const nbIndex = 30;
      const nbVertex = 8;
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

      index.set(indexArray, indexLength);
      lightColor.buffer.set(lightColorArray, lightColorLength);
      lightPosition.buffer.set(lightPositionArray, lightPositionLength);
      lightRadius.buffer.set(lightRadiusArray, lightRadiusLength);
      lightShift.buffer.set(lightShiftArray, lightShiftLength);
    },
    model: {
      library: undefined,
      meshes: [
        {
          children: [],
          primitives: [
            {
              index,
              material: defaultMaterial,
              polygon: {
                lightColor,
                lightPosition,
                lightRadius,
                lightShift,
              },
            },
          ],
          transform: Matrix4.identity,
        },
      ],
    },
  };
};

export { type GlLightBillboard, type GlLightPolygon, pointLightBillboard };
