import { Matrix4 } from "../../../../math/matrix";
import { Model } from "../../../model";

// Quad model for displaying billboards, using a fixed point as center and
// texture coordinates as increment from this fixed point. Texture coordinates
// are added using a modified view matrix (billboard matrix) to ignore rotation.
const model: Model = {
  meshes: [
    {
      children: [],
      polygons: [
        {
          coords: {
            buffer: new Float32Array([
              -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
            ]),
            stride: 2,
          },
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
          points: {
            buffer: new Float32Array([
              0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            ]),
            stride: 3,
          },
        },
      ],
      transform: Matrix4.identity,
    },
  ],
};

export { model };
