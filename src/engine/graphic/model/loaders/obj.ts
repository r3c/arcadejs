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
import { Vector2, Vector3 } from "../../../math/vector";

/*
 ** Implementation based on:
 ** http://paulbourke.net/dataformats/obj/
 ** http://paulbourke.net/dataformats/mtl/
 */

interface WavefrontOBJBatchMap {
  [key: string]: number;
}

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

const invalidLine = (file: string, line: number, description: string) => {
  return Error(`invalid ${description} in file ${file} at line ${line}`);
};

const load = async (url: string): Promise<Model> => {
  const data = await stream.readURL(stream.StringFormat, url);

  return loadObject(data, url);
};

const loadMaterial = async (
  materials: Map<string, Material>,
  data: string,
  fileName: string
) => {
  let current: Material | undefined;

  for (const { line, fields } of parseFile(data)) {
    switch (fields[0]) {
      case "Kd": // Diffuse light color
        if (fields.length < 4 || current === undefined) {
          throw invalidLine(fileName, line, "albedo color");
        }

        current.albedoFactor = parseVector4(fields);

        break;

      case "Ks": // Specular light color
        if (fields.length < 4 || current === undefined) {
          throw invalidLine(fileName, line, "gloss color");
        }

        current.glossFactor = parseVector4(fields);

        break;

      case "map_bump": // Bump map texture
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, line, "bump map");
        }

        current.heightMap = await loadTexture(fileName, fields[1]);

        break;

      case "map_Kd": // Diffuse map texture
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, line, "albedo map");
        }

        current.albedoMap = await loadTexture(fileName, fields[1]);

        break;

      case "map_Ks": // Specular map texture
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, line, "specular map");
        }

        current.glossMap = await loadTexture(fileName, fields[1]);

        break;

      case "map_normal": // Normal map texture (custom extension)
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, line, "normal map");
        }

        current.normalMap = await loadTexture(fileName, fields[1]);

        break;

      case "Ns": // Material shininess
        if (fields.length < 2 || current === undefined) {
          throw invalidLine(fileName, line, "shininess");
        }

        current.shininess = parseFloat(fields[1]);

        break;

      case "newmtl": // New material declaration
        if (fields.length < 2) {
          throw invalidLine(fileName, line, "material");
        }

        const material = {};

        materials.set(fields[1], material);
        current = material;

        break;
    }
  }
};

const loadObject = async (data: string, fileName: string): Promise<Model> => {
  const coordinates: Vector2[] = [];
  const polygons: Polygon[] = [];
  const groups: WavefrontOBJGroup[] = [];
  const materials = new Map<string, Material>();
  const normals: Vector3[] = [];
  const positions: Vector3[] = [];

  let mustStartNew = true;
  let mustUseMaterial: string | undefined = undefined;

  let current: WavefrontOBJGroup = {
    faces: [],
    materialName: undefined,
  };

  // Load raw model data from file
  for (const { line, fields } of parseFile(data)) {
    switch (fields[0]) {
      case "f":
        if (fields.length < 4) {
          throw invalidLine(fileName, line, "face definition");
        }

        if (mustStartNew) {
          current = {
            faces: [],
            materialName: mustUseMaterial,
          };

          groups.push(current);

          mustStartNew = false;
          mustUseMaterial = undefined;
        }

        current.faces.push(fields.slice(1).map(parseFace));

        break;

      case "mtllib":
        if (fields.length < 2) {
          throw invalidLine(fileName, line, "material library reference");
        }

        const directory = path.directory(fileName);
        const library = path.combine(directory, fields[1]);

        await stream
          .readURL(stream.StringFormat, library)
          .then((data) => loadMaterial(materials, data, library));

        break;

      case "usemtl":
        if (fields.length < 2) {
          throw invalidLine(fileName, line, "material use");
        }

        mustStartNew = true;
        mustUseMaterial = fields[1];

        break;

      case "v":
        if (fields.length < 4) {
          throw invalidLine(fileName, line, "vertex");
        }

        positions.push(parseVector3(fields));

        break;

      case "vn":
        if (fields.length < 4) {
          throw invalidLine(fileName, line, "normal");
        }

        normals.push(parseVector3(fields));

        break;

      case "vt":
        if (fields.length < 3) {
          throw invalidLine(fileName, line, "texture");
        }

        coordinates.push(parseVector2(fields));

        break;
    }
  }

  // Convert groups into meshes by transforming multi-component face indices into scalar batch indices
  for (const group of groups) {
    const batches: WavefrontOBJBatchMap = {};
    const groupCoordinates: Vector2[] = [];
    const groupIndices: number[] = [];
    const groupNormals: Vector3[] = [];
    const groupPositions: Vector3[] = [];

    // Convert faces into triangles, a face with N vertices defines N-2 triangles with
    // vertices [0, i + 1, i + 2] for 0 <= i < N - 2 (equivalent to gl.TRIANGLE_FAN mode)
    for (const face of group.faces) {
      for (let triangle = 0; triangle + 2 < face.length; ++triangle) {
        for (let i = 0; i < 3; ++i) {
          const vertex = face[i === 0 ? i : triangle + i];
          const key =
            vertex.position + "/" + vertex.coordinate + "/" + vertex.normal;

          if (batches[key] === undefined) {
            batches[key] = positions.length;

            if (coordinates.length > 0) {
              if (vertex.coordinate === undefined)
                throw invalidFile(
                  fileName,
                  "faces must include texture coordinate index if file specify them"
                );

              if (
                vertex.coordinate < 0 ||
                vertex.coordinate >= coordinates.length
              )
                throw invalidFile(
                  fileName,
                  `invalid texture coordinate index ${vertex.coordinate}`
                );

              groupCoordinates.push(coordinates[vertex.coordinate]);
            }

            if (normals.length > 0) {
              if (vertex.normal === undefined)
                throw invalidFile(
                  fileName,
                  "faces must include normal index if file specify them"
                );

              if (vertex.normal < 0 || vertex.normal >= normals.length)
                throw invalidFile(
                  fileName,
                  `invalid normal index ${vertex.normal}`
                );

              groupNormals.push(normals[vertex.normal]);
            }

            if (vertex.position < 0 || vertex.position >= positions.length)
              throw invalidFile(
                fileName,
                `invalid vertex index ${vertex.position}`
              );

            groupPositions.push(positions[vertex.position]);
          }

          groupIndices.push(batches[key]);
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
  image: await image.loadFromURL(
    path.combine(path.directory(fileName), textureName)
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

function* parseFile(data: string) {
  const regexp = /(?:.*(?:\n\r|\r\n|\n|\r)|.+$)/g;

  for (let line = 1; true; ++line) {
    const match = regexp.exec(data);

    if (match === null) break;

    yield {
      fields: match[0].trim().split(/[\t ]+/),
      line,
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
