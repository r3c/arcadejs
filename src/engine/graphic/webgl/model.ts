import { map } from "../../language/functional";
import { Matrix4 } from "../../math/matrix";
import { Vector2, Vector3, Vector4 } from "../../math/vector";
import { Material, Mesh, Model, Polygon, Texture } from "../model";
import { GlBuffer, GlContext, indexBuffer } from "./resource";
import { GlShaderAttribute, shaderAttribute } from "./shader";
import {
  GlTexture,
  GlTextureFormat,
  GlTextureType,
  textureCreate,
} from "./texture";

type GlLibrary = {
  materials: Map<Material, GlMaterial>;
};

type GlMaterial = {
  albedoFactor: number[];
  albedoMap: GlTexture | undefined;
  emissiveFactor: number[];
  emissiveMap: GlTexture | undefined;
  glossFactor: number[];
  glossMap: GlTexture | undefined;
  heightMap: GlTexture | undefined;
  heightParallaxBias: number;
  heightParallaxScale: number;
  metalnessMap: GlTexture | undefined;
  metalnessStrength: number;
  normalMap: GlTexture | undefined;
  occlusionMap: GlTexture | undefined;
  occlusionStrength: number;
  roughnessMap: GlTexture | undefined;
  roughnessStrength: number;
  shininess: number;
};

type GlMaterialExtractor = (material: GlMaterial) => GlTexture | undefined;

type GlMesh<TPolygon> = {
  children: GlMesh<TPolygon>[];
  primitives: GlPrimitive<TPolygon>[];
  transform: Matrix4;
};

// TODO: remove generic argument once not used by billboard model
type GlModel<TPolygon> = {
  library: GlLibrary | undefined;
  meshes: GlMesh<TPolygon>[];
};

type GlModelConfiguration = {
  isDynamic?: boolean;
  library?: GlLibrary;
};

type GlObject<TPolygon> = {
  matrix: Matrix4;
  model: GlModel<TPolygon>;
};

type GlPolygon = {
  coordinate: GlShaderAttribute | undefined;
  normal: GlShaderAttribute | undefined;
  position: GlShaderAttribute;
  tangent: GlShaderAttribute | undefined;
  tint: GlShaderAttribute | undefined;
};

type GlPrimitive<TPolygon> = {
  index: GlBuffer;
  material: GlMaterial;
  polygon: TPolygon;
};

const colorBlack = { x: 0, y: 0, z: 0, w: 0 };
const colorWhite = { x: 1, y: 1, z: 1, w: 1 };

const defaultMaterial: GlMaterial = {
  albedoFactor: Vector4.toArray(colorWhite),
  albedoMap: undefined,
  emissiveFactor: Vector4.toArray(colorBlack),
  emissiveMap: undefined,
  glossFactor: Vector4.toArray(colorWhite),
  glossMap: undefined,
  heightMap: undefined,
  heightParallaxBias: 0,
  heightParallaxScale: 0,
  metalnessMap: undefined,
  metalnessStrength: 0,
  normalMap: undefined,
  occlusionMap: undefined,
  occlusionStrength: 0,
  roughnessMap: undefined,
  roughnessStrength: 0,
  shininess: 30,
};

const materialExtractors: GlMaterialExtractor[] = [
  (material) => material.albedoMap,
  (material) => material.emissiveMap,
  (material) => material.glossMap,
  (material) => material.heightMap,
  (material) => material.metalnessMap,
  (material) => material.normalMap,
  (material) => material.occlusionMap,
  (material) => material.roughnessMap,
];

// TODO: replace by disposable implementation
const deleteLibrary = (gl: GlContext, library: GlLibrary): void => {
  for (const material of library.materials.values()) {
    deleteMaterial(gl, material);
  }
};

// TODO: replace by disposable implementation
const deleteMaterial = (gl: GlContext, material: GlMaterial): void => {
  for (const extractor of materialExtractors) {
    const texture = extractor(material);

    if (texture !== undefined) {
      gl.deleteTexture(texture);
    }
  }
};

// TODO: replace by disposable implementation
const deleteMesh = <TPolygon>(
  gl: GlContext,
  mesh: GlMesh<TPolygon>,
  extractor: (polygon: TPolygon) => Iterable<GlShaderAttribute | undefined>
): void => {
  for (const child of mesh.children) {
    deleteMesh(gl, child, extractor);
  }

  for (const { index, polygon } of mesh.primitives) {
    for (const attribute of extractor(polygon)) {
      if (attribute !== undefined) {
        attribute.dispose();
      }
    }

    index.dispose();
  }
};

// TODO: replace by disposable implementation
const deleteModel = <TPolygon>(
  gl: GlContext,
  model: GlModel<TPolygon>,
  extractor: (polygon: TPolygon) => Iterable<GlShaderAttribute | undefined>
): void => {
  const { library, meshes } = model;

  if (library !== undefined) {
    for (const material of library.materials.values()) {
      deleteMaterial(gl, material);
    }
  }

  for (const mesh of meshes) {
    deleteMesh(gl, mesh, extractor);
  }
};

const loadLibrary = (gl: GlContext, model: Model): GlLibrary => {
  const materials = new Map<Material, GlMaterial>();
  const textures = new Map<Texture, GlTexture>();

  const loadMesh = (mesh: Mesh): void => {
    for (const child of mesh.children) {
      loadMesh(child);
    }

    for (const { material } of mesh.polygons) {
      if (material === undefined || materials.has(material)) {
        continue;
      }

      materials.set(material, loadMaterial(gl, textures, material));
    }
  };

  for (const mesh of model.meshes) {
    loadMesh(mesh);
  }

  return { materials };
};

