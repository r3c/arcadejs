import { loadFromURL } from "../../image";
import { Matrix4 } from "../../../math/matrix";
import {
  Interpolation,
  Library,
  Material,
  Mesh,
  Polygon,
  Texture,
  Wrap,
} from "../definition";
import { combinePath, getPathDirectory } from "../../../fs/path";
import { JSONFormat, readURL } from "../../../io/stream";
import { Vector2, Vector3, Vector4 } from "../../../math/vector";

type JsonConfiguration = {
  variables: Record<string, string>;
};

type JsonMaterialState = {
  directory: string;
  textures: Map<string, Promise<Texture>>;
  variables: Record<string, string>;
};

type JsonPolygonState = {
  materials: Map<string, Material>;
};

const load = async (
  urlOrData: any,
  library: Library,
  configuration: Partial<JsonConfiguration> | undefined
): Promise<Mesh> => {
  let directory: string;
  let root: any;

  if (typeof urlOrData === "string") {
    directory = getPathDirectory(urlOrData);
    root = await readURL(JSONFormat, urlOrData);
  } else if (typeof urlOrData === "object") {
    directory = "";
    root = urlOrData;
  } else {
    throw invalid(urlOrData, root, "model");
  }

  if (typeof root !== "object") {
    throw invalid(urlOrData, root, "object");
  }

  const materials =
    root.materials !== undefined
      ? await toMapOf("materials", root.materials, toMaterial, {
          directory,
          textures: library.textures,
          variables: configuration?.variables ?? {},
        })
      : new Map<string, Material>();

  return {
    children: [],
    polygons: toArrayOf("polygons", root.polygons, toPolygon, {
      materials,
    }),
    transform: Matrix4.identity,
  };
};

const invalid = (name: string, instance: unknown, expected: string) => {
  return new Error(
    `value "${instance}" of property "${name}" is not a valid ${expected}`
  );
};

const toArrayOf = <TValue, TState>(
  name: string,
  instance: unknown,
  converter: (name: string, item: unknown, state: TState) => TValue,
  state: TState
) => {
  if (!(instance instanceof Array)) {
    throw invalid(name, instance, "array");
  }

  return instance.map((v, i) => converter(name + "[" + i + "]", v, state));
};

const toColor = (name: string, instance: unknown): Vector4 => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "rgb(a) color");
  }

  const color = instance as any;

  return {
    x: Math.max(Math.min(toDecimal(`${name}.r`, color.r), 1), 0),
    y: Math.max(Math.min(toDecimal(`${name}.g`, color.g), 1), 0),
    z: Math.max(Math.min(toDecimal(`${name}.b`, color.b), 1), 0),
    w:
      color.a !== undefined
        ? Math.max(Math.min(toDecimal(`${name}.a`, color.a), 1), 0)
        : 1,
  };
};

const toCoordinate = (name: string, instance: unknown): Vector2 => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "texture coordinate");
  }

  const coord = instance as any;

  return {
    x: toDecimal(`${name}.u`, coord.u),
    y: toDecimal(`${name}.v`, coord.v),
  };
};

const toDecimal = (name: string, instance: unknown) => {
  if (typeof instance !== "number") {
    throw invalid(name, instance, "decimal number");
  }

  return <number>instance;
};

const toInteger = (name: string, instance: unknown): number => {
  if (typeof instance !== "number" || ~~instance !== instance) {
    throw invalid(name, instance, "integer number");
  }

  return instance;
};

const toMapOf = async <TValue, TState>(
  name: string,
  instance: unknown,
  converter: (name: string, item: unknown, state: TState) => Promise<TValue>,
  state: TState
): Promise<Map<string, TValue>> => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "map");
  }

  const map = new Map<string, TValue>();

  for (const [key, value] of Object.entries(instance)) {
    map.set(key, await converter(`${name}.${key}`, value, state));
  }

  return map;
};

