import { loadFromURL } from "../../image";
import { Matrix4 } from "../../../math/matrix";
import {
  Interpolation,
  Library,
  Material,
  Model,
  Polygon,
  Texture,
  Wrap,
} from "../definition";
import { combinePath, getPathDirectory } from "../../../fs/path";
import { StringFormat, readURL } from "../../../io/stream";
import { Vector2, Vector3 } from "../../../math/vector";

/*
 ** Implementation based on:
 ** http://paulbourke.net/dataformats/obj/
 ** http://paulbourke.net/dataformats/mtl/
 */

type WavefrontOBJConfiguration = {
  objectFilter?: string;
};

interface WavefrontOBJGroup {
  faces: WavefrontOBJVertex[][];
  materialName: string | undefined;
}

interface WavefrontOBJVertex {
  coordinate: number | undefined;
  normal: number | undefined;
  position: number;
}

const invalidFile = (file: string, description: string) => {
  return Error(`${description} in file ${file}`);
};

const invalidLine = (file: string, lineIndex: number, description: string) => {
  return Error(`invalid ${description} in file ${file} at line ${lineIndex}`);
};

const load = async (
  url: string,
  _: Library,
  configuration: WavefrontOBJConfiguration | undefined
): Promise<Model> => {
  const data = await readURL(StringFormat, url);

  return loadObject(configuration?.objectFilter, data, url);
};

const loadMaterial = async (
  materials: Map<string, Material>,
  data: string,
  fileName: string
) => {
  let current: Material | undefined;

  for (const { fields, lineIndex } of parseFile(data, fileName)) {
    switch (fields[0]) {
      case "#":
      case "d": // Transparency (not supported)
      case "illum": // Illumination model (not supported)
      case "Ka": // Ambient light color (not supported)
      case "Ni": // Optical density (not supported)
      case "Tr": // Transparency (not supported)
        break;

      case "Kd": // Diffuse light color
        if (fields.length < 4 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "albedo color");
        }

        current.albedoFactor = parseVector4(fields);

        break;

      case "Ke": // Emissive light color
        if (fields.length < 4 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "emissive color");
        }

        current.emissiveFactor = parseVector4(fields);

        break;

      case "Ks": // Specular light color
        if (fields.length < 4 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "gloss color");
        }

        current.glossFactor = parseVector4(fields);

        break;

      case "map_bump": // Bump map texture
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "bump map");
        }

        current.heightMap = await loadTexture(fileName, fields[1]);

        break;

      case "map_Kd": // Diffuse map texture
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "albedo map");
        }

        current.albedoMap = await loadTexture(fileName, fields[1]);

        break;

      case "map_Ks": // Specular map texture
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "specular map");
        }

        current.glossMap = await loadTexture(fileName, fields[1]);

        break;

      case "map_normal": // Normal map texture (custom extension)
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "normal map");
        }

        current.normalMap = await loadTexture(fileName, fields[1]);

        break;

      case "Ns": // Material shininess
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, lineIndex, "shininess");
        }

        current.shininess = parseFloat(fields[1]);

        break;

      case "newmtl": // New material declaration
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "material");
        }

        const material = {};

        materials.set(fields[1], material);
        current = material;

        break;

      default:
        throw invalidLine(fileName, lineIndex, `prefix '${fields[0]}'`);
    }
  }
};

