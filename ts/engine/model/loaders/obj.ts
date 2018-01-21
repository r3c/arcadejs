import * as io from "../../io";
import * as math from "../../math";
import * as mesh from "../mesh";
import * as path from "../../fs/path";

interface WavefrontOBJBatchMap {
	[key: string]: number
}

interface WavefrontOBJGroup {
	faces: WavefrontOBJVertex[][],
	materialName: string | undefined
}

interface WavefrontOBJVertex {
	coord: number | undefined,
	normal: number | undefined,
	point: number
}

const invalidFile = (file: string, description: string) => {
	return new Error(`${description} in file ${file}`);
};

const invalidLine = (file: string, line: number, description: string) => {
	return new Error(`invalid ${description} in file ${file} at line ${line}`);
};

const load = async (url: string) => {
	const data = await io.readURL(io.StringFormat, url);

	return loadObject(data, url);
};

const loadMaterial = async (materials: { [name: string]: mesh.Material }, data: string, fileName: string) => {
	let current: mesh.Material | undefined;

	for (const { line, fields } of parseFile(data)) {
		switch (fields[0]) {
			case "Ka": // Ambient light color
				if (fields.length < 4 || current === undefined)
					throw invalidLine(fileName, line, "ambient color");

				current.colorBase = parseVector4(fields);

				break;

			case "Kd": // Diffuse light color
				if (fields.length < 4 || current === undefined)
					throw invalidLine(fileName, line, "diffuse color");

				/*current.diffuseColor = */parseVector4(fields);

				break;


			case "Ks": // Specular light color
				if (fields.length < 4 || current === undefined)
					throw invalidLine(fileName, line, "specular color");

				/*current.specularColor = */parseVector4(fields);

				break;

			case "map_bump": // Bump map texture
				if (fields.length < 2 || current === undefined)
					throw invalidLine(fileName, line, "bump color");

				/*current.bumpMap = */fields[1];

				break;

			case "map_Ka": // Ambient map texture
				if (fields.length < 2 || current === undefined)
					throw invalidLine(fileName, line, "ambient map");

				const directory = path.directory(fileName);
				const texture = path.combine(directory, fields[1]);

				current.colorMap = await mesh.loadImage(texture);

				break;

			case "map_Kd": // Diffuse map texture
				if (fields.length < 2 || current === undefined)
					throw invalidLine(fileName, line, "diffuse map");

				/*current.diffuseMap = */fields[1];

				break;

			case "map_Ks": // Specular map texture
				if (fields.length < 2 || current === undefined)
					throw invalidLine(fileName, line, "specular map");

				/*current.specularMap = */fields[1];

				break;

			case "map_normal": // Normal map texture (custom extension)
				if (fields.length < 2 || current === undefined)
					throw invalidLine(fileName, line, "normal map");

				/*current.normalMap = */fields[1];

				break;

			case "Ns": // Material shininess
				if (fields.length < 2 || current === undefined)
					throw invalidLine(fileName, line, "shininess");

				/*current.specularGloss = */parseFloat(fields[1]);

				break;

			case "newmtl": // New material declaration
				if (fields.length < 2)
					throw invalidLine(fileName, line, "material");

				const material = {
					colorBase: mesh.defaultColor,
					colorMap: mesh.defaultMap
				};

				materials[fields[1]] = material;
				current = material;

				break;
		}
	}
};