const toMaterial = async (
  name: string,
  instance: unknown,
  state: JsonMaterialState
): Promise<Material> => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "material");
  }

  const material = instance as any;

  return {
    diffuseColor: toOptional(
      `${name}.diffuseColor`,
      material.diffuseColor,
      toColor
    ),
    diffuseMap: await toTexture(
      `${name}.diffuseMap`,
      material.diffuseMap,
      state
    ),
    emissiveFactor: toOptional(
      `${name}.emissiveFactor`,
      material.emissiveFactor,
      toColor
    ),
    emissiveMap: await toTexture(
      `${name}.emissiveMap`,
      material.emissiveMap,
      state
    ),
    heightMap: await toTexture(`${name}.heightMap`, material.heightMap, state),
    heightParallaxBias: toOptional(
      `${name}.heightParallaxBias`,
      material.heightParallaxBias,
      toDecimal
    ),
    heightParallaxScale: toOptional(
      `${name}.heightParallaxScale`,
      material.heightParallaxScale,
      toDecimal
    ),
    metalnessMap: await toTexture(
      `${name}.metalnessMap`,
      material.metalnessMap,
      state
    ),
    metalnessStrength: toOptional(
      `${name}.metalnessStrength`,
      material.metalnessStrength,
      toDecimal
    ),
    normalMap: await toTexture(`${name}.normalMap`, material.normalMap, state),
    occlusionMap: await toTexture(
      `${name}.occlusionMap`,
      material.occlusionMap,
      state
    ),
    occlusionStrength: toOptional(
      `${name}.occlusionStrength`,
      material.occlusionStrength,
      toDecimal
    ),
    roughnessMap: await toTexture(
      `${name}.roughnessMap`,
      material.roughnessMap,
      state
    ),
    roughnessStrength: toOptional(
      `${name}.roughnessStrength`,
      material.roughnessStrength,
      toDecimal
    ),
    shininess: toOptional(`${name}.shininess`, material.shininess, toInteger),
    specularColor: toOptional(
      `${name}.specularColor`,
      material.specularColor,
      toColor
    ),
    specularMap: await toTexture(
      `${name}.specularMap`,
      material.specularMap,
      state
    ),
  };
};

const toOptional = <TValue>(
  name: string,
  instance: unknown,
  converter: (name: string, source: unknown) => TValue
): TValue | undefined => {
  return instance !== undefined ? converter(name, instance) : undefined;
};

const toPath = (
  name: string,
  instance: unknown,
  state: JsonMaterialState
): string => {
  if (typeof instance !== "string") {
    throw invalid(name, instance, "path");
  }

  const tail = Object.entries(state.variables).reduce(
    (tail, [name, value]) => tail.replaceAll(`{{${name}}}`, value),
    instance
  );

  return combinePath(state.directory, tail);
};

const toPolygon = (
  name: string,
  instance: unknown,
  state: JsonPolygonState
): Polygon => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "polygon");
  }

  const polygon = instance as any;
  const materialName =
    polygon.materialName !== undefined
      ? toString(`${name}.materialName`, polygon.materialName)
      : undefined;

  return {
    coordinates:
      polygon.coordinates !== undefined
        ? toArrayOf(
            `${name}.coordinates`,
            polygon.coordinates,
            toCoordinate,
            state
          )
        : undefined,
    indices: toArrayOf(`${name}.indices`, polygon.indices, toVertex, state),
    material:
      materialName !== undefined
        ? state.materials.get(materialName)
        : undefined,
    normals:
      polygon.normals !== undefined
        ? toArrayOf(`${name}.normals`, polygon.normals, toVertex, state)
        : undefined,
    positions: toArrayOf(
      `${name}.positions`,
      polygon.positions,
      toVertex,
      state
    ),
    tints:
      polygon.tints !== undefined
        ? toArrayOf(`${name}.tints`, polygon.tints, toColor, state)
        : undefined,
  };
};

const toString = (name: string, instance: unknown): string => {
  if (typeof instance !== "string") {
    throw invalid(name, instance, "string");
  }

  return instance;
};

const toTexture = async (
  name: string,
  instance: unknown,
  state: JsonMaterialState
): Promise<Texture | undefined> => {
  if (typeof instance !== "string") {
    return undefined;
  }

  const path = toPath(name, instance, state);

  let texture = state.textures.get(path);

  if (texture === undefined) {
    texture = new Promise<Texture>(async (resolve) => {
      const image = await loadFromURL(path);

      resolve({
        filter: {
          magnifier: Interpolation.Linear,
          minifier: Interpolation.Linear,
          mipmap: true,
          wrap: Wrap.Repeat,
        },
        image,
      });
    });

    state.textures.set(path, texture);
  }

  return texture;
};

const toVertex = (name: string, instance: unknown): Vector3 => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "vertex");
  }

  const vertex = instance as any;

  return {
    x: toDecimal(`${name}.x`, vertex.x),
    y: toDecimal(`${name}.y`, vertex.y),
    z: toDecimal(`${name}.z`, vertex.z),
  };
};

export { load };