const loadObject = async (
  objectFilter: string | undefined,
  data: string,
  fileName: string
): Promise<Model> => {
  const coordinates: Vector2[] = [];
  const polygons: Polygon[] = [];
  const groups: WavefrontOBJGroup[] = [];
  const materials = new Map<string, Material>();
  const normals: Vector3[] = [];
  const positions: Vector3[] = [];

  let mustStartNew = true;
  let currentMaterial: string | undefined = undefined;
  let currentObject: string | undefined = undefined;
  let current: WavefrontOBJGroup = {
    faces: [],
    materialName: undefined,
  };

  // Load raw model data from file
  for (const { fields, lineIndex } of parseFile(data, fileName)) {
    switch (fields[0]) {
      case "#":
      case "s": // Smooth shading (not supported)
        break;

      case "f":
        if (fields.length < 4) {
          throw invalidLine(fileName, lineIndex, "face definition");
        }

        if (objectFilter !== undefined && currentObject !== objectFilter) {
          break;
        }

        if (mustStartNew) {
          current = {
            faces: [],
            materialName: currentMaterial,
          };

          groups.push(current);

          mustStartNew = false;
          currentMaterial = undefined;
        }

        current.faces.push(fields.slice(1).map(parseFace));

        break;

      case "mtllib":
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "material library reference");
        }

        if (objectFilter !== undefined && currentObject !== objectFilter) {
          break;
        }

        const directory = getPathDirectory(fileName);
        const library = combinePath(directory, fields[1]);

        await readURL(StringFormat, library).then((data) =>
          loadMaterial(materials, data, library)
        );

        break;

      case "o":
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "object name");
        }

        currentObject = fields[1];

        break;

      case "usemtl":
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "material use");
        }

        if (objectFilter !== undefined && currentObject !== objectFilter) {
          break;
        }

        mustStartNew = true;
        currentMaterial = fields[1];

        break;

      case "v":
        if (fields.length < 4) {
          throw invalidLine(fileName, lineIndex, "vertex");
        }

        if (objectFilter !== undefined && currentObject !== objectFilter) {
          break;
        }

        positions.push(parseVector3(fields));

        break;

      case "vn":
        if (fields.length < 4) {
          throw invalidLine(fileName, lineIndex, "normal");
        }

        if (objectFilter !== undefined && currentObject !== objectFilter) {
          break;
        }

        normals.push(parseVector3(fields));

        break;

      case "vt":
        if (fields.length < 3) {
          throw invalidLine(fileName, lineIndex, "texture");
        }

        if (objectFilter !== undefined && currentObject !== objectFilter) {
          break;
        }

        coordinates.push(parseVector2(fields));

        break;

      default:
        throw invalidLine(fileName, lineIndex, `prefix '${fields[0]}'`);
    }
  }

  // Convert groups into meshes by transforming multi-component face indices into scalar batch indices
  for (const group of groups) {
    const batches = new Map<string, number>();
    const groupCoordinates: Vector2[] = [];
    const groupIndices: number[] = [];
    const groupNormals: Vector3[] = [];
    const groupPositions: Vector3[] = [];

    // Convert faces into triangles, a face with N vertices defines N-2 triangles with
    // vertices [0, i + 1, i + 2] for 0 <= i < N - 2 (equivalent to gl.TRIANGLE_FAN mode)
    for (const face of group.faces) {
      for (let triangle = 0; triangle + 2 < face.length; ++triangle) {
        for (let faceIndex of [0, triangle + 1, triangle + 2]) {
          const { coordinate, normal, position } = face[faceIndex];
          const key = position + "/" + coordinate + "/" + normal;

          let batch = batches.get(key);

          if (batch === undefined) {
            batch = batches.size;

            batches.set(key, batch);

            if (coordinates.length > 0) {
              if (coordinate === undefined) {
                throw invalidFile(
                  fileName,
                  "faces must include texture coordinate index if file specify them"
                );
              }

              if (coordinate < 0 || coordinate >= coordinates.length) {
                throw invalidFile(
                  fileName,
                  `invalid texture coordinate index ${coordinate}`
                );
              }

              groupCoordinates.push(coordinates[coordinate]);
            }

            if (normals.length > 0) {
              if (normal === undefined) {
                throw invalidFile(
                  fileName,
                  "faces must include normal index if file specify them"
                );
              }

              if (normal < 0 || normal >= normals.length) {
                throw invalidFile(fileName, `invalid normal index ${normal}`);
              }

              groupNormals.push(normals[normal]);
            }

            if (position < 0 || position >= positions.length) {
              throw invalidFile(fileName, `invalid vertex index ${position}`);
            }

            groupPositions.push(positions[position]);
          }

          groupIndices.push(batch);
        }
      }
    }

    const material =
      group.materialName !== undefined
        ? materials.get(group.materialName)
        : undefined;

    polygons.push({
      coordinates: groupCoordinates,
      indices: groupIndices,
      material,
      normals: groupNormals,
      positions: groupPositions,
    });
  }

  return {
    meshes: [
      {
        children: [],
        polygons,
        transform: Matrix4.identity,
      },
    ],
  };
};

const loadTexture = async (
  fileName: string,
  textureName: string
): Promise<Texture> => ({
  filter: {
    magnifier: Interpolation.Linear,
    minifier: Interpolation.Linear,
    mipmap: true,
    wrap: Wrap.Repeat,
  },
  image: await loadFromURL(
    combinePath(getPathDirectory(fileName), textureName)
  ),
});

const parseFace = (face: string) => {
  const indices = face.split(/\//);

  return {
    coordinate:
      indices.length > 1 && indices[1].trim() !== ""
        ? parseInt(indices[1]) - 1
        : undefined,
    normal:
      indices.length > 2 && indices[2].trim() !== ""
        ? parseInt(indices[2]) - 1
        : undefined,
    position: parseInt(indices[0]) - 1,
  };
};

function* parseFile(data: string, fileName: string) {
  const regexp = /(?:.*(?:\n\r|\r\n|\n|\r)|$)/g;

  for (let lineIndex = 1; true; ++lineIndex) {
    const match = regexp.exec(data);

    if (match === null) {
      throw invalidLine(fileName, lineIndex, "line");
    }

    if (match[0] === "") {
      break; // End of file, stop parsing
    }

    const line = match[0].trim();

    if (line === "") {
      continue; // Empty line, skip
    }

    yield {
      fields: line.split(/[\t ]+/),
      lineIndex,
    };
  }
}

const parseVector2 = (fields: string[]) => {
  return {
    x: parseFloat(fields[1]),
    y: parseFloat(fields[2]),
  };
};

const parseVector3 = (fields: string[]) => {
  return {
    x: parseFloat(fields[1]),
    y: parseFloat(fields[2]),
    z: parseFloat(fields[3]),
  };
};

const parseVector4 = (fields: string[]) => {
  return {
    x: parseFloat(fields[1]),
    y: parseFloat(fields[2]),
    z: parseFloat(fields[3]),
    w: 1.0,
  };
};

export { load };
