import { optionalMap } from "../../language/optional";
import { Disposable } from "../../language/lifecycle";
import { Matrix4 } from "../../math/matrix";
import { Vector2, Vector3, Vector4 } from "../../math/vector";
import { Material, Mesh, Model, Polygon, Texture } from "../model";
import {
  GlBuffer,
  GlContext,
  createStaticArrayBuffer,
  createStaticIndexBuffer,
} from "./resource";
import { GlShaderAttribute, createAttribute } from "./shader";
import {
  GlTexture,
  GlTextureFormat,
  GlTextureType,
  createTexture,
} from "./texture";

type GlLibrary = Disposable & {
  materials: Map<Material, GlMaterial>;
};

type GlMaterial = Disposable & {
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

type GlMesh = Disposable & {
  children: GlMesh[];
  primitives: GlPrimitive[];
  transform: Matrix4;
};

type GlModel = Disposable & {
  library: GlLibrary | undefined;
  meshes: GlMesh[];
};

type GlModelConfiguration = {
  library?: GlLibrary;
};

// FIXME: should not be part of `model` module, replace with concept of model instance
type GlObject = {
  matrix: Matrix4;
  model: GlModel;
};

type GlPolygon = Disposable & {
  coordinate: GlShaderAttribute | undefined;
  normal: GlShaderAttribute | undefined;
  position: GlShaderAttribute;
  tangent: GlShaderAttribute | undefined;
  tint: GlShaderAttribute | undefined;
};

type GlPrimitive = Disposable & {
  index: GlBuffer;
  material: GlMaterial;
  polygon: GlPolygon;
};

const colorWhite = Vector4.toArray({ x: 1, y: 1, z: 1, w: 1 });

const defaultMaterial: GlMaterial = {
  dispose: () => {},
  albedoFactor: colorWhite,
  albedoMap: undefined,
  emissiveFactor: colorWhite,
  emissiveMap: undefined,
  glossFactor: colorWhite,
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

  return {
    dispose: () => {
      for (const material of materials.values()) {
        material.dispose();
      }
    },
    materials,
  };
};

const loadMaterial = (
  gl: GlContext,
  textures: Map<Texture, GlTexture>,
  material: Material
): GlMaterial => {
  const toColorMap = (texture: Texture) => {
    let glTexture = textures.get(texture);

    if (glTexture === undefined) {
      glTexture = createTexture(
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

  const albedoMap = optionalMap(material.albedoMap, toColorMap);
  const emissiveMap = optionalMap(material.emissiveMap, toColorMap);
  const glossMap = optionalMap(material.glossMap, toColorMap);
  const heightMap = optionalMap(material.heightMap, toColorMap);
  const metalnessMap = optionalMap(material.metalnessMap, toColorMap);
  const normalMap = optionalMap(material.normalMap, toColorMap);
  const occlusionMap = optionalMap(material.occlusionMap, toColorMap);
  const roughnessMap = optionalMap(material.roughnessMap, toColorMap);

  return {
    dispose: () => {
      albedoMap?.dispose();
      emissiveMap?.dispose();
      glossMap?.dispose();
      heightMap?.dispose();
      metalnessMap?.dispose();
      normalMap?.dispose();
      occlusionMap?.dispose();
      roughnessMap?.dispose();
    },
    albedoFactor:
      optionalMap(material.albedoFactor, Vector4.toArray) ??
      defaultMaterial.albedoFactor,
    albedoMap,
    emissiveFactor:
      optionalMap(material.emissiveFactor, Vector4.toArray) ??
      defaultMaterial.emissiveFactor,
    emissiveMap,
    glossFactor:
      optionalMap(material.glossFactor, Vector4.toArray) ??
      defaultMaterial.glossFactor,
    glossMap,
    heightMap,
    heightParallaxBias:
      material.heightParallaxBias ?? defaultMaterial.heightParallaxBias,
    heightParallaxScale:
      material.heightParallaxScale ?? defaultMaterial.heightParallaxScale,
    metalnessMap,
    metalnessStrength:
      material.metalnessStrength ?? defaultMaterial.metalnessStrength,
    normalMap,
    occlusionMap,
    occlusionStrength:
      material.occlusionStrength ?? defaultMaterial.occlusionStrength,
    roughnessMap,
    roughnessStrength:
      material.roughnessStrength ?? defaultMaterial.roughnessStrength,
    shininess: material.shininess ?? defaultMaterial.shininess,
  };
};

const loadMesh = (gl: GlContext, mesh: Mesh, library: GlLibrary): GlMesh => {
  const children = mesh.children.map((child) => loadMesh(gl, child, library));

  const primitives = mesh.polygons.map((polygon) =>
    loadPrimitive(gl, library, polygon)
  );

  return {
    dispose: () => {
      for (const child of children) {
        child.dispose();
      }

      for (const { index, polygon } of primitives) {
        index.dispose();
        polygon.coordinate?.buffer.dispose();
        polygon.normal?.buffer.dispose();
        polygon.position.buffer.dispose();
        polygon.tangent?.buffer.dispose();
        polygon.tint?.buffer.dispose();
      }
    },
    children,
    primitives,
    transform: mesh.transform,
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
): GlModel => {
  let ownedLibrary: GlLibrary | undefined;
  let usedLibrary: GlLibrary;

  if (config?.library !== undefined) {
    ownedLibrary = undefined;
    usedLibrary = config?.library;
  } else {
    ownedLibrary = loadLibrary(gl, model);
    usedLibrary = ownedLibrary;
  }

  const meshes = model.meshes.map((mesh) => loadMesh(gl, mesh, usedLibrary));

  return {
    dispose: () => {
      if (ownedLibrary !== undefined) {
        for (const material of ownedLibrary.materials.values()) {
          material.dispose();
        }
      }

      for (const mesh of meshes) {
        mesh.dispose();
      }
    },
    library: ownedLibrary,
    meshes,
  };
};

const loadPrimitive = (
  gl: GlContext,
  library: GlLibrary,
  source: Polygon
): GlPrimitive => {
  const { materials } = library;

  const index = createStaticIndexBuffer(gl, Uint32Array);

  index.set(
    new Uint32Array(source.indices.flatMap(Vector3.toArray)),
    source.indices.length * 3
  );

  const coordinate = optionalMap(source.coordinates, (coordinates) => {
    const buffer = createStaticArrayBuffer(gl, Float32Array);

    buffer.set(
      new Float32Array(coordinates.flatMap(Vector2.toArray)),
      coordinates.length * 2
    );

    return createAttribute(buffer, 2);
  });

  const normal = optionalMap(source.normals, (normals) => {
    const buffer = createStaticArrayBuffer(gl, Float32Array);

    buffer.set(
      new Float32Array(normals.flatMap(Vector3.toArray)),
      normals.length * 3
    );

    return createAttribute(buffer, 3);
  });

  const positionBuffer = createStaticArrayBuffer(gl, Float32Array);

  positionBuffer.set(
    new Float32Array(source.positions.flatMap(Vector3.toArray)),
    source.positions.length * 3
  );

  const position = createAttribute(positionBuffer, 3);

  const tangent = optionalMap(source.tangents, (tangents) => {
    const buffer = createStaticArrayBuffer(gl, Float32Array);

    buffer.set(
      new Float32Array(tangents.flatMap(Vector3.toArray)),
      tangents.length * 3
    );

    return createAttribute(buffer, 3);
  });

  const tint = optionalMap(source.tints, (tints) => {
    const buffer = createStaticArrayBuffer(gl, Float32Array);

    buffer.set(
      new Float32Array(tints.flatMap(Vector4.toArray)),
      tints.length * 4
    );

    return createAttribute(buffer, 4);
  });

  const material: GlMaterial | undefined =
    source.material !== undefined ? materials.get(source.material) : undefined;

  const polygon: GlPolygon = {
    dispose: () => {
      coordinate?.buffer.dispose();
      normal?.buffer.dispose();
      position.buffer.dispose();
      tangent?.buffer.dispose();
      tint?.buffer.dispose();
    },
    coordinate,
    normal,
    position,
    tangent,
    tint,
  };

  return {
    dispose: () => {
      index.dispose();
      material?.dispose();
      polygon.dispose();
    },
    index,
    material: material ?? defaultMaterial,
    polygon,
  };
};

export {
  type GlLibrary,
  type GlMaterial,
  type GlMesh,
  type GlModel,
  type GlObject,
  type GlPolygon,
  loadLibrary,
  loadModel as createModel,
};
