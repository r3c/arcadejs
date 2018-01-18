import * as math from "./math";

interface Map<T> {
	[key: string]: T;
}

interface Material {
	colorBase: math.Vector4,
	colorMap?: string;
}

interface MaterialMap {
	[name: string]: Material;
}

interface Mesh {
	colors?: math.Vector4[];
	coords?: math.Vector2[];
	indices: [number, number, number][];
	materialName?: string;
	normals?: math.Vector3[];
	points: math.Vector3[];
}

interface Model {
	materials?: MaterialMap;
	meshes: Mesh[];
}

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

class JsonLoader {
	public static load(name: string, instance: any): Model {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "model");

		return {
			materials: instance.materials !== undefined ? JsonLoader.toMapOf(`${name}.materials`, instance.materials, JsonLoader.toMaterial) : undefined,
			meshes: JsonLoader.toArrayOf(`${name}.meshes`, instance.meshes, JsonLoader.toMesh)
		};
	}

	private static invalid(name: string, instance: any, expected: string) {
		return new Error(`value "${instance}" of property "${name}" is not a valid ${expected}`);
	}

	private static toArrayOf<T>(name: string, instance: any, converter: (name: string, item: any) => T) {
		if (!(instance instanceof Array))
			throw JsonLoader.invalid(name, instance, "array");

		return (<any[]>instance).map((v, i) => converter(name + "[" + i + "]", v));
	}

	private static toColor(name: string, instance: any): math.Vector4 {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "rgb(a) color");

		return {
			x: Math.max(Math.min(JsonLoader.toDecimal(`${name}.r`, instance.r), 1), 0),
			y: Math.max(Math.min(JsonLoader.toDecimal(`${name}.g`, instance.g), 1), 0),
			z: Math.max(Math.min(JsonLoader.toDecimal(`${name}.b`, instance.b), 1), 0),
			w: instance.a !== undefined ? Math.max(Math.min(JsonLoader.toDecimal(`${name}.a`, instance.a), 1), 0) : 1
		};
	}

	private static toCoord(name: string, instance: any): math.Vector2 {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "texture coordinate");

		return {
			x: JsonLoader.toDecimal(`${name}.u`, instance.u),
			y: JsonLoader.toDecimal(`${name}.v`, instance.v)
		};
	}

	private static toDecimal(name: string, instance: any) {
		if (typeof instance !== "number")
			throw JsonLoader.invalid(name, instance, "decimal number");

		return <number>instance;
	}

	private static toInteger(name: string, instance: any) {
		if (typeof instance !== "number" || ~~instance !== instance)
			throw JsonLoader.invalid(name, instance, "integer number");

		return <number>instance;
	}

	private static toMapOf<T>(name: string, instance: any, converter: (name: string, item: any) => T) {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "map");

		const map: Map<T> = {};

		for (const key in instance)
			map[key] = converter(`${name}.${key}`, instance[key]);

		return map;
	}

	private static toMaterial(name: string, instance: any): Material {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "material");

		return {
			colorBase: instance.colorBase !== undefined ? JsonLoader.toColor(`${name}.colorBase`, instance.colorBase) : defaultColor,
			colorMap: instance.colorMap !== undefined ? JsonLoader.toString(`${name}.colorMap`, instance.colorMap) : undefined
		};
	}

	private static toMesh(name: string, instance: any): Mesh {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "mesh");

		return {
			colors: instance.colors !== undefined ? JsonLoader.toArrayOf(`${name}.colors`, instance.colors, JsonLoader.toColor) : undefined,
			coords: instance.coords !== undefined ? JsonLoader.toArrayOf(`${name}.coords`, instance.coords, JsonLoader.toCoord) : undefined,
			indices: JsonLoader.toArrayOf(`${name}.indices`, instance.indices, (name, item) => JsonLoader.toTuple3(name, item, JsonLoader.toInteger)),
			materialName: instance.materialName !== undefined ? JsonLoader.toString(`${name}.materialName`, instance.materialName) : undefined,
			normals: instance.normals !== undefined ? JsonLoader.toArrayOf(`${name}.normals`, instance.normals, JsonLoader.toVertex) : undefined,
			points: JsonLoader.toArrayOf(`${name}.points`, instance.points, JsonLoader.toVertex)
		};
	}

	private static toString(name: string, instance: any): string {
		if (typeof instance !== "string")
			throw JsonLoader.invalid(name, instance, "string");

		return <string>instance;
	}

	private static toTuple3<T>(name: string, instance: any, converter: (name: string, item: any) => T): [T, T, T] {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "3-tuple");

		return [
			converter(`${name}[0]`, instance[0]),
			converter(`${name}[1]`, instance[1]),
			converter(`${name}[2]`, instance[2])
		];
	}

	private static toVertex(name: string, instance: any): math.Vector3 {
		if (typeof instance !== "object")
			throw JsonLoader.invalid(name, instance, "vertex");

		return {
			x: JsonLoader.toDecimal(`${name}.x`, instance.x),
			y: JsonLoader.toDecimal(`${name}.y`, instance.y),
			z: JsonLoader.toDecimal(`${name}.z`, instance.z)
		};
	}
}

class Loader {
	public static fromJSON(json: string): Model {
		return JsonLoader.load("", JSON.parse(json));
	}
}

export { Loader, Model };
