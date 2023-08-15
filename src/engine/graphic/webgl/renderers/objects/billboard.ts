import { Matrix4 } from "../../../../math/matrix";
import { GlModel, defaultMaterial } from "../../../webgl";
import {
  GlAttribute,
  GlContext,
  attributeCreate,
  bufferCreate,
} from "../../resource";
import { PointLight } from "../snippets/light";

const emptyFloats = new Float32Array();
const emptyIntegers = new Uint32Array();

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

const pointLightBillboard = (gl: GlContext): GlLightBillboard => {
  const lightColor = attributeCreate(gl, emptyFloats, 3, true);
  const lightPosition = attributeCreate(gl, emptyFloats, 3, true);
  const lightCorner = attributeCreate(gl, emptyFloats, 2, true);
  const lightRadius = attributeCreate(gl, emptyFloats, 1, true);
  const index = bufferCreate(gl, gl.ELEMENT_ARRAY_BUFFER, emptyIntegers, true);

  return {
    dispose: () => {
      lightColor.dispose();
      lightPosition.dispose();
      lightCorner.dispose();
      lightRadius.dispose();
      index.dispose();
    },
    set: (lights) => {
      const colorArray = new Array(lights.length * 3 * 4); // 3 components & 4 vertices
      const positionCenterArray = new Array(lights.length * 3 * 4); // 3 dimensions & 4 vertices
      const positionCornerArray = new Array(lights.length * 2 * 4); // 2 coordinates & 4 vertices
      const radiusArray = new Array(lights.length * 4); // 4 vertices
      const indexArray = new Array(lights.length * 6);

      for (let i = 0; i < lights.length; ++i) {
        const { color, position, radius } = lights[i];
        const start = i * 4;

        for (let vertex = 0; vertex < 4; ++vertex) {
          colorArray[(start + vertex) * 3 + 0] = color.x;
          colorArray[(start + vertex) * 3 + 1] = color.y;
          colorArray[(start + vertex) * 3 + 2] = color.z;
          positionCenterArray[(start + vertex) * 3 + 0] = position.x;
          positionCenterArray[(start + vertex) * 3 + 1] = position.y;
          positionCenterArray[(start + vertex) * 3 + 2] = position.z;
        }

        positionCornerArray[start * 2 + 0] = -radius;
        positionCornerArray[start * 2 + 1] = -radius;
        positionCornerArray[start * 2 + 2] = radius;
        positionCornerArray[start * 2 + 3] = -radius;
        positionCornerArray[start * 2 + 4] = radius;
        positionCornerArray[start * 2 + 5] = radius;
        positionCornerArray[start * 2 + 6] = -radius;
        positionCornerArray[start * 2 + 7] = radius;

        radiusArray[start + 0] = radius;
        radiusArray[start + 1] = radius;
        radiusArray[start + 2] = radius;
        radiusArray[start + 3] = radius;

        indexArray[i * 6 + 0] = start + 0;
        indexArray[i * 6 + 1] = start + 1;
        indexArray[i * 6 + 2] = start + 2;
        indexArray[i * 6 + 3] = start + 0;
        indexArray[i * 6 + 4] = start + 2;
        indexArray[i * 6 + 5] = start + 3;
      }

      lightPosition.buffer.set(new Float32Array(positionCenterArray));
      lightColor.buffer.set(new Float32Array(colorArray));
      lightCorner.buffer.set(new Float32Array(positionCornerArray));
      lightRadius.buffer.set(new Float32Array(radiusArray));
      index.set(new Uint32Array(indexArray));
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
