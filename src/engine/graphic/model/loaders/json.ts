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

const load = async (urlOrData: any): Promise<Model> => {
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

  return {
    materials:
      root.materials !== undefined
        ? await toMapOf("materials", root.materials, toMaterial, directory)
        : new Map(),
    meshes: [
      {
        children: [],
        polygons: toArrayOf("polygons", root.polygons, toPolygon),
        transform: Matrix4.createIdentity(),
      },
    ],
  };
};

const invalid = (name: string, instance: any, expected: string) => {
  return new Error(
    `value "${instance}" of property "${name}" is not a valid ${expected}`
  );
};

const toArrayOf = <TValue>(
  name: string,
  instance: any,
  converter: (name: string, item: any) => TValue
) => {
  if (!(instance instanceof Array)) {
    throw invalid(name, instance, "array");
  }

  return (instance as Array<unknown>).map((v, i) =>
    converter(name + "[" + i + "]", v)
  );
};

const toColor = (name: string, instance: any): Vector4 => {
  if (typeof instance !== "object") {
    throw invalid(name, instance, "rgb(a) color");
  }

  return {
    x: Math.max(Math.min(toDecimal(`${name}.r`, instance.r), 1), 0),
    y: Math.max(Math.min(toDecimal(`${name}.g`, instance.g), 1), 0),
    z: Math.max(Math.min(toDecimal(`${name}.b`, instance.b), 1), 0),
    w:
      instance.a !== undefined
        ? Math.max(Math.min(toDecimal(`${name}.a`, instance.a), 1), 0)
        : 1,
  };
};

const toCoord = (name: string, instance: any): Vector2 => {
  if (typeof instance !== "object") {
    throw invalid(name, instance, "texture coordinate");
  }

  return {
    x: toDecimal(`${name}.u`, instance.u),
    y: toDecimal(`${name}.v`, instance.v),
  };
};

const toDecimal = (name: string, instance: any) => {
  if (typeof instance !== "number") {
    throw invalid(name, instance, "decimal number");
  }

  return <number>instance;
};

const toPolygon = (name: string, instance: any): Polygon => {
  const toAttribute = <TValue>(
    values: TValue[],
    converter: (value: TValue) => number[],
    stride: number
  ) => ({
    buffer: new Float32Array(values.map(converter).flatMap((items) => items)),
    stride: stride,
  });

  if (typeof instance !== "object") {
    throw invalid(name, instance, "polygon");
  }

  return {
    colors:
      instance.colors !== undefined
        ? toAttribute(
            toArrayOf(`${name}.colors`, instance.colors, toColor),
            Vector4.toArray,
            4
          )
        : undefined,
    coords:
      instance.coords !== undefined
        ? toAttribute(
            toArrayOf(`${name}.coords`, instance.coords, toCoord),
            Vector2.toArray,
            2
          )
        : undefined,
    indices: new Uint32Array(
      toArrayOf(`${name}.faces`, instance.faces, (name, item) =>
        toTuple3(name, item, toInteger)
      ).flatMap((items) => items)
    ),
    materialName:
      instance.materialName !== undefined
        ? toString(`${name}.materialName`, instance.materialName)
        : undefined,
    normals:
      instance.normals !== undefined
        ? toAttribute(
            toArrayOf(`${name}.normals`, instance.normals, toVertex),
            Vector3.toArray,
            3
          )
        : undefined,
    points: toAttribute(
      toArrayOf(`${name}.points`, instance.points, toVertex),
      Vector3.toArray,
      3
    ),
  };
};

const toTexture = async (
  name: string,
  instance: any,
  directory: string
): Promise<Texture | undefined> =>
  instance !== undefined
    ? {
        filter: {
          magnifier: Interpolation.Linear,
          minifier: Interpolation.Linear,
          mipmap: true,
          wrap: Wrap.Repeat,
        },
        image: await image.loadFromURL(
          toString(name, path.combine(directory, instance))
        ),
      }
    : undefined;

