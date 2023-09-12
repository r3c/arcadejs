import { Matrix4 } from "../math/matrix";
import { Vector2, Vector3 } from "../math/vector";
import {
  BoundingBox,
  Filter,
  Instance,
  Interpolation,
  Library,
  Material,
  Mesh,
  Model,
  Polygon,
  Texture,
  Wrap,
  defaultColor,
  defaultFilter,
} from "./model/definition";
import { range } from "../language/iterable";
import { load as loadFrom3ds } from "./model/loaders/3ds";
import { load as loadFromGltf } from "./model/loaders/gltf";
import { load as loadFromJson } from "./model/loaders/json";
import { load as loadFromObj } from "./model/loaders/obj";

type Configuration<TFormat> = {
  format?: TFormat;
  library?: Library;
  transform?: Matrix4;
};

const changeModelCenter = (model: Model): Model => {
  const center = computeCenter(model);

  reduceMeshes(model.meshes, Matrix4.identity, false, (_, polygon) => {
    polygon.positions = polygon.positions.map((position) =>
      Vector3.fromCustom(["set", position], ["sub", center])
    );

    return false;
  });

  return { meshes: model.meshes };
};

/**
 * Compute bouding box around given model.
 */
const computeBoundingBox = (model: Model): BoundingBox => {
  return reduceMeshPositions<BoundingBox>(
    model.meshes,
    Matrix4.identity,
    {
      xMax: Number.MIN_VALUE,
      xMin: Number.MAX_VALUE,
      yMax: Number.MIN_VALUE,
      yMin: Number.MAX_VALUE,
      zMax: Number.MIN_VALUE,
      zMin: Number.MAX_VALUE,
    },
    (previous, position) => ({
      xMax: Math.max(previous.xMax, position.x),
      xMin: Math.min(previous.xMin, position.x),
      yMax: Math.max(previous.yMax, position.y),
      yMin: Math.min(previous.yMin, position.y),
      zMax: Math.max(previous.zMax, position.z),
      zMin: Math.min(previous.zMin, position.z),
    })
  );
};

/**
 * Compute center position from a model.
 */
const computeCenter = (model: Model): Vector3 => {
  const { count, sum } = reduceMeshPositions(
    model.meshes,
    Matrix4.identity,
    { count: 0, sum: Vector3.fromZero() },
    ({ count, sum }, position) => {
      sum.add(position);

      return { count: count + 1, sum };
    }
  );

  sum.scale(1 / count);

  return sum;
};

/**
 ** Based on:
 ** http://www.iquilezles.org/www/articles/normals/normals.htm
 */
const computeNormals = (indices: Vector3[], points: Vector3[]): Vector3[] => {
  const normals = range(points.length).map(Vector3.fromZero);

  for (const { x, y, z } of indices) {
    const u = Vector3.fromObject(points[y]);
    const v = Vector3.fromObject(points[z]);

    u.sub(points[x]);
    v.sub(points[x]);
    u.cross(v);

    normals[x].add(u);
    normals[y].add(u);
    normals[z].add(u);
  }

  for (const normal of normals) {
    normal.normalize();
  }

  return normals;
};

/**
 ** Based on:
 ** http://fabiensanglard.net/bumpMapping/index.php
 ** http://www.terathon.com/code/tangent.html
 */
