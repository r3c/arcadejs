import { Mesh } from "../engine/graphic/model";
import { Matrix4 } from "../engine/math/matrix";
import { Vector3 } from "../engine/math/vector";

interface CustomMesh {
  indices: Vector3[];
  positions: Vector3[];
}

const convertMesh = ({ indices, positions }: CustomMesh): Mesh => ({
  children: [],
  polygons: [{ indices, positions }],
  transform: Matrix4.identity,
});

export { convertMesh };
