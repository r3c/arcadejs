import { Matrix4 } from "../math/matrix";
import { Vector2, Vector3, Vector4 } from "../math/vector";
import {
  BoundingBox,
  Interpolation,
  Library,
  Material,
  MaterialReference,
  Mesh,
  Polygon,
  Texture,
  TextureSampler,
  Wrap,
  defaultColor,
  defaultSampler,
} from "./mesh/definition";
import { range } from "../language/iterable";
import { load as loadFrom3ds } from "./mesh/loaders/3ds";
import { load as loadFromGltf } from "./mesh/loaders/gltf";
import { load as loadFromJson } from "./mesh/loaders/json";
import { load as loadFromObj } from "./mesh/loaders/obj";
import { loadFromURL } from "./image";
import { getHashCode, isEqual } from "../language/dynamic";

type Configuration<TFormat> = {
  format: TFormat;
  library: Library;
  transform: Matrix4;
};

type MeshInstance = {
  mesh: Mesh;
  transform: Matrix4;
};

const changeMeshCenter = (mesh: Mesh): Mesh => {
  const center = computeCenter(mesh);

  reduceMesh(mesh, Matrix4.identity, false, (_, polygon) => {
    polygon.positions = polygon.positions.map((position) =>
      Vector3.fromSource(position, ["sub", center])
    );

    return false;
  });

  return mesh;
};

/**
 * Compute bouding box around given mesh.
 */
