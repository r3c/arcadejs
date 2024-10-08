import { asciiCodec } from "../../../text/encoding";
import { mapOptional } from "../../../language/optional";
import { Channel, loadFromURL, mapChannels } from "../../image";
import { Matrix4 } from "../../../math/matrix";
import { Interpolation, Material, Mesh, Polygon, Wrap } from "../definition";
import { combinePath, getPathDirectory } from "../../../fs/path";
import {
  BinaryFormat,
  BinaryReader,
  Endian,
  readURL,
} from "../../../io/stream";
import { Vector2, Vector3, Vector4 } from "../../../math/vector";
import { range } from "../../../language/iterable";

/*
 ** Implementation based on:
 ** https://github.com/KhronosGroup/glTF/tree/master/specification/2.0
 */

type TfAccessor = {
  arrayBuffer: ArrayBuffer;
  arrayConstructor: TfArrayConstructor;
  componentsPerElement: number;
  elements: number;
  index: number;
  offset: number;
  stride: number | undefined;
};

type TfArray =
  | Int8Array
  | Float32Array
  | Int16Array
  | Uint8Array
  | Uint32Array
  | Uint16Array;

type TfArrayConstructor = {
  BYTES_PER_ELEMENT: number;

  new (buffer: ArrayBuffer, offset: number, length: number): TfArray;
};

type TfBuffer = {
  buffer: ArrayBuffer;
  length: number;
};

type TfBufferView = {
  buffer: ArrayBuffer;
  length: number;
  offset: number;
  stride: number | undefined;
};

const enum TfComponentType {
  Byte = 5120,
  Float = 5126,
  Short = 5122,
  UnsignedByte = 5121,
  UnsignedShort = 5123,
  UnsignedInt = 5125,
}

type TfMaterial = {
  baseColorFactor: Vector4 | undefined;
  baseColorTexture: TfTexture | undefined;
  emissiveFactor: Vector4 | undefined;
  emissiveTexture: TfTexture | undefined;
  metallicFactor: number;
  metallicRoughnessTexture: TfTexture | undefined;
  roughnessFactor: number;
  name: string;
  normalFactor: Vector4 | undefined;
  normalTexture: TfTexture | undefined;
  occlusionFactor: Vector4 | undefined;
  occlusionTexture: TfTexture | undefined;
};

type TfMesh = {
  primitives: TfPrimitive[];
};

type TfNode = {
  children: TfNode[];
  mesh: TfMesh | undefined;
  transform: Matrix4;
};

type TfPrimitive = {
  coordinates: TfAccessor | undefined;
  indices: TfAccessor;
  normals: TfAccessor | undefined;
  positions: TfAccessor;
  materialName: string | undefined;
  tangents: TfAccessor | undefined;
  tints: TfAccessor | undefined;
};

type TfSampler = {
  magnifier: Interpolation;
  minifier: Interpolation;
  mipmap: boolean;
  wrap: Wrap;
};

type TfScene = {
  nodes: TfNode[];
};

type TfTexture = {
  image: ImageData;
  sampler: TfSampler;
};

enum TfType {
  MAT2,
  MAT3,
  MAT4,
  SCALAR,
  VEC2,
  VEC3,
  VEC4,
}

const convertArrayOf = <TValue>(
  url: string,
  source: string,
  array: any,
  converter: (value: any, index: number) => TValue
) => {
  if (array === undefined) {
    throw invalidData(url, `${source} is not a value array`);
  }

  return (array as Array<unknown>).map(converter);
};

const convertReferenceTo = <TValue>(
  url: string,
  source: string,
  reference: any,
  pool: TValue[]
) => {
  if (typeof reference !== "number") {
    throw invalidData(url, `${source} is not a valid reference`);
  }

  if (reference < 0 || reference >= pool.length) {
    throw invalidData(
      url,
      `${source} references out-of-bound entry #${reference}`
    );
  }

  return pool[reference];
};

