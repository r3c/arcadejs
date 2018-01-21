import * as math from "./math";
import * as io from "./io";

interface Map<T> {
	[key: string]: T
}

interface Material {
	colorBase: math.Vector4,
	colorMap?: string
}

interface MaterialMap {
	[name: string]: Material
}

interface Mesh {
	colors?: math.Vector4[],
	coords?: math.Vector2[],
	materialName?: string,
	normals?: math.Vector3[],
	points: math.Vector3[],
	triangles: [number, number, number][]
}

interface Model {
	materials?: MaterialMap,
	meshes: Mesh[]
}

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

class JSONLoader {
	public static load(name: string, instance: any): Model {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "model");

		return {
			materials: instance.materials !== undefined ? JSONLoader.toMapOf(`${name}.materials`, instance.materials, JSONLoader.toMaterial) : {},
			meshes: JSONLoader.toArrayOf(`${name}.meshes`, instance.meshes, JSONLoader.toMesh)
		};
	}

	private static invalid(name: string, instance: any, expected: string) {
		return new Error(`value "${instance}" of property "${name}" is not a valid ${expected}`);
	}

	private static toArrayOf<T>(name: string, instance: any, converter: (name: string, item: any) => T) {
		if (!(instance instanceof Array))
			throw JSONLoader.invalid(name, instance, "array");

		return (<any[]>instance).map((v, i) => converter(name + "[" + i + "]", v));
	}

	private static toColor(name: string, instance: any): math.Vector4 {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "rgb(a) color");

		return {
			x: Math.max(Math.min(JSONLoader.toDecimal(`${name}.r`, instance.r), 1), 0),
			y: Math.max(Math.min(JSONLoader.toDecimal(`${name}.g`, instance.g), 1), 0),
			z: Math.max(Math.min(JSONLoader.toDecimal(`${name}.b`, instance.b), 1), 0),
			w: instance.a !== undefined ? Math.max(Math.min(JSONLoader.toDecimal(`${name}.a`, instance.a), 1), 0) : 1
		};
	}

	private static toCoord(name: string, instance: any): math.Vector2 {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "texture coordinate");

		return {
			x: JSONLoader.toDecimal(`${name}.u`, instance.u),
			y: JSONLoader.toDecimal(`${name}.v`, instance.v)
		};
	}

	private static toDecimal(name: string, instance: any) {
		if (typeof instance !== "number")
			throw JSONLoader.invalid(name, instance, "decimal number");

		return <number>instance;
	}

	private static toInteger(name: string, instance: any) {
		if (typeof instance !== "number" || ~~instance !== instance)
			throw JSONLoader.invalid(name, instance, "integer number");

		return <number>instance;
	}

	private static toMapOf<T>(name: string, instance: any, converter: (name: string, item: any) => T) {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "map");

		const map: Map<T> = {};

		for (const key in instance)
			map[key] = converter(`${name}.${key}`, instance[key]);

		return map;
	}

	private static toMaterial(name: string, instance: any): Material {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "material");

		return {
			colorBase: instance.colorBase !== undefined ? JSONLoader.toColor(`${name}.colorBase`, instance.colorBase) : defaultColor,
			colorMap: instance.colorMap !== undefined ? JSONLoader.toString(`${name}.colorMap`, instance.colorMap) : undefined
		};
	}

	private static toMesh(name: string, instance: any): Mesh {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "mesh");

		return {
			colors: instance.colors !== undefined ? JSONLoader.toArrayOf(`${name}.colors`, instance.colors, JSONLoader.toColor) : undefined,
			coords: instance.coords !== undefined ? JSONLoader.toArrayOf(`${name}.coords`, instance.coords, JSONLoader.toCoord) : undefined,
			triangles: JSONLoader.toArrayOf(`${name}.triangles`, instance.triangles, (name, item) => JSONLoader.toTuple3(name, item, JSONLoader.toInteger)),
			materialName: instance.materialName !== undefined ? JSONLoader.toString(`${name}.materialName`, instance.materialName) : undefined,
			normals: instance.normals !== undefined ? JSONLoader.toArrayOf(`${name}.normals`, instance.normals, JSONLoader.toVertex) : undefined,
			points: JSONLoader.toArrayOf(`${name}.points`, instance.points, JSONLoader.toVertex)
		};
	}

	private static toString(name: string, instance: any): string {
		if (typeof instance !== "string")
			throw JSONLoader.invalid(name, instance, "string");

		return <string>instance;
	}

	private static toTuple3<T>(name: string, instance: any, converter: (name: string, item: any) => T): [T, T, T] {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "3-tuple");

		return [
			converter(`${name}[0]`, instance[0]),
			converter(`${name}[1]`, instance[1]),
			converter(`${name}[2]`, instance[2])
		];
	}

	private static toVertex(name: string, instance: any): math.Vector3 {
		if (typeof instance !== "object")
			throw JSONLoader.invalid(name, instance, "vertex");

		return {
			x: JSONLoader.toDecimal(`${name}.x`, instance.x),
			y: JSONLoader.toDecimal(`${name}.y`, instance.y),
			z: JSONLoader.toDecimal(`${name}.z`, instance.z)
		};
	}
}

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

class WavefrontOBJLoader {
	public static async load(url: string) {
		const request = await io.readURL(io.StringRequest, url);

		return WavefrontOBJLoader.loadObject(request.data, url.substr(0, url.lastIndexOf('/') + 1));
	}

