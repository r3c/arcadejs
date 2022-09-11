import { Matrix4 } from "../math/matrix";
import { Vector2, Vector3 } from "../math/vector";
import {
  Attribute,
  BoundingBox,
  Filter,
  Interpolation,
  Material,
  Mesh,
  Model,
  Instance,
  Polygon,
  Texture,
  TypedArray,
  Wrap,
  defaultColor,
  defaultFilter,
} from "./model/definition";
import { range } from "../language/functional";
import { load as loadFrom3ds } from "./model/loaders/3ds";
import { load as loadFromGltf } from "./model/loaders/gltf";
import { load as loadFromJson } from "./model/loaders/json";
import { load as loadFromObj } from "./model/loaders/obj";

type Config = {
  transform?: Matrix4;
};

const computeBounds = (model: Model): BoundingBox => {
  return reduceMeshPoints<BoundingBox>(
    model.meshes,
    Matrix4.createIdentity(),
    {
      xMax: Number.MIN_VALUE,
      xMin: Number.MAX_VALUE,
      yMax: Number.MIN_VALUE,
      yMin: Number.MAX_VALUE,
      zMax: Number.MIN_VALUE,
      zMin: Number.MAX_VALUE,
    },
    (previous: BoundingBox, point: Vector3) => ({
      xMax: Math.max(previous.xMax, point.x),
      xMin: Math.min(previous.xMin, point.x),
      yMax: Math.max(previous.yMax, point.y),
      yMin: Math.min(previous.yMin, point.y),
      zMax: Math.max(previous.zMax, point.z),
      zMin: Math.min(previous.zMin, point.z),
    })
  );
};

/*
 ** Based on:
 ** http://www.iquilezles.org/www/articles/normals/normals.htm
 */
const computeNormals = (indices: TypedArray, points: Attribute): Attribute => {
  const pointsBuffer = points.buffer;
  const pointsStride = points.stride;
  const normals = range(
    Math.floor(pointsBuffer.length / pointsStride),
    () => Vector3.zero
  );

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const index1 = indices[i + 0];
    const index2 = indices[i + 1];
    const index3 = indices[i + 2];
    const point1 = {
      x: pointsBuffer[index1 * pointsStride + 0],
      y: pointsBuffer[index1 * pointsStride + 1],
      z: pointsBuffer[index1 * pointsStride + 2],
    };
    const point2 = {
      x: pointsBuffer[index2 * pointsStride + 0],
      y: pointsBuffer[index2 * pointsStride + 1],
      z: pointsBuffer[index2 * pointsStride + 2],
    };
    const point3 = {
      x: pointsBuffer[index3 * pointsStride + 0],
      y: pointsBuffer[index3 * pointsStride + 1],
      z: pointsBuffer[index3 * pointsStride + 2],
    };

    const normal = Vector3.cross(
      Vector3.sub(point3, point2),
      Vector3.sub(point1, point2)
    );

    normals[index1] = Vector3.add(normals[index1], normal);
    normals[index2] = Vector3.add(normals[index2], normal);
    normals[index3] = Vector3.add(normals[index3], normal);
  }

  const normalsBuffer = new Float32Array(normals.length * 3);
  const normalsStride = 3;

  for (let i = 0; i < normals.length; ++i) {
    const normal = Vector3.normalize(normals[i]);

    normalsBuffer[i * normalsStride + 0] = normal.x;
    normalsBuffer[i * normalsStride + 1] = normal.y;
    normalsBuffer[i * normalsStride + 2] = normal.z;
  }

  return {
    buffer: normalsBuffer,
    stride: normalsStride,
  };
};

/*
 ** Based on:
 ** http://fabiensanglard.net/bumpMapping/index.php
 ** http://www.terathon.com/code/tangent.html
 */