const expandAccessor = <T>(
  url: string,
  accessor: TfAccessor,
  cardinality: number,
  converter: (buffer: number[]) => T,
  type: string
): T[] => {
  const stride =
    accessor.stride !== undefined
      ? accessor.stride / accessor.arrayConstructor.BYTES_PER_ELEMENT
      : accessor.componentsPerElement;

  if (cardinality > stride) {
    throw invalidData(
      url,
      `accessor[${accessor.index}] has a smaller stride size (${stride}) than required for a ${type} buffer (${cardinality})`
    );
  }

  const buffer = new accessor.arrayConstructor(
    accessor.arrayBuffer,
    accessor.offset,
    accessor.elements * stride
  );

  const result: T[] = [];

  for (let i = 0; i + cardinality <= buffer.length; i += cardinality) {
    result.push(converter(Array.from(buffer.slice(i, i + cardinality))));
  }

  return result;
};

const expandMaterial = (material: TfMaterial): Material => {
  const toMap = (
    textureOrUndefined: TfTexture | undefined,
    channels?: Channel[]
  ) =>
    mapOptional(textureOrUndefined, (texture) => ({
      filter: {
        magnifier: texture.sampler.magnifier,
        minifier: texture.sampler.minifier,
        mipmap: texture.sampler.mipmap,
        wrap: texture.sampler.wrap,
      },
      image:
        channels !== undefined
          ? mapChannels(texture.image, channels)
          : texture.image,
    }));

  return {
    diffuseColor: material.baseColorFactor,
    diffuseMap: toMap(material.baseColorTexture),
    emissiveColor: material.emissiveFactor,
    emissiveMap: toMap(material.emissiveTexture),
    metalnessMap: toMap(material.metallicRoughnessTexture, [Channel.Blue]),
    metalnessStrength: material.metallicFactor,
    //normalFactor: material.normalFactor, // FIXME: normalFactor is not supported yet
    normalMap: toMap(material.normalTexture),
    occlusionMap: toMap(material.occlusionTexture),
    occlusionStrength: mapOptional(material.occlusionFactor, (factor) =>
      Math.max(factor.x, factor.y, factor.z, factor.w)
    ),
    roughnessMap: toMap(material.metallicRoughnessTexture, [Channel.Green]),
    roughnessStrength: material.roughnessFactor,
  };
};

const expandMesh = (
  url: string,
  mesh: TfMesh,
  materials: Map<string, Material>
): Polygon[] => {
  return mesh.primitives.map((primitive) => {
    const {
      coordinates,
      indices,
      materialName,
      normals,
      positions,
      tangents,
      tints,
    } = primitive;

    const indexValues = expandAccessor(url, indices, 1, (i) => i[0], "index");

    return {
      coordinates: mapOptional(coordinates, (coordinates) =>
        expandAccessor(
          url,
          coordinates,
          2,
          (array) => Vector2.fromZero(["setFromArray", array]),
          "coordinates"
        )
      ),
      indices: range(Math.floor(indexValues.length / 3)).map((i) => ({
        x: indexValues[i * 3 + 0],
        y: indexValues[i * 3 + 1],
        z: indexValues[i * 3 + 2],
      })),
      material:
        materialName !== undefined ? materials.get(materialName) : undefined,
      normals: mapOptional(normals, (normals) =>
        expandAccessor(
          url,
          normals,
          3,
          (array) => Vector3.fromZero(["setFromArray", array]),
          "normals"
        )
      ),
      positions: expandAccessor(
        url,
        positions,
        3,
        (array) => Vector3.fromZero(["setFromArray", array]),
        "positions"
      ),
      tangents: mapOptional(tangents, (tangents) =>
        expandAccessor(
          url,
          tangents,
          3,
          (array) => Vector3.fromZero(["setFromArray", array]),
          "tangents"
        )
      ),
      tints: mapOptional(tints, (tints) =>
        expandAccessor(
          url,
          tints,
          4,
          (array) => Vector4.fromZero(["setFromArray", array]),
          "tints"
        )
      ),
    };
  });
};

const expandNode = (
  url: string,
  node: TfNode,
  materials: Map<string, Material>
): Mesh => ({
  children: node.children.map((child) => expandNode(url, child, materials)),
  polygons:
    mapOptional(node.mesh, (mesh) => expandMesh(url, mesh, materials)) ?? [],
  transform: node.transform,
});

const invalidData = (url: string, description: string) =>
  Error(`invalid glTF data in file ${url}: ${description}`);

