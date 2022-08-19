import { Matrix4 } from "../math/matrix";
import { Vector3, Vector4 } from "../math/vector";

type Array =
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

interface Attribute {
  buffer: Array;
  stride: number;
}

interface Bounds {
  xMax: number;
  xMin: number;
  yMax: number;
  yMin: number;
  zMax: number;
  zMin: number;
}

interface Filter {
  magnifier: Interpolation;
  minifier: Interpolation;
  mipmap: boolean;
  wrap: Wrap;
}

interface Geometry {
  colors?: Attribute;
  coords?: Attribute;
  indices: Array;
  materialName?: string;
  normals?: Attribute;
  points: Attribute;
  tangents?: Attribute;
}

const enum Interpolation {
  Linear,
  Nearest,
}

interface Material {
  albedoFactor?: Vector4;
  albedoMap?: Texture;
  emissiveFactor?: Vector4;
  emissiveMap?: Texture;
  glossFactor?: Vector4;
  glossMap?: Texture;
  heightMap?: Texture;
  heightParallaxBias?: number;
  heightParallaxScale?: number;
  metalnessMap?: Texture;
  metalnessStrength?: number;
  normalMap?: Texture;
  occlusionMap?: Texture;
  occlusionStrength?: number;
  roughnessMap?: Texture;
  roughnessStrength?: number;
  shininess?: number;
}

interface Mesh {
  materials: { [name: string]: Material };
  nodes: Node[];
}

interface Node {
  children: Node[];
  geometries: Geometry[];
  transform: Matrix4;
}

interface Texture {
  filter: Filter;
  image: ImageData;
}

const enum Wrap {
  Clamp,
  Repeat,
  Mirror,
}

const defaultColor: Vector4 = {
  x: 1,
  y: 1,
  z: 1,
  w: 1,
};

const defaultFilter: Filter = {
  magnifier: Interpolation.Nearest,
  minifier: Interpolation.Nearest,
  mipmap: false,
  wrap: Wrap.Clamp,
};

const reduceNode = <TState>(
  nodes: Node[],
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, geometry: Geometry, transform: Matrix4) => TState
): TState => {
  for (const node of nodes) {
    const transform = Matrix4.createIdentity()
      .duplicate(parent)
      .multiply(node.transform);

    for (const geometry of node.geometries)
      state = reduce(state, geometry, transform);

    state = reduceNode(node.children, transform, state, reduce);
  }

  return state;
};

const reduceNodePoints = <TState>(
  nodes: Node[],
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, point: Vector3) => TState
): TState => {
  return reduceNode(
    nodes,
    parent,
    state,
    (previous: TState, geometry: Geometry, transform: Matrix4) => {
      const points = geometry.points;
      const buffer = points.buffer;
      const count = points.stride;

      for (let i = 0; i + count - 1 < buffer.length; i += count)
        state = reduce(
          previous,
          transform.transform({
            x: buffer[i + 0],
            y: buffer[i + 1],
            z: buffer[i + 2],
            w: 1,
          })
        );

      return state;
    }
  );
};

const computeBounds = (mesh: Mesh) => {
  const initial = {
    xMax: Number.MIN_VALUE,
    xMin: Number.MAX_VALUE,
    yMax: Number.MIN_VALUE,
    yMin: Number.MAX_VALUE,
    zMax: Number.MIN_VALUE,
    zMin: Number.MAX_VALUE,
  };

  return reduceNodePoints<Bounds>(
    mesh.nodes,
    Matrix4.createIdentity(),
    initial,
    (previous: Bounds, point: Vector3) => ({
      xMax: Math.max(previous.xMax, point.x),
      xMin: Math.min(previous.xMin, point.x),
      yMax: Math.max(previous.yMax, point.y),
      yMin: Math.min(previous.yMin, point.y),
      zMax: Math.max(previous.zMax, point.z),
      zMin: Math.min(previous.zMin, point.z),
    })
  );
};

export {
  type Array,
  type Attribute,
  type Filter,
  type Geometry,
  type Material,
  type Mesh,
  type Node,
  type Texture,
  Interpolation,
  Wrap,
  computeBounds,
  defaultColor,
  defaultFilter,
};
