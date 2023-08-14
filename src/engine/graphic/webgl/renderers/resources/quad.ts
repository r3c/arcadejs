import { Matrix4 } from "../../../../math/matrix";
import { Model } from "../../../model";

const model: Model = {
  meshes: [
    {
      children: [],
      polygons: [
        {
          coords: [
            { x: 0.0, y: 0.0 },
            { x: 1.0, y: 0.0 },
            { x: 1.0, y: 1.0 },
            { x: 0.0, y: 1.0 },
          ],
          indices: [0, 1, 2, 0, 2, 3],
          points: [
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