const loadAccessor = (
  url: string,
  bufferViews: TfBufferView[],
  accessor: any,
  index: number
): TfAccessor => {
  const source = `accessor[${index}]`;
  const byteOffset = <number | undefined>accessor.byteOffset ?? 0;
  const bufferView = convertReferenceTo(
    url,
    source + ".bufferView",
    accessor.bufferView,
    bufferViews
  );
  const componentType = <number | undefined>accessor.componentType ?? 0;
  const count = <number | undefined>accessor.count ?? 0;
  const typeName = <string | undefined>accessor.type ?? "undefined";
  if (accessor.sparse !== undefined)
    throw invalidData(url, source + " has unsupported sparse attribute");

  let arrayConstructor: TfArrayConstructor;

  switch (componentType) {
    case TfComponentType.Byte:
      arrayConstructor = Int8Array;

      break;

    case TfComponentType.Float:
      arrayConstructor = Float32Array;

      break;

    case TfComponentType.Short:
      arrayConstructor = Int16Array;

      break;

    case TfComponentType.UnsignedByte:
      arrayConstructor = Uint8Array;

      break;

    case TfComponentType.UnsignedInt:
      arrayConstructor = Uint32Array;

      break;

    case TfComponentType.UnsignedShort:
      arrayConstructor = Uint16Array;

      break;

    default:
      throw invalidData(
        url,
        source + ` has unsupported component type ${componentType}`
      );
  }

  let componentsPerElement: number;

  switch (<TfType | undefined>(<any>TfType)[typeName]) {
    case TfType.SCALAR:
      componentsPerElement = 1;

      break;

    case TfType.VEC2:
      componentsPerElement = 2;

      break;

    case TfType.VEC3:
      componentsPerElement = 3;

      break;

    case TfType.VEC4:
      componentsPerElement = 4;

      break;

    default:
      throw invalidData(url, source + ` has unknown type ${typeName}`);
  }

  const stop =
    byteOffset +
    count * componentsPerElement * arrayConstructor.BYTES_PER_ELEMENT;

  if (bufferView.length < stop)
    throw invalidData(
      url,
      source +
        ` overflows underlying buffer view #${accessor.bufferView} by ${
          stop - bufferView.length
        } byte(s)`
    );

  return {
    arrayBuffer: bufferView.buffer,
    arrayConstructor,
    componentsPerElement,
    elements: count,
    index,
    offset: bufferView.offset + byteOffset,
    stride: bufferView.stride,
  };
};

const loadBuffer = async (
  url: string,
  embedded: ArrayBuffer | undefined,
  buffer: any,
  index: number
): Promise<TfBuffer> => {
  let arrayBuffer: ArrayBuffer;

  if (buffer.uri !== undefined)
    arrayBuffer = await readURL(
      BinaryFormat,
      combinePath(getPathDirectory(url), buffer.uri)
    );
  else if (embedded !== undefined) arrayBuffer = embedded;
  else
    throw invalidData(url, `buffer #${index} references missing embedded data`);

  return {
    buffer: arrayBuffer,
    length: buffer.byteLength,
  };
};

const loadBufferView = (
  url: string,
  buffers: TfBuffer[],
  bufferView: any,
  index: number
): TfBufferView => {
  const source = `bufferView[${index}]`;
  const buffer = convertReferenceTo(
    url,
    source + ".buffer",
    bufferView.buffer,
    buffers
  );
  const byteLength = <number | undefined>bufferView.byteLength ?? 0;
  const byteOffset = <number | undefined>bufferView.byteOffset ?? 0;
  const stop = byteOffset + byteLength;

  if (buffer.length < stop)
    throw invalidData(
      url,
      source +
        ` overflows underlying buffer ${bufferView.buffer} by ${
          stop - buffer.length
        } byte(s)`
    );

  return {
    buffer: buffer.buffer,
    offset: byteOffset,
    length: byteLength,
    stride: <number | undefined>bufferView.stride,
  };
};