const computeTangents = (
  indices: Vector3[],
  points: Vector3[],
  coords: Vector2[],
  normals: Vector3[]
): Vector3[] => {
  const tangents = range(points.length).map(Vector3.fromZero);

  for (const { x, y, z } of indices) {
    const coord2 = Vector2.fromObject(coords[y]);
    const coord3 = Vector2.fromObject(coords[z]);
    const point2 = Vector3.fromObject(points[y]);
    const point3 = Vector3.fromObject(points[z]);

    coord2.sub(coords[x]);
    coord2.normalize();
    coord3.sub(coords[x]);
    coord3.normalize();
    point2.sub(points[x]);
    point2.normalize();
    point3.sub(points[x]);
    point3.normalize();

    const tangent = {
      x: coord3.y * point2.x - coord2.y * point3.x,
      y: coord3.y * point2.y - coord2.y * point3.y,
      z: coord3.y * point2.z - coord2.y * point3.z,
    };

    tangents[x].add(tangent);
    tangents[y].add(tangent);
    tangents[z].add(tangent);
  }

  for (let i = 0; i < tangents.length; ++i) {
    const n = Vector3.fromObject(normals[i]);
    const t = tangents[i];

    // Gram-Schmidt orthogonalize: t' = normalize(t - n * dot(n, t));
    n.scale(n.dot(t));
    t.sub(n);
    t.normalize();
  }

  return tangents;
};

const createLoadModel = <TSource, TLoad>(
  loadCallback: (
    source: TSource,
    library: Library,
    loadConfiguration: TLoad | undefined
  ) => Promise<Model>
): ((
  source: TSource,
  configuration?: Configuration<TLoad>
) => Promise<Model>) => {
  return async (source, configurationOrUndefined) => {
    // Load model using underlying loading callback
    const configuration = configurationOrUndefined ?? {};
    const library = configuration.library ?? { textures: new Map() };
    const model = await loadCallback(source, library, configuration.format);

    // Transform top-level meshes using provided transform matrix if any
    const transform = configuration.transform;

    if (transform !== undefined) {
      model.meshes.forEach((node) => {
        const matrix = Matrix4.fromObject(transform);

        matrix.multiply(node.transform);

        node.transform = matrix;
      });
    }

    // Finalize meshes recursively
    model.meshes.forEach((mesh) => finalizeMesh(mesh, configuration));

    return model;
  };
};

const finalizeMesh = (mesh: Mesh, config: Configuration<unknown>): void => {
  mesh.children.forEach((child) => finalizeMesh(child, config));
  mesh.polygons.forEach((mesh) => finalizePolygon(mesh));
};

const finalizePolygon = (polygon: Polygon): void => {
  // Transform normals or compute them from vertices
  if (polygon.normals !== undefined) {
    for (let i = 0; i < polygon.normals.length; ++i) {
      const normal = Vector3.fromObject(polygon.normals[i]);

      normal.normalize();

      polygon.normals[i] = normal;
    }
  } else {
    polygon.normals = computeNormals(polygon.indices, polygon.positions);
  }

  // Transform tangents or compute them from vertices, normals and texture coordinates
  if (polygon.tangents !== undefined) {
    for (let i = 0; i < polygon.tangents.length; ++i) {
      const tangent = Vector3.fromObject(polygon.tangents[i]);

      tangent.normalize();

      polygon.tangents[i] = tangent;
    }
  } else if (polygon.coordinates !== undefined) {
    polygon.tangents = computeTangents(
      polygon.indices,
      polygon.positions,
      polygon.coordinates,
      polygon.normals
    );
  }
};

