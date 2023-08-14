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
          coords: [
            { x: -1.0, y: -1.0 },
            { x: 1.0, y: -1.0 },
            { x: 1.0, y: 1.0 },
            { x: -1.0, y: 1.0 },
          ],
          indices: [0, 1, 2, 0, 2, 3],
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
          ],
        },
      ],
      transform: Matrix4.identity,
    },
  ],
};

export { model };