const computeTangents = (
  indices: TypedArray,
  points: Attribute,
  coords: Attribute,
  normals: Attribute
): Attribute => {
  const coordsBuffer = coords.buffer;
  const coordsStride = coords.stride;
  const pointsBuffer = points.buffer;
  const pointsStride = points.stride;
  const tangents = range(
    Math.floor(pointsBuffer.length / pointsStride),
    () => Vector3.zero
  );

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const index1 = indices[i + 0];
    const index2 = indices[i + 1];
    const index3 = indices[i + 2];
    const coord1 = {
      x: coordsBuffer[index1 * coordsStride + 0],
      y: coordsBuffer[index1 * coordsStride + 1],
    };
    const coord2 = {
      x: coordsBuffer[index2 * coordsStride + 0],
      y: coordsBuffer[index2 * coordsStride + 1],
    };
    const coord3 = {
      x: coordsBuffer[index3 * coordsStride + 0],
      y: coordsBuffer[index3 * coordsStride + 1],
    };
    const point1 = {
      x: pointsBuffer[index1 * pointsStride + 0],
      y: pointsBuffer[index1 * pointsStride + 1],
      z: pointsBuffer[index1 * pointsStride + 2],
    };
    const point2 = {
      x: pointsBuffer[index2 * pointsStride + 0],
      y: pointsBuffer[index2 * pointsStride + 1],
      z: pointsBuffer[index2 * pointsStride + 2],
    };
    const point3 = {
      x: pointsBuffer[index3 * pointsStride + 0],
      y: pointsBuffer[index3 * pointsStride + 1],
      z: pointsBuffer[index3 * pointsStride + 2],
    };

    const c1 = Vector2.sub(coord3, coord2);
    const c2 = Vector2.sub(coord1, coord2);
    const p1 = Vector3.sub(point3, point2);
    const p2 = Vector3.sub(point1, point2);

    const coef = 1 / (c1.x * c2.y - c2.x * c1.y);

    const tangent = {
      x: coef * (p1.x * c2.y - p2.x * c1.y),
      y: coef * (p1.y * c2.y - p2.y * c1.y),
      z: coef * (p1.z * c2.y - p2.z * c1.y),
    };

    tangents[index1] = Vector3.add(tangents[index1], tangent);
    tangents[index2] = Vector3.add(tangents[index2], tangent);
    tangents[index3] = Vector3.add(tangents[index3], tangent);
  }

  const normalsBuffer = normals.buffer;
  const normalsStride = normals.stride;
  const tangentsBuffer = new Float32Array(tangents.length * 3);
  const tangentsStride = 3;

  for (let i = 0; i < tangents.length; ++i) {
    const n = {
      x: normalsBuffer[i * normalsStride + 0],
      y: normalsBuffer[i * normalsStride + 1],
      z: normalsBuffer[i * normalsStride + 2],
    };
    const t = tangents[i];

    // Gram-Schmidt orthogonalize: t' = normalize(t - n * dot(n, t));
    const tangent = Vector3.normalize(
      Vector3.sub(t, Vector3.scale(n, Vector3.dot(n, t)))
    );

    tangentsBuffer[i * tangentsStride + 0] = tangent.x;
    tangentsBuffer[i * tangentsStride + 1] = tangent.y;
    tangentsBuffer[i * tangentsStride + 2] = tangent.z;
  }

  return {
    buffer: tangentsBuffer,
    stride: tangentsStride,
  };
};

const createLoadModel = <TSource>(
  loadCallback: (source: TSource) => Promise<Model>
): ((source: TSource, configOrUndefined?: Config) => Promise<Model>) => {
  return async (source, configOrUndefined) => {
    const config = configOrUndefined || {};
    const model = await loadCallback(source);

    // Transform top-level meshes using provided transform matrix if any
    const transform = config.transform;

    if (transform !== undefined) {
      model.meshes.forEach(
        (node) =>
          (node.transform = Matrix4.createIdentity()
            .duplicate(transform)
            .multiply(node.transform))
      );
    }

    // Finalize meshes recursively
    model.meshes.forEach((mesh) => finalizeMesh(mesh, config));

    return model;
  };
};

const finalizeMesh = (mesh: Mesh, config: Config): void => {
  mesh.children.forEach((child) => finalizeMesh(child, config));
  mesh.polygons.forEach((mesh) => finalizePolygon(mesh));
};

