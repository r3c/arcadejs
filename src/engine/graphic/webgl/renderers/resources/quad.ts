import { Matrix4 } from "../../../../math/matrix";
import { Model } from "../../../model";

const model: Model = {
  meshes: [
    {
      children: [],
      polygons: [
        {
          coordinates: [
            { x: 0.0, y: 0.0 },
            { x: 1.0, y: 0.0 },
            { x: 1.0, y: 1.0 },
            { x: 0.0, y: 1.0 },
          ],
          indices: [
            { x: 0, y: 1, z: 2 },
            { x: 0, y: 2, z: 3 },
          ],
          positions: [
            { x: -1.0, y: -1.0, z: 0.0 },
            { x: 1.0, y: -1.0, z: 0.0 },
            { x: 1.0, y: 1.0, z: 0.0 },
            { x: -1.0, y: 1.0, z: 0.0 },
          ],
        },
      ],
      transform: Matrix4.identity,
    },
  ],
};

export { model };