const loadImage = async (
  url: string,
  bufferViews: TfBufferView[],
  definition: any,
  index: number
): Promise<ImageData> => {
  if (definition.uri !== undefined)
    return await loadFromURL(
      combinePath(getPathDirectory(url), definition.uri)
    );

  const source = `image[${index}]`;

  if (
    definition.bufferView !== undefined &&
    definition.mimeType !== undefined
  ) {
    const bufferView = convertReferenceTo(
      url,
      source + ".bufferView",
      definition.bufferView,
      bufferViews
    );
    const blob = new Blob([bufferView.buffer], { type: definition.mimeType });
    const uri = window.URL.createObjectURL(blob);

    return loadFromURL(uri);
  }

  throw invalidData(url, source + " specifies no URI nor buffer data");
};

const loadMaterial = (
  url: string,
  textures: TfTexture[],
  material: any,
  index: number
): TfMaterial => {
  const pbr = material.pbrMetallicRoughness || {};
  const source = `material[${index}]`;

  const toFactor = (property: any) =>
    mapOptional(property, (factor) => ({
      x: factor[0],
      y: factor[1],
      z: factor[2],
      w: factor[3],
    }));

  const toTexture = (property: any, name: string) =>
    mapOptional(property, (texture) =>
      convertReferenceTo(url, source + "." + name, texture.index, textures)
    );

  return {
    baseColorFactor: toFactor(pbr.baseColorFactor),
    baseColorTexture: toTexture(pbr.baseColorTexture, "baseColorTexture"),
    emissiveFactor: toFactor(material.emissiveFactor),
    emissiveTexture: toTexture(material.emissiveTexture, "emissiveTexture"),
    metallicFactor: pbr.metallicFactor ?? 1.0,
    metallicRoughnessTexture: toTexture(
      pbr.metallicRoughnessTexture,
      "metallicRoughnessTexture"
    ),
    name: material.name || `_${index}`,
    normalFactor: toFactor(material.normalFactor),
    normalTexture: toTexture(material.normalTexture, "normalTexture"),
    occlusionFactor: toFactor(material.occlusionFactor),
    occlusionTexture: toTexture(material.occlusionTexture, "occlusionTexture"),
    roughnessFactor: pbr.roughnessFactor ?? 1.0,
  };
};

const loadMesh = (
  url: string,
  accessors: TfAccessor[],
  materials: TfMaterial[],
  mesh: any,
  index: number
): TfMesh => ({
  primitives: convertArrayOf(
    url,
    `mesh[${index}].primitives`,
    mesh.primitives,
    (value, index) => loadPrimitive(url, accessors, materials, value, index)
  ),
});

const loadNode = (
  url: string,
  meshes: TfMesh[],
  nodes: TfNode[],
  siblings: any,
  node: any,
  index: number
): TfNode => {
  if (nodes[index] === undefined) {
    const source = `node[${index}]`;

    let transform: Matrix4;

    if (node.matrix !== undefined) {
      transform = Matrix4.fromIdentity([
        "setFromArray",
        convertArrayOf(url, source + ".matrix", node.matrix, (value) =>
          parseFloat(value)
        ),
      ]);
    } else if (
      node.rotation !== undefined &&
      node.scale !== undefined &&
      node.translation !== undefined
    ) {
      transform = Matrix4.fromSource(
        Matrix4.identity,
        [
          "translate",
          {
            x: node.translation[0],
            y: node.translation[1],
            z: node.translation[2],
          },
        ],
        [
          "rotate",
          { x: node.rotation[0], y: node.rotation[1], z: node.rotation[2] },
          node.rotation[3],
        ],
        [
          "scale",
          {
            x: node.scale[0],
            y: node.scale[1],
            z: node.scale[2],
          },
        ]
      );
    } else {
      transform = Matrix4.identity;
    }

    const childrenIndices = convertArrayOf(
      url,
      source + ".children",
      node.children || [],
      (value) => parseInt(value)
    );
    const children = [];

    for (const childIndex of childrenIndices) {
      if (siblings[childIndex] === undefined)
        throw invalidData(
          url,
          `invalid reference to child node ${childIndex} from node ${index}`
        );

      children.push(
        loadNode(url, meshes, nodes, siblings, siblings[childIndex], childIndex)
      );
    }

    nodes[index] = {
      children,
      mesh: mapOptional(node.mesh, (mesh) =>
        convertReferenceTo(url, source + ".mesh", mesh, meshes)
      ),
      transform,
    };
  }

  return nodes[index];
};

