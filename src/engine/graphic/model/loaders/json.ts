import * as image from "../../image";
import { Matrix4 } from "../../../math/matrix";
import {
  Interpolation,
  Material,
  Model,
  Polygon,
  Texture,
  Wrap,
} from "../definition";
import * as path from "../../../fs/path";
import * as stream from "../../../io/stream";
import { Vector2, Vector3, Vector4 } from "../../../math/vector";

interface JsonConfiguration {
  variables?: Record<string, string>;
}

interface JsonState {
  directory: string;
  materials: Map<string, Material>;
  variables: Record<string, string>;
}

const load = async (
  urlOrData: any,
  configuration: JsonConfiguration | undefined
): Promise<Model> => {
  let directory: string;
  let root: any;

  if (typeof urlOrData === "string") {
    const url = <string>urlOrData;

    directory = path.directory(url);
    root = await stream.readURL(stream.JSONFormat, url);
  } else if (typeof urlOrData === "object") {
    directory = "";
    root = urlOrData;
  } else {
    throw invalid(urlOrData, root, "model");
  }

  const state: JsonState = {
    directory,
    materials: new Map<string, Material>(),
    variables: configuration?.variables ?? {},
  };

  if (root.materials !== undefined) {
    const materials = await toMapOf(
      "materials",
      root.materials,
      toMaterial,
      state
    );

    for (const [name, material] of materials.entries()) {
      state.materials.set(name, material);
    }
  }

  return {
    meshes: [
      {
        children: [],
        polygons: toArrayOf("polygons", root.polygons, toPolygon, state),
        transform: Matrix4.createIdentity(),
      },
    ],
  };
};

const invalid = (name: string, instance: unknown, expected: string) => {
  return new Error(
    `value "${instance}" of property "${name}" is not a valid ${expected}`
  );
};

const toArrayOf = <TValue>(
  name: string,
  instance: unknown,
  converter: (name: string, item: unknown, state: JsonState) => TValue,
  state: JsonState
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

const toAttribute = <TValue>(
  values: TValue[],
  converter: (value: TValue) => number[],
  stride: number
) => ({
  buffer: new Float32Array(values.map(converter).flatMap((items) => items)),
  stride: stride,
});

const toCoord = (name: string, instance: unknown): Vector2 => {
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

const toMapOf = async <TValue>(
  name: string,
  instance: unknown,
  converter: (name: string, item: unknown, state: JsonState) => Promise<TValue>,
  state: JsonState
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
  state: JsonState
): Promise<Material> => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "material");
  }

  const material = instance as any;

  return {
    albedoFactor: toOptional(
      `${name}.albedoFactor`,
      material.albedoFactor,
      toColor
    ),
    albedoMap: await toTexture(`${name}.albedoMap`, material.albedoMap, state),
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
    glossFactor: toOptional(
      `${name}.glossFactor`,
      material.glossFactor,
      toColor
    ),
    glossMap: await toTexture(`${name}.glossMap`, material.glossMap, state),
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
  };
};

const toOptional = <TValue>(
  name: string,
  instance: unknown,
  converter: (name: string, source: unknown) => TValue
): TValue | undefined => {
  return instance !== undefined ? converter(name, instance) : undefined;
};

const toPath = (name: string, instance: unknown, state: JsonState): string => {
  if (typeof instance !== "string") {
    throw invalid(name, instance, "path");
  }

  const tail = Object.entries(state.variables).reduce(
    (tail, [name, value]) => tail.replaceAll(`{${name}}`, value),
    instance
  );

  return path.combine(state.directory, tail);
};

const toPolygon = (
  name: string,
  instance: unknown,
  state: JsonState
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
    colors:
      polygon.colors !== undefined
        ? toAttribute(
            toArrayOf(`${name}.colors`, polygon.colors, toColor, state),
            Vector4.toArray,
            4
          )
        : undefined,
    coords:
      polygon.coords !== undefined
        ? toAttribute(
            toArrayOf(`${name}.coords`, polygon.coords, toCoord, state),
            Vector2.toArray,
            2
          )
        : undefined,
    indices: new Uint32Array(
      toArrayOf(
        `${name}.faces`,
        polygon.faces,
        (name, item) => toTuple3(name, item, toInteger),
        state
      ).flatMap((items) => items)
    ),
    material:
      materialName !== undefined
        ? state.materials.get(materialName)
        : undefined,
    normals:
      polygon.normals !== undefined
        ? toAttribute(
            toArrayOf(`${name}.normals`, polygon.normals, toVertex, state),
            Vector3.toArray,
            3
          )
        : undefined,
    points: toAttribute(
      toArrayOf(`${name}.points`, polygon.points, toVertex, state),
      Vector3.toArray,
      3
    ),
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
  state: JsonState
): Promise<Texture | undefined> =>
  typeof instance === "string"
    ? {
        filter: {
          magnifier: Interpolation.Linear,
          minifier: Interpolation.Linear,
          mipmap: true,
          wrap: Wrap.Repeat,
        },
        image: await image.loadFromURL(toPath(name, instance, state)),
      }
    : undefined;

const toTuple3 = <TValue>(
  name: string,
  instance: unknown,
  converter: (name: string, item: unknown) => TValue
): [TValue, TValue, TValue] => {
  if (instance === null || typeof instance !== "object") {
    throw invalid(name, instance, "3-tuple");
  }

  const tuple3 = instance as any;

  return [
    converter(`${name}[0]`, tuple3[0]),
    converter(`${name}[1]`, tuple3[1]),
    converter(`${name}[2]`, tuple3[2]),
  ];
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
