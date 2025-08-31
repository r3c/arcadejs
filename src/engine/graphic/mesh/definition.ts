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

type Library = {
  getOrLoadMaterial: (reference: MaterialReference) => Promise<Material>;
  getOrLoadTexture: (path: string, sampler: TextureSampler) => Promise<Texture>;
};

interface Polygon {
  coordinates?: Vector2[];
  indices: Vector3[];
  material?: Material;
  normals?: Vector3[];
  positions: Vector3[];
  tangents?: Vector3[];
  tints?: Vector4[];
}

type Material = {
  diffuseColor?: Vector4;
  diffuseMap?: Texture;
  emissiveColor?: Vector4;
  emissiveMap?: Texture;
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
  specularColor?: Vector4;
  specularMap?: Texture;
};

type MaterialReference = {
  diffuseColor?: Vector4;
  diffusePath?: string;
  diffuseSampler?: TextureSampler;
  emissiveColor?: Vector4;
  emissivePath?: string;
  emissiveSampler?: TextureSampler;
  heightPath?: string;
  heightSampler?: TextureSampler;
  heightParallaxBias?: number;
  heightParallaxScale?: number;
  metalnessPath?: string;
  metalnessSampler?: TextureSampler;
  metalnessStrength?: number;
  normalPath?: string;
  normalSampler?: TextureSampler;
  occlusionPath?: string;
  occlusionSampler?: TextureSampler;
  occlusionStrength?: number;
  roughnessPath?: string;
  roughnessSampler?: TextureSampler;
  roughnessStrength?: number;
  shininess?: number;
  specularColor?: Vector4;
  specularPath?: string;
  specularSampler?: TextureSampler;
};

interface Mesh {
  children: Mesh[];
  polygons: Polygon[];
  transform: Matrix4;
}

type Texture = {
  imageData: ImageData;
  sampler: TextureSampler;
};

type TextureSampler = {
  magnifier: Interpolation;
  minifier: Interpolation;
  mipmap: boolean;
  wrap: Wrap;
};

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

const defaultSampler: TextureSampler = {
  magnifier: Interpolation.Linear,
  minifier: Interpolation.Linear,
  mipmap: true,
  wrap: Wrap.Repeat,
};

export {
  type BoundingBox,
  type Library,
  type Material,
  type MaterialReference,
  type Mesh,
  type Polygon,
  type Texture,
  type TextureSampler,
  Interpolation,
  Wrap,
  defaultColor,
  defaultSampler,
};