const loadMaterial = (
  gl: GlContext,
  textures: Map<Texture, GlTexture>,
  material: Material
): GlMaterial => {
  const toColorMap = (texture: Texture) => {
    let glTexture = textures.get(texture);

    if (glTexture === undefined) {
      glTexture = textureCreate(
        gl,
        undefined,
        GlTextureType.Quad,
        texture.image.width,
        texture.image.height,
        GlTextureFormat.RGBA8,
        texture.filter,
        texture.image
      );

      textures.set(texture, glTexture);
    }

    return glTexture;
  };

  // FIXME: mutualize defaults with `defaultMaterial`
  return {
    albedoFactor: Vector4.toArray(material.albedoFactor ?? colorWhite),
    albedoMap: map(material.albedoMap, toColorMap),
    emissiveFactor: Vector4.toArray(material.emissiveFactor ?? colorBlack),
    emissiveMap: map(material.emissiveMap, toColorMap),
    glossFactor: Vector4.toArray(
      material.glossFactor ?? material.albedoFactor ?? colorWhite
    ),
    glossMap: map(material.glossMap, toColorMap),
    heightMap: map(material.heightMap, toColorMap),
    heightParallaxBias: material.heightParallaxBias ?? 0,
    heightParallaxScale: material.heightParallaxScale ?? 0,
    metalnessMap: map(material.metalnessMap, toColorMap),
    metalnessStrength: material.metalnessStrength ?? 0,
    normalMap: map(material.normalMap, toColorMap),
    occlusionMap: map(material.occlusionMap, toColorMap),
    occlusionStrength: material.occlusionStrength ?? 0,
    roughnessMap: map(material.roughnessMap, toColorMap),
    roughnessStrength: material.roughnessStrength ?? 0,
    shininess: material.shininess ?? 30,
  };
};

/**
 * Load model into given WebGL context. If a previously loaded "recycle" model
 * is passed, every compatible material it contains will be recycled to avoid
 * deleting and loading its textures again, then it will be deleted.
 */
const loadModel = (
  gl: GlContext,
  model: Model,
  config?: GlModelConfiguration
): GlModel<GlPolygon> => {
  let ownedLibrary: GlLibrary | undefined;
  let usedLibrary: GlLibrary;

  if (config?.library !== undefined) {
    ownedLibrary = undefined;
    usedLibrary = config?.library;
  } else {
    ownedLibrary = loadLibrary(gl, model);
    usedLibrary = ownedLibrary;
  }

  const loadMesh = (mesh: Mesh): GlMesh<GlPolygon> => ({
    children: mesh.children.map((child) => loadMesh(child)),
    primitives: mesh.polygons.map((polygon) =>
      loadPrimitive(gl, usedLibrary, polygon, isDynamic)
    ),
    transform: mesh.transform,
  });

  const isDynamic = config?.isDynamic ?? false;
  const meshes = model.meshes.map(loadMesh);

  return { library: ownedLibrary, meshes };
};

const loadPrimitive = (
  gl: GlContext,
  library: GlLibrary,
  polygon: Polygon,
  isDynamic: boolean
): GlPrimitive<GlPolygon> => {
  const { materials } = library;

  const index = indexBuffer(
    gl,
    new Uint32Array(polygon.indices),
    polygon.indices.length,
    isDynamic
  );

  return {
    index,
    material:
      polygon.material !== undefined
        ? materials.get(polygon.material) ?? defaultMaterial
        : defaultMaterial,
    polygon: {
      coordinate: map(polygon.coordinates, (coordinates) =>
        shaderAttribute(
          gl,
          new Float32Array(coordinates.flatMap(Vector2.toArray)),
          coordinates.length * 2,
          2,
          isDynamic
        )
      ),
      normal: map(polygon.normals, (normals) =>
        shaderAttribute(
          gl,
          new Float32Array(normals.flatMap(Vector3.toArray)),
          normals.length * 3,
          3,
          isDynamic
        )
      ),
      position: shaderAttribute(
        gl,
        new Float32Array(polygon.positions.flatMap(Vector3.toArray)),
        polygon.positions.length * 3,
        3,
        isDynamic
      ),
      tangent: map(polygon.tangents, (tangents) =>
        shaderAttribute(
          gl,
          new Float32Array(tangents.flatMap(Vector3.toArray)),
          tangents.length * 3,
          3,
          isDynamic
        )
      ),
      tint: map(polygon.tints, (tints) =>
        shaderAttribute(
          gl,
          new Float32Array(tints.flatMap(Vector4.toArray)),
          tints.length * 4,
          4,
          isDynamic
        )
      ),
    },
  };
};

// TODO: keep private once GlModel is not generic anymore
const polygonExtractor: (
  polygon: GlPolygon
) => Iterable<GlShaderAttribute | undefined> = (polygon) => [
  polygon.coordinate,
  polygon.normal,
  polygon.position,
  polygon.tangent,
  polygon.tint,
];

export {
  type GlObject,
  type GlMaterial,
  type GlMesh,
  type GlModel,
  type GlPolygon,
  defaultMaterial,
  deleteLibrary,
  deleteModel,
  loadLibrary,
  loadModel,
  polygonExtractor,
};