const computeBoundingBox = (mesh: Mesh): BoundingBox => {
  return reduceMeshPositions<BoundingBox>(
    mesh,
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
 * Compute center position from a mesh.
 */
const computeCenter = (mesh: Mesh): Vector3 => {
  const { count, sum } = reduceMeshPositions(
    mesh,
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
  const normals = range(points.length).map(() => Vector3.fromZero());

  for (const { x, y, z } of indices) {
    const u = Vector3.fromSource(points[y], ["sub", points[x]]);
    const v = Vector3.fromSource(points[z], ["sub", points[x]]);

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
  const tangents = range(points.length).map(() => Vector3.fromZero());

  for (const { x, y, z } of indices) {
    const c2 = Vector2.fromSource(coords[y], ["sub", coords[x]], ["normalize"]);
    const c3 = Vector2.fromSource(coords[z], ["sub", coords[x]], ["normalize"]);
    const p2 = Vector3.fromSource(points[y], ["sub", points[x]], ["normalize"]);
    const p3 = Vector3.fromSource(points[z], ["sub", points[x]], ["normalize"]);

    const tangent = {
      x: c3.y * p2.x - c2.y * p3.x,
      y: c3.y * p2.y - c2.y * p3.y,
      z: c3.y * p2.z - c2.y * p3.z,
    };

    tangents[x].add(tangent);
    tangents[y].add(tangent);
    tangents[z].add(tangent);
  }

  for (let i = 0; i < tangents.length; ++i) {
    const n = Vector3.fromSource(normals[i]);
    const t = tangents[i];

    // Gram-Schmidt orthogonalize: t' = normalize(t - n * dot(n, t));
    n.scale(Vector3.getDot(n, t));
    t.sub(n);
    t.normalize();
  }

  return tangents;
};

const createFlatMesh = (mesh: Mesh): Mesh => {
  const flatPolygons = new Map<Material | undefined, Polygon>();

  createFlatPolygons(flatPolygons, mesh, Matrix4.identity);

  return {
    children: [],
    polygons: Array.from(flatPolygons.values()),
    transform: Matrix4.identity,
  };
};

const createFlatPolygons = (
  flatPolygons: Map<Material | undefined, Polygon>,
  mesh: Mesh,
  parentTransform: Matrix4
): void => {
  const transform = Matrix4.fromSource(parentTransform, [
    "multiply",
    mesh.transform,
  ]);

  for (const polygon of mesh.polygons) {
    // FIXME: map doesn't work as materials are often different instances at loading
    const flatPolygon: Polygon = flatPolygons.get(polygon.material) ?? {
      coordinates: undefined,
      indices: [],
      material: polygon.material,
      normals: undefined,
      positions: [],
      tangents: undefined,
      tints: undefined,
    };

    const indexShift = flatPolygon.positions.length;

    for (const index of polygon.indices) {
      flatPolygon.indices.push({
        x: index.x + indexShift,
        y: index.y + indexShift,
        z: index.z + indexShift,
      });
    }

    for (const position of polygon.positions) {
      flatPolygon.positions.push(
        Vector4.fromSource(
          { x: position.x, y: position.y, z: position.z, w: 1 },
          ["transform", transform]
        )
      );
    }

    if (polygon.coordinates !== undefined) {
      flatPolygon.coordinates = flatPolygon.coordinates ?? [];

      for (const coordinate of polygon.coordinates) {
        flatPolygon.coordinates.push(coordinate);
      }
    }

    if (polygon.normals !== undefined) {
      flatPolygon.normals = flatPolygon.normals ?? [];

      for (const normal of polygon.normals) {
        flatPolygon.normals.push(normal); // FIXME: multiply by normalMatrix
      }
    }

    if (polygon.tangents !== undefined) {
      flatPolygon.tangents = flatPolygon.tangents ?? [];

      for (const tangent of polygon.tangents) {
        flatPolygon.tangents.push(tangent); // FIXME: multiply by normalMatrix
      }
    }

    if (polygon.tints !== undefined) {
      flatPolygon.tints = flatPolygon.tints ?? [];

      for (const tint of polygon.tints) {
        flatPolygon.tints.push(tint);
      }
    }

    flatPolygons.set(polygon.material, flatPolygon);
  }

  for (const child of mesh.children) {
    createFlatPolygons(flatPolygons, child, transform);
  }
};

const createLibrary = (): Library => {
  type MaterialMatch = {
    materialPromise: Promise<Material>;
    reference: MaterialReference;
  };

  const materialMatchesByHashCode = new Map<number, MaterialMatch[]>();
  const texturePromises = new Map<string, Promise<Texture>>();

  const getOrLoadMaterial = async (
    reference: MaterialReference
  ): Promise<Material> => {
    const hashCode = getHashCode(reference);

    const materialMatches = materialMatchesByHashCode.get(hashCode) ?? [];
    const materialMatch = materialMatches.find((match) =>
      isEqual(match.reference, reference)
    );

    let materialPromise = materialMatch?.materialPromise;

    if (materialPromise === undefined) {
      materialPromise = new Promise<Material>(async (resolve) => {
        const material = {
          diffuseColor: reference.diffuseColor,
          diffuseMap: await getOrLoadOptionalTexture(
            reference.diffusePath,
            reference.diffuseSampler
          ),
          emissiveColor: reference.emissiveColor,
          emissiveMap: await getOrLoadOptionalTexture(
            reference.emissivePath,
            reference.emissiveSampler
          ),
          heightMap: await getOrLoadOptionalTexture(
            reference.heightPath,
            reference.heightSampler
          ),
          heightParallaxBias: reference.heightParallaxBias,
          heightParallaxScale: reference.heightParallaxScale,
          metalnessMap: await getOrLoadOptionalTexture(
            reference.metalnessPath,
            reference.metalnessSampler
          ),
          metalnessStrength: reference.metalnessStrength,
          normalMap: await getOrLoadOptionalTexture(
            reference.normalPath,
            reference.normalSampler
          ),
          occlusionMap: await getOrLoadOptionalTexture(
            reference.occlusionPath,
            reference.occlusionSampler
          ),
          occlusionStrength: reference.occlusionStrength,
          roughnessMap: await getOrLoadOptionalTexture(
            reference.roughnessPath,
            reference.roughnessSampler
          ),
          roughnessStrength: reference.roughnessStrength,
          shininess: reference.shininess,
          specularColor: reference.specularColor,
          specularMap: await getOrLoadOptionalTexture(
            reference.specularPath,
            reference.specularSampler
          ),
        };

        resolve(material);
      });

      materialMatches.push({ materialPromise, reference });
      materialMatchesByHashCode.set(hashCode, materialMatches);
    }

    return materialPromise;
  };

  const getOrLoadTexture = async (
    path: string,
    sampler: TextureSampler
  ): Promise<Texture> => {
    let texturePromise = texturePromises.get(path);

    if (texturePromise === undefined) {
      texturePromise = new Promise<Texture>(async (resolve) => {
        const imageData = await loadFromURL(path);

        resolve({ imageData, sampler });
      });

      texturePromises.set(path, texturePromise);
    }

    return texturePromise;
  };

  const getOrLoadOptionalTexture = async (
    path: string | undefined,
    sampler: TextureSampler | undefined
  ): Promise<Texture | undefined> => {
    return path !== undefined
      ? await getOrLoadTexture(path, sampler ?? defaultSampler)
      : undefined;
  };

  return { getOrLoadMaterial, getOrLoadTexture };
};

const createMergedMesh = (instances: Iterable<MeshInstance>): Mesh => {
  const children: Mesh[] = [];

  // [material-factorize]
  for (const { mesh, transform } of instances) {
    children.push({
      children: [mesh],
      polygons: [],
      transform,
    });
  }

  return { children, polygons: [], transform: Matrix4.identity };
};

const createMeshLoader = <TSource, TFormat>(
  loadCallback: (
    source: TSource,
    library: Library,
    formatConfiguration: TFormat | undefined
  ) => Promise<Mesh>
): ((
  source: TSource,
  configurationOrUndefined?: Partial<Configuration<TFormat>>
) => Promise<Mesh>) => {
  return async (source, configurationOrUndefined) => {
    // Load mesh using underlying loading callback
    const configuration = configurationOrUndefined ?? {};
    const library = configuration.library ?? createLibrary();
    const mesh = await loadCallback(source, library, configuration.format);

    // Transform top-level meshes using provided transform matrix if any
    const transform = configuration.transform;

    if (transform !== undefined) {
      mesh.transform = Matrix4.fromSource(transform, [
        "multiply",
        mesh.transform,
      ]);
    }

    // Finalize meshes recursively
    finalizeMesh(mesh);

    return mesh;
  };
};

const finalizeMesh = (mesh: Mesh): void => {
  mesh.children.forEach((child) => finalizeMesh(child));
  mesh.polygons.forEach((mesh) => finalizePolygon(mesh));
};

const finalizePolygon = (polygon: Polygon): void => {
  // Transform normals or compute them from vertices
  if (polygon.normals !== undefined) {
    const normals = polygon.normals;

    for (let i = 0; i < normals.length; ++i) {
      normals[i] = Vector3.fromSource(normals[i], ["normalize"]);
    }
  } else {
    polygon.normals = computeNormals(polygon.indices, polygon.positions);
  }

  // Transform tangents or compute them from vertices, normals and texture coordinates
  if (polygon.tangents !== undefined) {
    const tangents = polygon.tangents;

    for (let i = 0; i < tangents.length; ++i) {
      tangents[i] = Vector3.fromSource(tangents[i], ["normalize"]);
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

const loadMeshFrom3ds = createMeshLoader(loadFrom3ds);
const loadMeshFromGltf = createMeshLoader(loadFromGltf);
const loadMeshFromJson = createMeshLoader(loadFromJson);
const loadMeshFromObj = createMeshLoader(loadFromObj);

const reduceMesh = <TState>(
  mesh: Mesh,
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, geometry: Polygon, transform: Matrix4) => TState
): TState => {
  const transform = Matrix4.fromSource(parent, ["multiply", mesh.transform]);

  for (const polygon of mesh.polygons) {
    state = reduce(state, polygon, transform);
  }

  for (const child of mesh.children) {
    state = reduceMesh(child, transform, state, reduce);
  }

  return state;
};

const reduceMeshPositions = <TState>(
  mesh: Mesh,
  parent: Matrix4,
  state: TState,
  reduce: (previous: TState, position: Vector3) => TState
): TState => {
  return reduceMesh(
    mesh,
    parent,
    state,
    (previous: TState, polygon: Polygon, transform: Matrix4) => {
      let current = previous;

      for (const position of polygon.positions) {
        current = reduce(
          current,
          Vector4.fromSource(
            { x: position.x, y: position.y, z: position.z, w: 1 },
            ["transform", transform]
          )
        );
      }

      return current;
    }
  );
};

const commonMesh: { quad: Mesh } = {
  quad: {
    children: [],
    polygons: [
      {
        coordinates: [
          { x: 0.0, y: 0.0 },
          { x: 1.0, y: 0.0 },
          { x: 1.0, y: 1.0 },
          { x: 0.0, y: 1.0 },
        ],
        indices: [
          { x: 0, y: 1, z: 2 },
          { x: 0, y: 2, z: 3 },
        ],
        positions: [
          { x: -1.0, y: -1.0, z: 0.0 },
          { x: 1.0, y: -1.0, z: 0.0 },
          { x: 1.0, y: 1.0, z: 0.0 },
          { x: -1.0, y: 1.0, z: 0.0 },
        ],
      },
    ],
    transform: Matrix4.identity,
  },
};

export {
  type Library,
  type Material,
  type MaterialReference,
  type Mesh,
  type MeshInstance,
  type Polygon,
  type Texture,
  type TextureSampler,
  Interpolation,
  Wrap,
  commonMesh,
  defaultColor,
  defaultSampler,
  changeMeshCenter,
  computeBoundingBox,
  computeCenter,
  createFlatMesh,
  createLibrary,
  createMergedMesh,
  loadMeshFrom3ds,
  loadMeshFromGltf,
  loadMeshFromJson,
  loadMeshFromObj,
};
