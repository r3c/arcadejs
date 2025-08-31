import { type Codec, asciiCodec } from "../../../text/encoding";
import { Matrix4 } from "../../../math/matrix";
import {
  defaultColor,
  Library,
  Material,
  MaterialReference,
  Mesh,
} from "../definition";
import { combinePath, getPathDirectory } from "../../../fs/path";
import {
  BinaryFormat,
  BinaryReader,
  Endian,
  readURL,
} from "../../../io/stream";
import { Vector2, Vector3, Vector4 } from "../../../math/vector";

/*
 ** Implementation based on:
 ** http://www.martinreddy.net/gfx/3d/3DS.spec
 ** http://www.martinreddy.net/gfx/3d/MLI.spec
 */

type Context = {
  codec: Codec;
  library: Library;
  reader: BinaryReader;
  url: string;
};

type RawMaterial = {
  name: string;
  reference: MaterialReference;
};

type RawModel = {
  materials: Map<string, Material>;
  polygons: RawPolygon[];
};

type RawPolygon = {
  coordinates: Vector2[] | undefined;
  indices: Vector3[];
  materialName: string | undefined;
  positions: Vector3[];
};

const invalidChunk = (file: string, chunk: number, description: string) => {
  return Error(`invalid chunk ${chunk} in file ${file}: ${description}`);
};

const load = async (url: string, library: Library): Promise<Mesh> => {
  const reader = new BinaryReader(
    await readURL(BinaryFormat, url),
    Endian.Little
  );

  const context = {
    codec: asciiCodec,
    library,
    reader,
    url,
  };

  const { materials, polygons } = await scan(
    context,
    reader.getLength(),
    readRoot,
    {
      materials: new Map(),
      polygons: [],
    }
  );

  return {
    children: [],
    polygons: polygons.map(
      ({ coordinates, indices, materialName, positions }) => ({
        coordinates,
        indices,
        material:
          materialName !== undefined ? materials.get(materialName) : undefined,
        positions,
      })
    ),
    transform: Matrix4.identity,
  };
};

const readColor = async (
  context: Context,
  _end: number,
  chunk: number,
  state: Vector4
): Promise<Vector4> => {
  switch (chunk) {
    case 0x0010: // COL_RGB
    case 0x0013: // COL_UNK
      return {
        x: context.reader.readFloat32(),
        y: context.reader.readFloat32(),
        z: context.reader.readFloat32(),
        w: 1.0,
      };

    case 0x0011: // RGB1
    case 0x0012: // RGB2
      return {
        x: context.reader.readInt8u() / 255,
        y: context.reader.readInt8u() / 255,
        z: context.reader.readInt8u() / 255,
        w: 1.0,
      };
  }

  return state;
};

const readEdit = async (
  context: Context,
  end: number,
  chunk: number,
  state: RawModel
) => {
  switch (chunk) {
    case 0x4000: // DIT_OBJECT
      context.reader.readBufferZero(); // Skip object name

      await scan(context, end, readObject, state.polygons);

      return state;

    case 0xafff: // DIT_MATERIAL
      const { name, reference } = await scan(context, end, readMaterial, {
        name: "",
        reference: {},
      });

      const material = await context.library.getOrLoadMaterial(reference);

      state.materials.set(name, material);

      return state;
  }

  return state;
};

const readMain = async (
  context: Context,
  end: number,
  chunk: number,
  state: RawModel
) => {
  switch (chunk) {
    case 0x3d3d: // EDIT3DS
      return scan(context, end, readEdit, state);
  }

  return state;
};

const readMaterial = async (
  context: Context,
  end: number,
  chunk: number,
  state: RawMaterial
) => {
  switch (chunk) {
    case 0xa000: // Material name
      state.name = context.codec.decode(context.reader.readBufferZero());

      break;

    case 0xa020: // Diffuse color
      state.reference.diffuseColor = await scan(
        context,
        end,
        readColor,
        defaultColor
      );

      break;

    case 0xa030: // Specular color
      state.reference.specularColor = await scan(
        context,
        end,
        readColor,
        defaultColor
      );

      break;

    case 0xa040: // Shininess
      state.reference.shininess = context.reader.readInt16u();

      break;

    case 0xa200: // Texture 1
      state.reference.diffusePath = await scan(
        context,
        end,
        readMaterialMap,
        undefined
      );

      break;

    case 0xa204: // Specular map
      state.reference.specularPath = await scan(
        context,
        end,
        readMaterialMap,
        undefined
      );

      break;

    case 0xa230: // Bump map
      state.reference.heightPath = await scan(
        context,
        end,
        readMaterialMap,
        undefined
      );

      break;
  }

  return state;
};

