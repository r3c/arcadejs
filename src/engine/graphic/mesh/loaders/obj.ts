import { Matrix4 } from "../../../math/matrix";
import { Library, Material, MaterialReference, Mesh } from "../definition";
import { combinePath, getPathDirectory } from "../../../fs/path";
import { StringFormat, readURL } from "../../../io/stream";
import { Vector2, Vector3 } from "../../../math/vector";

/*
 ** Implementation based on:
 ** http://paulbourke.net/dataformats/obj/
 ** http://paulbourke.net/dataformats/mtl/
 */

type WavefrontOBJConfiguration = {
  variables: Record<string, string>;
};

type WavefrontOBJGroup = {
  faces: WavefrontOBJVertex[][];
  materialName: string | undefined;
};

type WavefrontOBJObject = {
  groups: WavefrontOBJGroup[];
  name: string;
};

type WavefrontOBJVertex = {
  coordinate: number | undefined;
  normal: number | undefined;
  position: number;
};

const invalidFile = (file: string, description: string) => {
  return Error(`${description} in file ${file}`);
};

const invalidLine = (file: string, lineIndex: number, description: string) => {
  return Error(`invalid ${description} in file ${file} at line ${lineIndex}`);
};

const load = async (
  url: string,
  library: Library,
  configuration: Partial<WavefrontOBJConfiguration> | undefined
): Promise<Mesh> => {
  const data = await readURL(StringFormat, url);

  return loadObject(data, url, library, configuration?.variables ?? {});
};

const loadMaterial = async (
  materials: Map<string | undefined, Material>,
  data: string,
  fileName: string,
  library: Library,
  variables: Record<string, string>
) => {
  const directory = getPathDirectory(fileName);

  let materialName: string | undefined;
  let materialReference: MaterialReference | undefined;

  for (const { fields, lineIndex } of parseFile(data, fileName, variables)) {
    switch (fields[0]) {
      case "#":
      case "d": // Transparency (not supported)
      case "illum": // Illumination model (not supported)
      case "Ka": // Ambient color (not supported)
      case "Ni": // Optical density (not supported)
      case "Tr": // Transparency (not supported)
        break;

      case "Kd": // Diffuse color
        if (fields.length < 4 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "diffuse color");
        }

        materialReference.diffuseColor = parseVector4(fields);

        break;

      case "Ke": // Emissive color
        if (fields.length < 4 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "emissive color");
        }

        materialReference.emissiveColor = parseVector4(fields);

        break;

      case "Ks": // Specular color
        if (fields.length < 4 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "specular color");
        }

        materialReference.specularColor = parseVector4(fields);

        break;

      case "map_bump": // Bump map texture
        if (fields.length < 2 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "bump map");
        }

        materialReference.heightPath = combinePath(directory, fields[1]);

        break;

      case "map_Kd": // Diffuse map texture
        if (fields.length < 2 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "diffuse map");
        }

        materialReference.diffusePath = combinePath(directory, fields[1]);

        break;

      case "map_Ks": // Specular map texture
        if (fields.length < 2 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "specular map");
        }

        materialReference.specularPath = combinePath(directory, fields[1]);

        break;

      case "map_normal": // Normal map texture (custom extension)
        if (fields.length < 2 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "normal map");
        }

        materialReference.normalPath = combinePath(directory, fields[1]);

        break;

      case "Ns": // Material shininess
        if (fields.length < 2 || materialReference === undefined) {
          throw invalidLine(fileName, lineIndex, "shininess");
        }

        materialReference.shininess = parseFloat(fields[1]);

        break;

      case "newmtl": // New material declaration
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "material");
        }

        if (materialReference !== undefined) {
          const material = await library.getOrLoadMaterial(materialReference);

          materials.set(materialName, material);
        }

        materialName = fields[1];
        materialReference = {};

        break;

      default:
        throw invalidLine(fileName, lineIndex, `prefix '${fields[0]}'`);
    }
  }

  if (materialReference !== undefined) {
    const material = await library.getOrLoadMaterial(materialReference);

    materials.set(materialName, material);
  }
};