	private static async loadMaterial(materials: MaterialMap, data: string) {
		let current: Material | undefined;

		for (const fields of WavefrontOBJLoader.parseFile(data)) {
			switch (fields[0]) {
				case "Ka": // Ambient light color
					if (fields.length < 4 || current === undefined)
						throw new Error("invalid ambient color instruction");

					current.colorBase = WavefrontOBJLoader.parseVector4(fields);

					break;

				case "Kd": // Diffuse light color
					if (fields.length < 4 || current === undefined)
						throw new Error("invalid diffuse color instruction");

					/*current.diffuseColor = */WavefrontOBJLoader.parseVector4(fields);

					break;


				case "Ks": // Specular light color
					if (fields.length < 4 || current === undefined)
						throw new Error("invalid specular color instruction");

					/*current.specularColor = */WavefrontOBJLoader.parseVector4(fields);

					break;

				case "map_bump": // Height map texture
					if (fields.length < 2 || current === undefined)
						throw new Error("invalid bump map instruction");

					/*current.heightMap = */fields[1];

					break;

				case "map_Ka": // Ambient map texture
					if (fields.length < 2 || current === undefined)
						throw new Error("invalid ambient map instruction");

					current.colorMap = fields[1];

					break;

				case "map_Kd": // Diffuse map texture
					if (fields.length < 2 || current === undefined)
						throw new Error("invalid diffuse map instruction");

					/*current.diffuseMap = */fields[1];

					break;

				case "map_Ks": // Specular map texture
					if (fields.length < 2 || current === undefined)
						throw new Error("invalid specular map instruction");

					/*current.specularMap = */fields[1];

					break;

				case "map_normal": // Normal map texture (custom extension)
					if (fields.length < 2 || current === undefined)
						throw new Error("invalid normal map instruction");

					/*current.normalMap = */fields[1];

					break;

				case "Ns": // Material shininess
					if (fields.length < 2 || current === undefined)
						throw new Error("invalid shininess instruction");

					/*current.specularGloss = */parseFloat(fields[1]);

					break;

				case "newmtl": // New material declaration
					if (fields.length < 2)
						throw new Error("invalid material instruction");

					const material = {
						colorBase: defaultColor
					};

					materials[fields[1]] = material;
					current = material;

					break;
			}
		}
	}

	private static async loadObject(data: string, path: string) {
		const coords = new Array<math.Vector2>();
		const groups: WavefrontOBJGroup[] = [];
		const materials: MaterialMap = {};
		const meshes: Mesh[] = [];
		const normals = new Array<math.Vector3>();
		const points = new Array<math.Vector3>();

		let mustStartNew = true;
		let mustUseMaterial: string | undefined = undefined;

		let current: WavefrontOBJGroup = {
			faces: [],
			materialName: undefined
		};

		// Load raw model data from file
		for (const fields of WavefrontOBJLoader.parseFile(data)) {
			switch (fields[0]) {
				case "f":
					if (fields.length < 4)
						throw Error("invalid face instruction");

					if (mustStartNew) {
						current = {
							faces: [],
							materialName: mustUseMaterial
						};

						groups.push(current);

						mustStartNew = false;
						mustUseMaterial = undefined;
					}

					current.faces.push(fields.slice(1).map(WavefrontOBJLoader.parseFace));

					break;

				case "mtllib":
					if (fields.length < 2)
						throw Error("invalid material library instruction");

					await io
						.readURL(io.StringRequest, path + fields[1])
						.then(request => WavefrontOBJLoader.loadMaterial(materials, request.data));

					break;

				case "usemtl":
					if (fields.length < 2)
						throw Error("invalid use material instruction");

					mustStartNew = true;
					mustUseMaterial = fields[1];

					break;

				case "v":
					if (fields.length < 4)
						throw Error("invalid vertex instruction");

					points.push(WavefrontOBJLoader.parseVector3(fields));

					break;

				case "vn":
					if (fields.length < 4)
						throw Error("invalid normal instruction");

					normals.push(WavefrontOBJLoader.parseVector3(fields));

					break;

				case "vt":
					if (fields.length < 3)
						throw Error("invalid texture instruction");

					coords.push(WavefrontOBJLoader.parseVector2(fields));

					break;
			}
		}

		// Convert groups into meshes by transforming multi-component face indices into scalar batch indices
		for (const group of groups) {
			const batches: WavefrontOBJBatchMap = {};
			const mesh: Mesh = {
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
	
							if (mesh.coords !== undefined)
								mesh.coords.push(coords[vertex.coord || 0]);
	
							if (mesh.normals !== undefined)
								mesh.normals.push(normals[vertex.normal || 0]);
	
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
	}

	private static parseFace(face: string) {
		const indices = face.split(/\//);

		return {
			coord: indices.length > 1 && indices[1].trim() !== '' ? parseInt(indices[1]) - 1 : undefined,
			normal: indices.length > 2 && indices[2].trim() !== '' ? parseInt(indices[2]) - 1 : undefined,
			point: parseInt(indices[0]) - 1
		};
	}

	private static parseFile(data: string) {
		return data
			.split(/[\n\r]+/)
			.map(line => line.trim().split(/[\t ]+/));
	}

	private static parseVector2(fields: string[]) {
		return {
			x: parseFloat(fields[1]),
			y: parseFloat(fields[2])
		};
	}

	private static parseVector3(fields: string[]) {
		return {
			x: parseFloat(fields[1]),
			y: parseFloat(fields[2]),
			z: parseFloat(fields[3])
		};
	}

	private static parseVector4(fields: string[]) {
		return {
			x: parseFloat(fields[1]),
			y: parseFloat(fields[2]),
			z: parseFloat(fields[3]),
			w: 1.0
		};
	}
}

const fromJSON = async (data: string) => {
	return JSONLoader.load("", JSON.parse(data));
}

const fromOBJ = async (url: string) => {
	return WavefrontOBJLoader.load(url);
}

export { Model, fromJSON, fromOBJ };
