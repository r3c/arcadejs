import { Matrix4 } from "../../math/matrix";
import { Vector2, Vector3, Vector4 } from "../../math/vector";

interface BoundingBox {
  xMax: number;
  xMin: number;
  yMax: number;
  yMin: number;
  zMax: number;
  zMin: number;
}

const enum Interpolation {
  Linear,
  Nearest,
}

interface Filter {
  magnifier: Interpolation;
  minifier: Interpolation;
  mipmap: boolean;
  wrap: Wrap;
}

interface Library {
  textures: Map<string, Promise<Texture>>;
}

interface Polygon {
  coordinates?: Vector2[];
  indices: Vector3[];
  material?: Material;
  normals?: Vector3[];
  positions: Vector3[];
  tangents?: Vector3[];
  tints?: Vector4[];
}

interface Instance {
  mesh: Mesh;
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

export {
  type BoundingBox,
  type Filter,
  type Instance,
  type Library,
  type Material,
  type Mesh,
  type Polygon,
  type Texture,
  Interpolation,
  Wrap,
  defaultColor,
  defaultFilter,
};