const flattenModel = (model: Model): Model => {
  type Fragment = { polygon: Polygon; transform: Matrix4 };

  // Recursively collect fragments by material name from model
  const fragmentsByMaterial = new Map<Material | undefined, Fragment[]>();
  const flattenFragments = (meshes: Mesh[], parentTransform: Matrix4): void => {
    const transform = Matrix4.fromIdentity();

    for (const mesh of meshes) {
      transform.set(parentTransform);
      transform.multiply(mesh.transform);

      for (const polygon of mesh.polygons) {
        const fragments = fragmentsByMaterial.get(polygon.material) ?? [];

        fragmentsByMaterial.set(polygon.material, fragments);
        fragments.push({ polygon, transform });
      }

      flattenFragments(mesh.children, transform);
    }
  };

  flattenFragments(model.meshes, Matrix4.identity);

  // Merge polygons by material name
  const polygons: Polygon[] = [];
  const concatFragments = <T>(
    fragments: Fragment[],
    extractor: (polygon: Polygon) => T[] | undefined,
    converter: (value: T, matrix: Matrix4) => T
  ): T[] | undefined => {
    const concatenated: T[] = [];
    let isDefined = false;

    for (const { polygon, transform } of fragments) {
      const values = extractor(polygon);

      if (values === undefined) {
        continue;
      }

      for (const value of values) {
        concatenated.push(converter(value, transform));
      }

      isDefined = true;
    }

    return isDefined ? concatenated : undefined;
  };

  for (const [material, fragments] of fragmentsByMaterial.entries()) {
    // Build concatenated points
    const points = concatFragments(
      fragments,
      (p) => p.positions,
      (value, matrix) =>
        Matrix4.transform(matrix, { x: value.x, y: value.y, z: value.z, w: 1 })
    );

    if (points === undefined) {
      throw Error("got undefined attribute when flattening model points");
    }

    // Build concatenated indices
    const indices: Vector3[] = [];

    let indexShift = 0;

    for (const { polygon } of fragments) {
      for (const index of polygon.indices) {
        indices.push({
          x: index.x + indexShift,
          y: index.y + indexShift,
          z: index.z + indexShift,
        });
      }

      indexShift += polygon.positions.length;
    }

    // Build output polygon with concatenated vertex arrays
    polygons.push({
      coordinates: concatFragments(
        fragments,
        (p) => p.coordinates,
        (c) => c
      ),
      indices,
      material,
      normals: concatFragments(
        fragments,
        (p) => p.normals,
        (n) => n // FIXME: missing multiplication by normalMatrix
      ),
      positions: points,
      tangents: concatFragments(
        fragments,
        (p) => p.tangents,
        (t) => t // FIXME: missing multiplication by normalMatrix
      ),
      tints: concatFragments(
        fragments,
        (p) => p.tints,
        (t) => t
      ),
    });
  }

  // Create and return flattened model
  return {
    meshes: [{ children: [], polygons, transform: Matrix4.identity }],
  };
};

const loadModelFrom3ds = createLoadModel(loadFrom3ds);
const loadModelFromGltf = createLoadModel(loadFromGltf);
const loadModelFromJson = createLoadModel(loadFromJson);
const loadModelFromObj = createLoadModel(loadFromObj);

const mergeModels = (instances: Iterable<Instance>): Model => {
  const meshes: Mesh[] = [];

  for (const { model, transform } of instances) {
    meshes.push({
      children: model.meshes,
      polygons: [],
      transform,
    });
  }

  return { meshes };
};

const reduceMeshes = <TState>(
  meshes: Mesh[],
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, geometry: Polygon, transform: Matrix4) => TState
): TState => {
  for (const mesh of meshes) {
    const transform = Matrix4.fromObject(parent);

    transform.multiply(mesh.transform);

    for (const polygon of mesh.polygons) {
      state = reduce(state, polygon, transform);
    }

    state = reduceMeshes(mesh.children, transform, state, reduce);
  }

  return state;
};

const reduceMeshPositions = <TState>(
  meshes: Mesh[],
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, position: Vector3) => TState
): TState => {
  return reduceMeshes(
    meshes,
    parent,
    state,
    (previous: TState, polygon: Polygon, transform: Matrix4) => {
      let current = previous;

      for (const position of polygon.positions) {
        current = reduce(
          current,
          Matrix4.transform(transform, {
            x: position.x,
            y: position.y,
            z: position.z,
            w: 1,
          })
        );
      }

      return current;
    }
  );
};

export {
  type Filter,
  type Material,
  type Mesh,
  type Model,
  type Polygon,
  type Texture,
  Interpolation,
  Wrap,
  defaultColor,
  defaultFilter,
  changeModelCenter,
  computeBoundingBox,
  computeCenter,
  flattenModel,
  loadModelFrom3ds,
  loadModelFromGltf,
  loadModelFromJson,
  loadModelFromObj,
  mergeModels,
};
