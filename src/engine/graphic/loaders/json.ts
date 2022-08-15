import * as image from "../image";
import * as matrix from "../../math/matrix";
import * as model from "../model";
import * as path from "../../fs/path";
import * as stream from "../../io/stream";
import * as vector from "../../math/vector";

const load = async (urlOrData: any) => {
  let directory: string;
  let root: any;

  if (typeof urlOrData === "string") {
    const url = <string>urlOrData;

    directory = path.directory(url);
    root = await stream.readURL(stream.JSONFormat, url);
  } else if (typeof urlOrData === "object") {
    directory = "";
    root = urlOrData;
  } else throw invalid(urlOrData, root, "model");

  return {
    materials:
      root.materials !== undefined
        ? await toMapOf("materials", root.materials, toMaterial, directory)
        : {},
    nodes: [
      {
        children: [],
        geometries: toArrayOf("geometries", root.geometries, toGeometry),
        transform: matrix.Matrix4.createIdentity(),
      },
    ],
  };
};

const invalid = (name: string, instance: any, expected: string) => {
  return new Error(
    `value "${instance}" of property "${name}" is not a valid ${expected}`
  );
};

const toArrayOf = <T>(
  name: string,
  instance: any,
  converter: (name: string, item: any) => T
) => {
  if (!(instance instanceof Array)) throw invalid(name, instance, "array");

  return (<any[]>instance).map((v, i) => converter(name + "[" + i + "]", v));
};

const toColor = (name: string, instance: any): vector.Vector4 => {
  if (typeof instance !== "object")
    throw invalid(name, instance, "rgb(a) color");

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

const toCoord = (name: string, instance: any): vector.Vector2 => {
  if (typeof instance !== "object")
    throw invalid(name, instance, "texture coordinate");

  return {
    x: toDecimal(`${name}.u`, instance.u),
    y: toDecimal(`${name}.v`, instance.v),
  };
};

const toDecimal = (name: string, instance: any) => {
  if (typeof instance !== "number")
    throw invalid(name, instance, "decimal number");

  return <number>instance;
};

const toGeometry = (name: string, instance: any): model.Geometry => {
  const toAttribute = <T>(
    values: T[],
    converter: (value: T) => number[],
    stride: number
  ) => ({
    buffer: new Float32Array(values.map(converter).flatMap((items) => items)),
    stride: stride,
  });

  if (typeof instance !== "object") throw invalid(name, instance, "geometry");

  return {
    colors:
      instance.colors !== undefined
        ? toAttribute(
            toArrayOf(`${name}.colors`, instance.colors, toColor),
            vector.Vector4.toArray,
            4
          )
        : undefined,
    coords:
      instance.coords !== undefined
        ? toAttribute(
            toArrayOf(`${name}.coords`, instance.coords, toCoord),
            vector.Vector2.toArray,
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
            vector.Vector3.toArray,
            3
          )
        : undefined,
    points: toAttribute(
      toArrayOf(`${name}.points`, instance.points, toVertex),
      vector.Vector3.toArray,
      3
    ),
  };
};

const toTexture = async (name: string, instance: any, directory: string) =>
  instance !== undefined
    ? {
        filter: {
          magnifier: model.Interpolation.Linear,
          minifier: model.Interpolation.Linear,
          mipmap: true,
          wrap: model.Wrap.Repeat,
        },
        image: await image.loadFromURL(
          toString(name, path.combine(directory, instance))
        ),
      }
    : undefined;

const toInteger = (name: string, instance: any) => {
  if (typeof instance !== "number" || ~~instance !== instance)
    throw invalid(name, instance, "integer number");

  return <number>instance;
};

const toMapOf = async <T>(
  name: string,
  instance: any,
  converter: (name: string, item: any, directory: string) => Promise<T>,
  directory: string
) => {
  if (typeof instance !== "object") throw invalid(name, instance, "map");

  const map: { [key: string]: T } = {};

  for (const key in instance)
    map[key] = await converter(`${name}.${key}`, instance[key], directory);

  return map;
};

const toMaterial = async (
  name: string,
  instance: any,
  directory: string
): Promise<model.Material> => {
  if (typeof instance !== "object") throw invalid(name, instance, "material");

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

const toOptional = <T>(
  name: string,
  instance: any,
  converter: (name: string, source: any) => T
) => {
  if (instance !== undefined) return converter(name, instance);

  return undefined;
};

const toString = (name: string, instance: any): string => {
  if (typeof instance !== "string") throw invalid(name, instance, "string");

  return <string>instance;
};

const toTuple3 = <T>(
  name: string,
  instance: any,
  converter: (name: string, item: any) => T
): [T, T, T] => {
  if (typeof instance !== "object") throw invalid(name, instance, "3-tuple");

  return [
    converter(`${name}[0]`, instance[0]),
    converter(`${name}[1]`, instance[1]),
    converter(`${name}[2]`, instance[2]),
  ];
};

const toVertex = (name: string, instance: any): vector.Vector3 => {
  if (typeof instance !== "object") throw invalid(name, instance, "vertex");

  return {
    x: toDecimal(`${name}.x`, instance.x),
    y: toDecimal(`${name}.y`, instance.y),
    z: toDecimal(`${name}.z`, instance.z),
  };
};

export { load };