const loadObject = async (
  data: string,
  fileName: string,
  library: Library,
  variables: Record<string, string>
): Promise<Mesh> => {
  const allCoordinates: Vector2[] = [];
  const allMaterials = new Map<string | undefined, Material>();
  const allNormals: Vector3[] = [];
  const allPositions: Vector3[] = [];

  let currentGroup: WavefrontOBJGroup = {
    faces: [],
    materialName: undefined,
  };

  let currentObject: WavefrontOBJObject = {
    groups: [currentGroup],
    name: "default",
  };

  const objects: WavefrontOBJObject[] = [currentObject];

  // Load raw model data from file
  for (const { fields, lineIndex } of parseFile(data, fileName, variables)) {
    switch (fields[0]) {
      case "#":
      case "s": // Smooth shading (not supported)
        break;

      case "f":
        if (fields.length < 4) {
          throw invalidLine(fileName, lineIndex, "face definition");
        }

        currentGroup.faces.push(fields.slice(1).map(parseFace));

        break;

      case "mtllib":
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "material library reference");
        }

        const directory = getPathDirectory(fileName);
        const libraryPath = combinePath(directory, fields[1]);
        const libraryData = await readURL(StringFormat, libraryPath);

        await loadMaterial(
          allMaterials,
          libraryData,
          libraryPath,
          library,
          variables
        );

        break;

      case "o":
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "object name");
        }

        if (
          currentObject.groups.length > 0 &&
          currentObject.groups[0].faces.length > 0
        ) {
          currentObject = { groups: [], name: fields[1] };

          objects.push(currentObject);
        } else {
          currentObject.name = fields[1];
        }

        break;

      case "usemtl":
        if (fields.length < 2) {
          throw invalidLine(fileName, lineIndex, "material use");
        }

        // If current group isn't empty create a new one, otherwise reuse it
        if (currentGroup.faces.length > 0) {
          currentGroup = {
            faces: [],
            materialName: fields[1],
          };

          currentObject.groups.push(currentGroup);
        } else {
          currentGroup.materialName = fields[1];
        }

        break;

      case "v":
        if (fields.length < 4) {
          throw invalidLine(fileName, lineIndex, "vertex");
        }

        allPositions.push(parseVector3(fields));

        break;

      case "vn":
        if (fields.length < 4) {
          throw invalidLine(fileName, lineIndex, "normal");
        }

        allNormals.push(parseVector3(fields));

        break;

      case "vt":
        if (fields.length < 3) {
          throw invalidLine(fileName, lineIndex, "texture");
        }

        allCoordinates.push(parseVector2(fields));

        break;

      default:
        throw invalidLine(fileName, lineIndex, `prefix '${fields[0]}'`);
    }
  }

  // Convert
  const children = objects.map((obj) => {
    // Convert groups into polygons by transforming multi-component face indices into scalar indices
    const polygons = obj.groups.map((group) => {
      const coordinates: Vector2[] = [];
      const indexByKey = new Map<string, number>();
      const indices: Vector3[] = [];
      const normals: Vector3[] = [];
      const positions: Vector3[] = [];

      // Convert faces into triangles, a face with N vertices defines N-2 triangles with
      // vertices [0, i + 1, i + 2] for 0 <= i < N - 2 (equivalent to gl.TRIANGLE_FAN mode)
      for (const face of group.faces) {
        for (let triangle = 0; triangle + 2 < face.length; ++triangle) {
          const faceIndices = [];

          for (let faceIndex of [0, triangle + 1, triangle + 2]) {
            const { coordinate, normal, position } = face[faceIndex];
            const key = position + "/" + coordinate + "/" + normal;

            let index = indexByKey.get(key);

            if (index === undefined) {
              index = indexByKey.size;

              indexByKey.set(key, index);

              if (allCoordinates.length > 0) {
                if (coordinate === undefined) {
                  throw invalidFile(
                    fileName,
                    "faces must include texture coordinate index if file specify them"
                  );
                }

                if (coordinate < 0 || coordinate >= allCoordinates.length) {
                  throw invalidFile(
                    fileName,
                    `invalid texture coordinate index ${coordinate}`
                  );
                }

                coordinates.push(allCoordinates[coordinate]);
              }

              if (allNormals.length > 0) {
                if (normal === undefined) {
                  throw invalidFile(
                    fileName,
                    "faces must include normal index if file specify them"
                  );
                }

                if (normal < 0 || normal >= allNormals.length) {
                  throw invalidFile(fileName, `invalid normal index ${normal}`);
                }

                normals.push(allNormals[normal]);
              }

              if (position < 0 || position >= allPositions.length) {
                throw invalidFile(fileName, `invalid vertex index ${position}`);
              }

              positions.push(allPositions[position]);
            }

            faceIndices.push(index);
          }

          indices.push(Vector3.fromZero(["setFromArray", faceIndices]));
        }
      }

      const material = allMaterials.get(group.materialName);

      return { coordinates, indices, material, normals, positions };
    });

    return {
      children: [],
      polygons,
      transform: Matrix4.identity,
    };
  });

  return { children, polygons: [], transform: Matrix4.identity };
};

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

function* parseFile(
  data: string,
  fileName: string,
  variables: Record<string, string>
) {
  const regexp = /.*(?:\n\r|\r\n|\n|\r|$)/g;

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
      fields: Object.entries(variables)
        .reduce(
          (tail, [name, value]) => tail.replaceAll(`{{${name}}}`, value),
          line
        )
        .split(/[\t ]+/),
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