const readMaterialMap = async (
  context: Context,
  _end: number,
  chunk: number,
  state: string | undefined
) => {
  switch (chunk) {
    case 0xa300:
      const { codec, reader, url } = context;

      return combinePath(
        getPathDirectory(url),
        codec.decode(reader.readBufferZero())
      );
  }

  return state;
};

const readObject = async (
  context: Context,
  end: number,
  chunk: number,
  state: RawPolygon[]
): Promise<RawPolygon[]> => {
  switch (chunk) {
    case 0x4100: // OBJ_TRIMESH
      const mesh = await scan(context, end, readPolygon, {
        coordinates: undefined,
        indices: [],
        materialName: undefined,
        positions: [],
      });

      state.push(mesh);

      return state;
  }

  return state;
};

const readPolygon = async (
  context: Context,
  end: number,
  chunk: number,
  state: RawPolygon
) => {
  switch (chunk) {
    case 0x4110: // TRI_VERTEXL
      for (let count = context.reader.readInt16u(); count > 0; --count) {
        const x = context.reader.readFloat32();
        const y = context.reader.readFloat32();
        const z = context.reader.readFloat32();

        // Swap from 3DS to OpenGL coordinates system
        // See: https://forums.ogre3d.org/viewtopic.php?p=106490&sid=33050fc83f38cf0e31b9649398d95295#p106490
        state.positions.push({ x, y: z, z: -y });
      }

      return state;

    case 0x4120: // TRI_FACEL1
      for (let count = context.reader.readInt16u(); count > 0; --count) {
        const x = context.reader.readInt16u();
        const y = context.reader.readInt16u();
        const z = context.reader.readInt16u();
        context.reader.readInt16u(); // Face info

        state.indices.push({ x, y, z });
      }

      state.materialName = await scan(context, end, readPolygonMaterial, "");

      return state;

    case 0x4140: // TRI_MAPPINGCOORS
      if (state.coordinates === undefined) {
        state.coordinates = [];
      }

      for (let count = context.reader.readInt16u(); count > 0; --count) {
        const x = context.reader.readFloat32();
        const y = 1.0 - context.reader.readFloat32();

        state.coordinates.push({ x, y });
      }

      return state;
  }

  return state;
};

const readPolygonMaterial = async (
  context: Context,
  _end: number,
  chunk: number,
  state: string
): Promise<string> => {
  switch (chunk) {
    case 0x4130: // TRI_MATERIAL
      const name = context.codec.decode(context.reader.readBufferZero());

      context.reader.readInt16u(); // Number of faces using material

      return name;
  }

  return state;
};

const readRoot = async (
  context: Context,
  end: number,
  chunk: number,
  state: RawModel
) => {
  switch (chunk) {
    case 0x4d4d: // MAIN3DS
      return scan(context, end, readMain, state);

    default:
      throw invalidChunk(
        context.url,
        chunk,
        "only main chunk 0x4d4d is accepted at top-level"
      );
  }
};

/*
 ** Read chunks from given binary reader until offset limit is reached and use
 ** given callback to process their contents.
 */
const scan = async <T>(
  context: Context,
  end: number,
  recurse: (
    context: Context,
    end: number,
    section: number,
    state: T
  ) => Promise<T>,
  state: T
) => {
  while (context.reader.getOffset() < end) {
    const begin = context.reader.getOffset();
    const chunk = context.reader.readInt16u();
    const size = context.reader.readInt32u();

    state = await recurse(context, Math.min(begin + size, end), chunk, state);

    context.reader.skip(size + begin - context.reader.getOffset());
  }

  return state;
};

export { load };