const loadObject = async (data: string, fileName: string) => {
	const coords = new Array<math.Vector2>();
	const groups: WavefrontOBJGroup[] = [];
	const materials: { [name: string]: mesh.Material } = {};
	const meshes: mesh.Mesh[] = [];
	const normals = new Array<math.Vector3>();
	const points = new Array<math.Vector3>();

	let mustStartNew = true;
	let mustUseMaterial: string | undefined = undefined;

	let current: WavefrontOBJGroup = {
		faces: [],
		materialName: undefined
	};

	// Load raw model data from file
	for (const { line, fields } of parseFile(data)) {
		switch (fields[0]) {
			case "f":
				if (fields.length < 4)
					throw invalidLine(fileName, line, "face definition");

				if (mustStartNew) {
					current = {
						faces: [],
						materialName: mustUseMaterial
					};

					groups.push(current);

					mustStartNew = false;
					mustUseMaterial = undefined;
				}

				current.faces.push(fields.slice(1).map(parseFace));

				break;

			case "mtllib":
				if (fields.length < 2)
					throw invalidLine(fileName, line, "material library reference");

				const directory = path.directory(fileName);
				const library = path.combine(directory, fields[1]);

				await io
					.readURL(io.StringFormat, library)
					.then(data => loadMaterial(materials, data, library));

				break;

			case "usemtl":
				if (fields.length < 2)
					throw invalidLine(fileName, line, "material use");

				mustStartNew = true;
				mustUseMaterial = fields[1];

				break;

			case "v":
				if (fields.length < 4)
					throw invalidLine(fileName, line, "vertex");

				points.push(parseVector3(fields));

				break;

			case "vn":
				if (fields.length < 4)
					throw invalidLine(fileName, line, "normal");

				normals.push(parseVector3(fields));

				break;

			case "vt":
				if (fields.length < 3)
					throw invalidLine(fileName, line, "texture");

				coords.push(parseVector2(fields));

				break;
		}
	}

	// Convert groups into meshes by transforming multi-component face indices into scalar batch indices
	for (const group of groups) {
		const batches: WavefrontOBJBatchMap = {};
		const mesh: mesh.Mesh = {
			coords: coords.length > 0 ? [] : undefined,
			triangles: [],
			materialName: group.materialName,
			normals: normals.length > 0 ? [] : undefined,
			points: []
		};

		// Convert faces into triangles, a face with N vertices defines N-2 triangles with
		// vertices [0, i + 1, i + 2] for 0 <= i < N - 2 (equivalent to gl.TRIANGLE_FAN mode)
		for (const face of group.faces) {
			for (let triangle = 0; triangle + 2 < face.length; ++triangle) {
				const indices: [number, number, number] = [0, 0, 0];

				for (let i = 0; i < 3; ++i) {
					const vertex = face[i === 0 ? i : triangle + i];
					const key = vertex.point + '/' + vertex.coord + '/' + vertex.normal;

					if (batches[key] === undefined) {
						batches[key] = mesh.points.length;

						if (mesh.coords !== undefined) {
							if (vertex.coord === undefined)
								throw invalidFile(fileName, "faces must include texture coordinate index if file specify them");

							if (vertex.coord < 0 || vertex.coord >= coords.length)
								throw invalidFile(fileName, `invalid texture coordinate index ${vertex.coord}`);

							mesh.coords.push(coords[vertex.coord]);
						}

						if (mesh.normals !== undefined) {
							if (vertex.normal === undefined)
								throw invalidFile(fileName, "faces must include normal index if file specify them");

							if (vertex.normal < 0 || vertex.normal >= normals.length)
								throw invalidFile(fileName, `invalid normal index ${vertex.normal}`);

							mesh.normals.push(normals[vertex.normal]);
						}

						if (vertex.point < 0 || vertex.point >= points.length)
							throw invalidFile(fileName, `invalid vertex index ${vertex.point}`);

						mesh.points.push(points[vertex.point]);
					}

					indices[i] = batches[key];
				}

				mesh.triangles.push(indices);
			}
		}

		meshes.push(mesh);
	}

	return {
		materials: materials,
		meshes: meshes
	};
};

const parseFace = (face: string) => {
	const indices = face.split(/\//);

	return {
		coord: indices.length > 1 && indices[1].trim() !== '' ? parseInt(indices[1]) - 1 : undefined,
		normal: indices.length > 2 && indices[2].trim() !== '' ? parseInt(indices[2]) - 1 : undefined,
		point: parseInt(indices[0]) - 1
	};
};

function* parseFile(data: string) {
	const regexp = /(?:.*(?:\n\r|\r\n|\n|\r)|.+$)/g;

	for (let line = 1; true; ++line) {
		const match = regexp.exec(data);

		if (match === null)
			break;

		yield {
			fields: match[0].trim().split(/[\t ]+/),
			line: line
		};
	}
};

const parseVector2 = (fields: string[]) => {
	return {
		x: parseFloat(fields[1]),
		y: parseFloat(fields[2])
	};
};

const parseVector3 = (fields: string[]) => {
	return {
		x: parseFloat(fields[1]),
		y: parseFloat(fields[2]),
		z: parseFloat(fields[3])
	};
};

const parseVector4 = (fields: string[]) => {
	return {
		x: parseFloat(fields[1]),
		y: parseFloat(fields[2]),
		z: parseFloat(fields[3]),
		w: 1.0
	};
};

export { load }