const toInteger = (name: string, instance: any): number => {
  if (typeof instance !== "number" || ~~instance !== instance) {
    throw invalid(name, instance, "integer number");
  }

  return instance;
};

const toMapOf = async <TValue>(
  name: string,
  instance: any,
  converter: (name: string, item: any, directory: string) => Promise<TValue>,
  directory: string
): Promise<Map<string, TValue>> => {
  if (typeof instance !== "object") {
    throw invalid(name, instance, "map");
  }

  const map = new Map<string, TValue>();

  for (const key in instance) {
    map.set(key, await converter(`${name}.${key}`, instance[key], directory));
  }

  return map;
};

const toMaterial = async (
  name: string,
  instance: any,
  directory: string
): Promise<Material> => {
  if (typeof instance !== "object") {
    throw invalid(name, instance, "material");
  }

  return {
    albedoFactor: toOptional(
      `${name}.albedoFactor`,
      instance.albedoFactor,
      toColor
    ),
    albedoMap: await toTexture(
      `${name}.albedoMap`,
      instance.albedoMap,
      directory
    ),
    emissiveFactor: toOptional(
      `${name}.emissiveFactor`,
      instance.emissiveFactor,
      toColor
    ),
    emissiveMap: await toTexture(
      `${name}.emissiveMap`,
      instance.emissiveMap,
      directory
    ),
    glossFactor: toOptional(
      `${name}.glossFactor`,
      instance.glossFactor,
      toColor
    ),
    glossMap: await toTexture(`${name}.glossMap`, instance.glossMap, directory),
    heightMap: await toTexture(
      `${name}.heightMap`,
      instance.heightMap,
      directory
    ),
    heightParallaxBias: toOptional(
      `${name}.heightParallaxBias`,
      instance.heightParallaxBias,
      toDecimal
    ),
    heightParallaxScale: toOptional(
      `${name}.heightParallaxScale`,
      instance.heightParallaxScale,
      toDecimal
    ),
    metalnessMap: await toTexture(
      `${name}.metalnessMap`,
      instance.metalnessMap,
      directory
    ),
    metalnessStrength: toOptional(
      `${name}.metalnessStrength`,
      instance.metalnessStrength,
      toDecimal
    ),
    normalMap: await toTexture(
      `${name}.normalMap`,
      instance.normalMap,
      directory
    ),
    occlusionMap: await toTexture(
      `${name}.occlusionMap`,
      instance.occlusionMap,
      directory
    ),
    occlusionStrength: toOptional(
      `${name}.occlusionStrength`,
      instance.occlusionStrength,
      toDecimal
    ),
    roughnessMap: await toTexture(
      `${name}.roughnessMap`,
      instance.roughnessMap,
      directory
    ),
    roughnessStrength: toOptional(
      `${name}.roughnessStrength`,
      instance.roughnessStrength,
      toDecimal
    ),
    shininess: toOptional(`${name}.shininess`, instance.shininess, toInteger),
  };
};

const toOptional = <TValue>(
  name: string,
  instance: any,
  converter: (name: string, source: any) => TValue
): TValue | undefined => {
  return instance !== undefined ? converter(name, instance) : undefined;
};

const toString = (name: string, instance: any): string => {
  if (typeof instance !== "string") {
    throw invalid(name, instance, "string");
  }

  return instance;
};

const toTuple3 = <TValue>(
  name: string,
  instance: any,
  converter: (name: string, item: any) => TValue
): [TValue, TValue, TValue] => {
  if (typeof instance !== "object") {
    throw invalid(name, instance, "3-tuple");
  }

  return [
    converter(`${name}[0]`, instance[0]),
    converter(`${name}[1]`, instance[1]),
    converter(`${name}[2]`, instance[2]),
  ];
};

const toVertex = (name: string, instance: any): Vector3 => {
  if (typeof instance !== "object") {
    throw invalid(name, instance, "vertex");
  }

  return {
    x: toDecimal(`${name}.x`, instance.x),
    y: toDecimal(`${name}.y`, instance.y),
    z: toDecimal(`${name}.z`, instance.z),
  };
};

export { load };