const finalizePolygon = (polygon: Polygon): void => {
  // Transform normals or compute them from vertices
  if (polygon.normals !== undefined) {
    const buffer = polygon.normals.buffer;
    const count = polygon.normals.stride;

    for (let i = 0; i + count - 1 < buffer.length; i += count) {
      const normal = Vector3.normalize({
        x: buffer[i + 0],
        y: buffer[i + 1],
        z: buffer[i + 2],
      });

      buffer[i + 0] = normal.x;
      buffer[i + 1] = normal.y;
      buffer[i + 2] = normal.z;
    }
  } else {
    polygon.normals = computeNormals(polygon.indices, polygon.points);
  }

  // Transform tangents or compute them from vertices, normals and texture coordinates
  if (polygon.tangents !== undefined) {
    const buffer = polygon.tangents.buffer;
    const count = polygon.tangents.stride;

    for (let i = 0; i + count - 1 < buffer.length; i += count) {
      const tangent = Vector3.normalize({
        x: buffer[i + 0],
        y: buffer[i + 1],
        z: buffer[i + 2],
      });

      buffer[i + 0] = tangent.x;
      buffer[i + 1] = tangent.y;
      buffer[i + 2] = tangent.z;
    }
  } else if (polygon.coords !== undefined) {
    polygon.tangents = computeTangents(
      polygon.indices,
      polygon.points,
      polygon.coords,
      polygon.normals
    );
  }
};

const flattenModel = (model: Model): Model => {
  type Fragment = { polygon: Polygon; transform: Matrix4 };

  // Recursively collect fragments by material name from model
  const fragmentsByMaterial = new Map<Material | undefined, Fragment[]>();
  const flattenFragments = (meshes: Mesh[], parentTransform: Matrix4): void => {
    const transform = Matrix4.createIdentity();

    for (const mesh of meshes) {
      transform.duplicate(parentTransform).multiply(mesh.transform);

      for (const polygon of mesh.polygons) {
        const fragments = fragmentsByMaterial.get(polygon.material) ?? [];

        fragmentsByMaterial.set(polygon.material, fragments);
        fragments.push({ polygon, transform });
      }

      flattenFragments(mesh.children, transform);
    }
  };

  flattenFragments(model.meshes, Matrix4.createIdentity());

  // Merge polygons by material name
  const polygons: Polygon[] = [];
  const concatAttributes = (
    fragments: Fragment[],
    expectedStride: number,
    extractor: (polygon: Polygon) => Attribute | undefined,
    converter: (
      targetBuffer: TypedArray,
      targetOffset: number,
      sourceBuffer: TypedArray,
      sourceOffset: number,
      transform: Matrix4
    ) => void
  ): Attribute | undefined => {
    let concatLength = 0;

    for (const { polygon } of fragments) {
      const attribute = extractor(polygon);

      if (attribute === undefined) {
        continue;
      }

      const { buffer, stride } = attribute;

      if (stride !== expectedStride) {
        throw new Error(`incompatible stride (${stride} != ${expectedStride})`);
      }

      concatLength += buffer.length;
    }

    if (concatLength < 1) {
      return undefined;
    }

    const concatBuffer = new Float32Array(concatLength);
    let concatOffset = 0;

    for (const { polygon, transform } of fragments) {
      const attribute = extractor(polygon);

      if (attribute === undefined) {
        continue;
      }

      const { buffer, stride } = attribute;

      for (let offset = 0; offset + stride <= buffer.length; offset += stride) {
        converter(concatBuffer, concatOffset, buffer, offset, transform);

        concatOffset += stride;
      }
    }

    return { buffer: concatBuffer, stride: expectedStride };
  };

  for (const [material, fragments] of fragmentsByMaterial.entries()) {
    const concatPoints = concatAttributes(
      fragments,
      3,
      (polygon) => polygon.points,
      (targetBuffer, targetOffset, sourceBuffer, sourceOffset, transform) => {
        const point = transform.transform({
          x: sourceBuffer[sourceOffset + 0],
          y: sourceBuffer[sourceOffset + 1],
          z: sourceBuffer[sourceOffset + 2],
          w: 1,
        });

        targetBuffer[targetOffset + 0] = point.x;
        targetBuffer[targetOffset + 1] = point.y;
        targetBuffer[targetOffset + 2] = point.z;
      }
    );

    if (concatPoints === undefined) {
      throw Error("got undefined attribute when flattening model points");
    }

    // Build concatenated index buffer
    let indexLength = 0;

    for (const { polygon } of fragments) {
      indexLength += polygon.indices.length;
    }

    const concatIndexBuffer = new Uint32Array(indexLength);

    let concatIndexOffset = 0;
    let concatIndexShift = 0;

    for (const { polygon } of fragments) {
      const { indices, points } = polygon;

      for (const index of indices) {
        concatIndexBuffer[concatIndexOffset++] = index + concatIndexShift;
      }

      concatIndexShift += points.buffer.length / points.stride;
    }

    polygons.push({
      colors: concatAttributes(
        fragments,
        4,
        (polygon) => polygon.colors,
        (targetBuffer, targetOffset, sourceBuffer, sourceOffset) => {
          targetBuffer[targetOffset + 0] = sourceBuffer[sourceOffset + 0];
          targetBuffer[targetOffset + 1] = sourceBuffer[sourceOffset + 1];
          targetBuffer[targetOffset + 2] = sourceBuffer[sourceOffset + 2];
          targetBuffer[targetOffset + 3] = sourceBuffer[sourceOffset + 3];
        }
      ),
      coords: concatAttributes(
        fragments,
        2,
        (polygon) => polygon.coords,
        (targetBuffer, targetOffset, sourceBuffer, sourceOffset) => {
          targetBuffer[targetOffset + 0] = sourceBuffer[sourceOffset + 0];
          targetBuffer[targetOffset + 1] = sourceBuffer[sourceOffset + 1];
        }
      ),
      indices: concatIndexBuffer,
      material,
      normals: concatAttributes(
        fragments,
        3,
        (polygon) => polygon.normals,
        (targetBuffer, targetOffset, sourceBuffer, sourceOffset) => {
          // FIXME: missing multiplication by normalMatrix
          targetBuffer[targetOffset + 0] = sourceBuffer[sourceOffset + 0];
          targetBuffer[targetOffset + 1] = sourceBuffer[sourceOffset + 1];
          targetBuffer[targetOffset + 2] = sourceBuffer[sourceOffset + 2];
        }
      ),
      points: concatPoints,
      tangents: concatAttributes(
        fragments,
        3,
        (polygon) => polygon.tangents,
        (targetBuffer, targetOffset, sourceBuffer, sourceOffset) => {
          // FIXME: missing multiplication by normalMatrix
          targetBuffer[targetOffset + 0] = sourceBuffer[sourceOffset + 0];
          targetBuffer[targetOffset + 1] = sourceBuffer[sourceOffset + 1];
          targetBuffer[targetOffset + 2] = sourceBuffer[sourceOffset + 2];
        }
      ),
    });
  }

  // Create and return flattened model
  return {
    meshes: [{ children: [], polygons, transform: Matrix4.createIdentity() }],
  };
};

