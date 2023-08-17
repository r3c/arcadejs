import { Matrix4 } from "../../../../math/matrix";
import { GlModel, defaultMaterial } from "../../../webgl";
import { GlAttribute, GlContext, attribute, indexBuffer } from "../../resource";
import { PointLight } from "../snippets/light";

const emptyFloat32s = new Float32Array();
const emptyInt32s = new Uint32Array();

type GlLightBillboard = {
  dispose: () => void;
  set: (lights: ArrayLike<PointLight>) => void;
  model: GlModel<GlLightPolygon>;
};

type GlLightPolygon = {
  lightColor: GlAttribute;
  lightCorner: GlAttribute;
  lightPosition: GlAttribute;
  lightRadius: GlAttribute;
};

// Try to reuse given array if length is close enough from required one to
// reduce number of buffer allocations
const recycleArray = <TArray extends Float32Array | Uint32Array>(
  constructor: { new (length: number): TArray },
  array: TArray,
  length: number
): TArray => {
  return array.length < length || array.length >= length * 2
    ? new constructor(length)
    : array;
};

const pointLightBillboard = (gl: GlContext): GlLightBillboard => {
  const index = indexBuffer(gl, emptyInt32s, 0, true);
  const lightColor = attribute(gl, emptyFloat32s, 0, 3, true);
  const lightCorner = attribute(gl, emptyFloat32s, 0, 2, true);
  const lightPosition = attribute(gl, emptyFloat32s, 0, 3, true);
  const lightRadius = attribute(gl, emptyFloat32s, 0, 1, true);

  let indexArray = new Uint32Array();
  let lightColorArray = new Float32Array();
  let lightCornerArray = new Float32Array();
  let lightPositionArray = new Float32Array();
  let lightRadiusArray = new Float32Array();

  return {
    dispose: () => {
      lightColor.dispose();
      lightCorner.dispose();
      lightPosition.dispose();
      lightRadius.dispose();
      index.dispose();
    },
    set: (lights) => {
      const indexLength = lights.length * 6;
      const lightColorLength = lights.length * 3 * 4; // 3 components & 4 vertices
      const lightCornerLength = lights.length * 2 * 4; // 2 coordinates & 4 vertices
      const lightPositionLength = lights.length * 3 * 4; // 3 dimensions & 4 vertices
      const lightRadiusLength = lights.length * 4; // 4 vertices

      indexArray = recycleArray(Uint32Array, indexArray, indexLength);
      lightColorArray = recycleArray(
        Float32Array,
        lightColorArray,
        lightColorLength
      );
      lightCornerArray = recycleArray(
        Float32Array,
        lightCornerArray,
        lightCornerLength
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

      for (let i = 0; i < lights.length; ++i) {
        const { color, position, radius } = lights[i];
        const start = i * 4;

        indexArray[i * 6 + 0] = start + 0;
        indexArray[i * 6 + 1] = start + 1;
        indexArray[i * 6 + 2] = start + 2;
        indexArray[i * 6 + 3] = start + 0;
        indexArray[i * 6 + 4] = start + 2;
        indexArray[i * 6 + 5] = start + 3;

        for (let vertex = 0; vertex < 4; ++vertex) {
          lightColorArray[(start + vertex) * 3 + 0] = color.x;
          lightColorArray[(start + vertex) * 3 + 1] = color.y;
          lightColorArray[(start + vertex) * 3 + 2] = color.z;
          lightPositionArray[(start + vertex) * 3 + 0] = position.x;
          lightPositionArray[(start + vertex) * 3 + 1] = position.y;
          lightPositionArray[(start + vertex) * 3 + 2] = position.z;
          lightRadiusArray[start + vertex] = radius;
        }

        lightCornerArray[start * 2 + 0] = -radius;
        lightCornerArray[start * 2 + 1] = -radius;
        lightCornerArray[start * 2 + 2] = radius;
        lightCornerArray[start * 2 + 3] = -radius;
        lightCornerArray[start * 2 + 4] = radius;
        lightCornerArray[start * 2 + 5] = radius;
        lightCornerArray[start * 2 + 6] = -radius;
        lightCornerArray[start * 2 + 7] = radius;
      }

      index.set(indexArray, indexLength);
      lightColor.buffer.set(lightColorArray, lightColorLength);
      lightCorner.buffer.set(lightCornerArray, lightCornerLength);
      lightPosition.buffer.set(lightPositionArray, lightPositionLength);
      lightRadius.buffer.set(lightRadiusArray, lightRadiusLength);
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
              polygon: { lightColor, lightCorner, lightPosition, lightRadius },
            },
          ],
          transform: Matrix4.identity,
        },
      ],
    },
  };
};

export { type GlLightBillboard, type GlLightPolygon, pointLightBillboard };
