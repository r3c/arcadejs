import { type Codec, asciiCodec } from "../../../text/encoding";
import * as image from "../../image";
import { Matrix4 } from "../../../math/matrix";
import {
  defaultColor,
  Interpolation,
  Material,
  Model,
  Texture,
  Wrap,
} from "../definition";
import * as path from "../../../fs/path";
import * as stream from "../../../io/stream";
import { Vector2, Vector3, Vector4 } from "../../../math/vector";

/*
 ** Implementation based on:
 ** http://www.martinreddy.net/gfx/3d/3DS.spec
 ** http://www.martinreddy.net/gfx/3d/MLI.spec
 */

interface Context {
  codec: Codec;
  directory: string;
  file: string;
  reader: stream.BinaryReader;
}

interface RawMaterial {
  material: Material;
  name: string;
}

interface RawModel {
  materials: Map<string, Material>;
  polygons: RawPolygon[];
}

interface RawPolygon {
  coords: Vector2[];
  indices: number[];
  materialName: string | undefined;
  points: Vector3[];
}

const invalidChunk = (file: string, chunk: number, description: string) => {
  return Error(`invalid chunk ${chunk} in file ${file}: ${description}`);
};

const load = async (url: string): Promise<Model> => {
  const context = {
    codec: asciiCodec,
    directory: path.directory(url),
    file: url,
    reader: new stream.BinaryReader(
      await stream.readURL(stream.BinaryFormat, url),
      stream.Endian.Little
    ),
  };

  const model = await scan(context, context.reader.getLength(), readRoot, {
    materials: new Map(),
    polygons: [],
  });

  return {
    meshes: [
      {
        children: [],
        polygons: model.polygons.map((mesh) => ({
          coords: mesh.coords.length > 0 ? mesh.coords : undefined,
          indices: mesh.indices,
          material:
            mesh.materialName !== undefined
              ? model.materials.get(mesh.materialName)
              : undefined,
          points: mesh.points,
        })),
        transform: Matrix4.identity,
      },
    ],
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
      const { material, name } = await scan(context, end, readMaterial, {
        material: {},
        name: "",
      });

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

    case 0xa020: // Albedo color
      state.material.albedoFactor = await scan(
        context,
        end,
        readColor,
        defaultColor
      );

      break;

    case 0xa030: // Specular color
      state.material.glossFactor = await scan(
        context,
        end,
        readColor,
        defaultColor
      );

      break;

    case 0xa040: // Shininess
      state.material.shininess = context.reader.readInt16u();

      break;

    case 0xa200: // Texture 1
      state.material.albedoMap = await scan(
        context,
        end,
        readMaterialMap,
        undefined
      );

      break;

    case 0xa204: // Gloss map
      state.material.glossMap = await scan(
        context,
        end,
        readMaterialMap,
        undefined
      );

      break;

    case 0xa230: // Bump map
      state.material.heightMap = await scan(
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
  state: Texture | undefined
) => {
  switch (chunk) {
    case 0xa300:
      return {
        filter: {
          magnifier: Interpolation.Linear,
          minifier: Interpolation.Linear,
          mipmap: true,
          wrap: Wrap.Repeat,
        },
        image: await image.loadFromURL(
          path.combine(
            context.directory,
            context.codec.decode(context.reader.readBufferZero())
          )
        ),
      };
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
        coords: [],
        indices: [],
        materialName: undefined,
        points: [],
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

        state.points.push(Vector3.fromXYZ(x, y, z));
      }

      return state;

    case 0x4120: // TRI_FACEL1
      for (let count = context.reader.readInt16u(); count > 0; --count) {
        state.indices.push(context.reader.readInt16u());
        state.indices.push(context.reader.readInt16u());
        state.indices.push(context.reader.readInt16u());

        context.reader.readInt16u(); // Face info
      }

      state.materialName = await scan(context, end, readPolygonMaterial, "");

      return state;

    case 0x4140: // TRI_MAPPINGCOORS
      for (let count = context.reader.readInt16u(); count > 0; --count) {
        const x = context.reader.readFloat32();
        const y = 1.0 - context.reader.readFloat32();

        state.coords.push(Vector2.fromXY(x, y));
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
        context.file,
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
