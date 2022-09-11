import { Matrix4 } from "../../math/matrix";
import { Vector4 } from "../../math/vector";

interface Attribute {
  buffer: TypedArray;
  stride: number;
}

interface BoundingBox {
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

interface Polygon {
  colors?: Attribute;
  coords?: Attribute;
  indices: TypedArray;
  material?: Material;
  normals?: Attribute;
  points: Attribute;
  tangents?: Attribute;
}

const enum Interpolation {
  Linear,
  Nearest,
}

interface Instance {
  model: Model;
  transform: Matrix4;
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
  children: Mesh[];
  polygons: Polygon[];
  transform: Matrix4;
}

interface Model {
  meshes: Mesh[];
}

interface Texture {
  filter: Filter;
  image: ImageData;
}

type TypedArray =
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

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

export {
  type Attribute,
  type BoundingBox,
  type Filter,
  type Instance,
  type Material,
  type Mesh,
  type Model,
  type Polygon,
  type Texture,
  type TypedArray,
  Interpolation,
  Wrap,
  defaultColor,
  defaultFilter,
};