const loadPrimitive = (
  url: string,
  accessors: TfAccessor[],
  materials: TfMaterial[],
  primitive: any,
  index: number
): TfPrimitive => {
  const attributes = primitive.attributes;
  const material = <number | undefined>primitive.material;
  const source = `primitive #${index}`;

  if (attributes === undefined)
    throw invalidData(url, `${source} has no attributes defined`);

  return {
    tints:
      attributes.COLOR_0 !== undefined
        ? convertReferenceTo(
            url,
            source + ".attributes.COLOR_0",
            parseInt(attributes.COLOR_0),
            accessors
          )
        : undefined,
    coordinates:
      attributes.TEXCOORD_0 !== undefined
        ? convertReferenceTo(
            url,
            source + ".attributes.TEXCOORD_0",
            parseInt(attributes.TEXCOORD_0),
            accessors
          )
        : undefined,
    indices: convertReferenceTo(
      url,
      source + ".indices",
      parseInt(primitive.indices),
      accessors
    ),
    normals:
      attributes.NORMAL !== undefined
        ? convertReferenceTo(
            url,
            source + ".attributes.NORMAL",
            parseInt(attributes.NORMAL),
            accessors
          )
        : undefined,
    materialName:
      material !== undefined
        ? convertReferenceTo(url, source + ".material", material, materials)
            .name
        : undefined,
    positions: convertReferenceTo(
      url,
      source + ".attributes.POSITION",
      parseInt(attributes.POSITION),
      accessors
    ),
    tangents:
      attributes.TANGENT !== undefined
        ? convertReferenceTo(
            url,
            source + ".attributes.TANGENT",
            parseInt(attributes.TANGENT),
            accessors
          )
        : undefined,
  };
};

const loadRoot = async (
  url: string,
  structure: any,
  embedded: ArrayBuffer | undefined
): Promise<Mesh> => {
  const defaultScene = <number | undefined>structure.scene;
  const version: string =
    mapOptional(structure.asset, (asset) => asset.version) ?? "unknown";
  if (defaultScene === undefined)
    throw invalidData(url, "no default scene is defined");

  if (version !== "2.0")
    throw invalidData(url, `version ${version} is not supported`);

  // Accessors
  const buffers: TfBuffer[] = await Promise.all(
    convertArrayOf(url, "buffers", structure.buffers || [], (value, index) =>
      loadBuffer(url, embedded, value, index)
    )
  );
  const bufferViews: TfBufferView[] = convertArrayOf(
    url,
    "bufferViews",
    structure.bufferViews || [],
    (value, index) => loadBufferView(url, buffers, value, index)
  );
  const accessors: TfAccessor[] = convertArrayOf(
    url,
    "accessors",
    structure.accessors || [],
    (value, index) => loadAccessor(url, bufferViews, value, index)
  );

  // Materials
  const images: ImageData[] = await Promise.all(
    convertArrayOf(url, "images", structure.images || [], (value, index) =>
      loadImage(url, bufferViews, value, index)
    )
  );
  const samplers: TfSampler[] = convertArrayOf(
    url,
    "samplers",
    structure.samplers || [],
    (value, index) => loadSampler(url, value, index)
  );
  const textures: TfTexture[] = convertArrayOf(
    url,
    "textures",
    structure.textures || [],
    (value, index) => loadTexture(url, images, samplers, value, index)
  );
  const materials: TfMaterial[] = convertArrayOf(
    url,
    "materials",
    structure.materials || [],
    (value, index) => loadMaterial(url, textures, value, index)
  );

  // Meshes
  const meshes: TfMesh[] = convertArrayOf(
    url,
    "meshes",
    structure.meshes || [],
    (value, index) => loadMesh(url, accessors, materials, value, index)
  );

  // Scenes
  const nodesCache: TfNode[] = [];
  const nodesRaw = structure.nodes || [];
  const nodes: TfNode[] = convertArrayOf(
    url,
    "nodes",
    nodesRaw,
    (value, index) => loadNode(url, meshes, nodesCache, nodesRaw, value, index)
  );
  const scenes: TfScene[] = convertArrayOf(
    url,
    "scenes",
    structure.scenes || [],
    (value, index) => loadScene(url, nodes, value, index)
  );

  if (scenes[defaultScene] === undefined) {
    throw invalidData(url, `default scene #${defaultScene} doesn't exist`);
  }

  // Convert to common types
  const outputMaterials = new Map(
    materials.map((m) => [m.name, expandMaterial(m)])
  );

  return {
    children: scenes[defaultScene].nodes.map((node) =>
      expandNode(url, node, outputMaterials)
    ),
    polygons: [],
    transform: Matrix4.identity,
  };
};