const loadModelFrom3ds = createLoadModel(loadFrom3ds);
const loadModelFromGltf = createLoadModel(loadFromGltf);
const loadModelFromJson = createLoadModel(loadFromJson);
const loadModelFromObj = createLoadModel(loadFromObj);

const mergeModels = (instances: Instance[]): Model => {
  return {
    meshes: instances.map(({ model, transform }) => ({
      children: model.meshes,
      polygons: [],
      transform,
    })),
  };
};

const reduceMeshes = <TState>(
  meshes: Mesh[],
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, geometry: Polygon, transform: Matrix4) => TState
): TState => {
  for (const mesh of meshes) {
    const transform = Matrix4.createIdentity()
      .duplicate(parent)
      .multiply(mesh.transform);

    for (const polygon of mesh.polygons) {
      state = reduce(state, polygon, transform);
    }

    state = reduceMeshes(mesh.children, transform, state, reduce);
  }

  return state;
};

const reduceMeshPoints = <TState>(
  meshes: Mesh[],
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, point: Vector3) => TState
): TState => {
  return reduceMeshes(
    meshes,
    parent,
    state,
    (previous: TState, polygon: Polygon, transform: Matrix4) => {
      const points = polygon.points;
      const buffer = points.buffer;
      const count = points.stride;

      for (let i = 0; i + count - 1 < buffer.length; i += count) {
        state = reduce(
          previous,
          transform.transform({
            x: buffer[i + 0],
            y: buffer[i + 1],
            z: buffer[i + 2],
            w: 1,
          })
        );
      }

      return state;
    }
  );
};

export {
  type Attribute,
  type Filter,
  type Material,
  type Mesh,
  type Model,
  type Polygon,
  type Texture,
  type TypedArray,
  Interpolation,
  Wrap,
  computeBounds,
  defaultColor,
  defaultFilter,
  flattenModel,
  loadModelFrom3ds,
  loadModelFromGltf,
  loadModelFromJson,
  loadModelFromObj,
  mergeModels,
};