const loadSampler = (_url: string, sampler: any, _index: number): TfSampler => {
  const magFilter = parseInt(sampler.magFilter || 9729);
  const minFilter = parseInt(sampler.minFilter || 9729);
  const wrap = Math.min(
    parseInt(sampler.wrapS || 10497),
    parseInt(sampler.wrapT || 10497)
  );

  return {
    magnifier:
      magFilter === 9729 /* LINEAR */
        ? Interpolation.Linear
        : Interpolation.Nearest,
    minifier:
      minFilter === 9729 /* LINEAR */ ||
      minFilter === 9986 /* NEAREST_MIPMAP_LINEAR */ ||
      minFilter === 9987 /* LINEAR_MIPMAP_LINEAR */
        ? Interpolation.Linear
        : Interpolation.Nearest,
    mipmap:
      minFilter === 9984 /* NEAREST_MIPMAP_NEAREST */ ||
      minFilter === 9985 /* LINEAR_MIPMAP_NEAREST */ ||
      minFilter === 9986 /* NEAREST_MIPMAP_LINEAR */ ||
      minFilter === 9987 /* LINEAR_MIPMAP_LINEAR */,
    wrap:
      wrap === 10497 /* REPEAT */
        ? Wrap.Repeat
        : wrap === 33648 /* MIRRORED_REPEAT */
        ? Wrap.Mirror
        : Wrap.Clamp,
  };
};

const loadScene = (
  url: string,
  nodes: TfNode[],
  scene: any,
  index: number
): TfScene => {
  const nodeIndices = <any[]>(scene.nodes || []);

  return {
    nodes: nodeIndices.map((node, i) =>
      convertReferenceTo(url, `scene[${index}].nodes[${i}]`, node, nodes)
    ),
  };
};

const loadTexture = (
  url: string,
  images: ImageData[],
  samplers: TfSampler[],
  texture: any,
  index: number
): TfTexture => {
  const source = `texture[${index}]`;

  return {
    image: convertReferenceTo(url, source + ".source", texture.source, images),
    sampler: convertReferenceTo(
      url,
      source + ".sampler",
      texture.sampler,
      samplers
    ),
  };
};

const load = async (url: string): Promise<Mesh> => {
  const buffer = await readURL(BinaryFormat, url);
  const codec = asciiCodec;
  const reader = new BinaryReader(buffer, Endian.Little);
  const first = String.fromCharCode(reader.readInt8u());

  let structure: any;
  let embedded: ArrayBuffer | undefined;

  // Looks like a JSON glTF file
  if (first === "{") {
    structure = JSON.parse(
      first +
        codec.decode(reader.readBuffer(reader.getLength() - reader.getOffset()))
    );
  }

  // Looks like a binary glTF file
  else if (first + codec.decode(reader.readBuffer(3)) === "glTF") {
    const version = reader.readInt32u();

    if (version !== 2) {
      throw invalidData(url, `version ${version} is not supported`);
    }

    const fileLength = reader.readInt32u(); // Read length

    // First chunk: structure as a JSON string
    const jsonLength = reader.readInt32u();
    const jsonType = reader.readInt32u();

    if (jsonType !== 0x4e4f534a) {
      throw invalidData(url, "first chunk is expected to be JSON");
    }

    structure = JSON.parse(codec.decode(reader.readBuffer(jsonLength)));

    // Second chunk: binary
    if (reader.getOffset() < fileLength) {
      reader.readInt32u(); // _binaryLength
      const binaryType = reader.readInt32u();

      if (binaryType !== 0x004e4942) {
        throw invalidData(url, "second chunk is expected to be binary");
      }

      embedded = buffer.slice(reader.getOffset());
    } else {
      embedded = undefined;
    }
  } else {
    throw invalidData(url, "format is not recognized");
  }

  return loadRoot(url, structure, embedded);
};

export { load };
