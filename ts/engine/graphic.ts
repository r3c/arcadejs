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

class Loader {
	public static fromJSON(json: string): Model {
		return Loader.toModel("", JSON.parse(json));
	}

	private static invalid(name: string, instance: any, expected: string) {
		return new Error(`value "${instance}" of property "${name}" is not a valid ${expected}`);
	}

	private static toArrayOf<T>(name: string, instance: any, converter: (name: string, item: any) => T) {
		if (!(instance instanceof Array))
			throw Loader.invalid(name, instance, "array");

		return (<any[]>instance).map((v, i) => converter(name + "[" + i + "]", v));
	}

	private static toColor(name: string, instance: any): math.Vector4 {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "rgb(a) color");

		return {
			x: Math.max(Math.min(Loader.toDecimal(`${name}.r`, instance.r), 1), 0),
			y: Math.max(Math.min(Loader.toDecimal(`${name}.g`, instance.g), 1), 0),
			z: Math.max(Math.min(Loader.toDecimal(`${name}.b`, instance.b), 1), 0),
			w: instance.a !== undefined ? Math.max(Math.min(Loader.toDecimal(`${name}.a`, instance.a), 1), 0) : 1
		};
	}

	private static toCoord(name: string, instance: any): math.Vector2 {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "texture coordinate");

		return {
			x: Loader.toDecimal(`${name}.u`, instance.u),
			y: Loader.toDecimal(`${name}.v`, instance.v)
		};
	}

	private static toDecimal(name: string, instance: any) {
		if (typeof instance !== "number")
			throw Loader.invalid(name, instance, "decimal number");

		return <number>instance;
	}

	private static toInteger(name: string, instance: any) {
		if (typeof instance !== "number" || ~~instance !== instance)
			throw Loader.invalid(name, instance, "integer number");

		return <number>instance;
	}

	private static toIntegerTuple3(name: string, instance: any): [number, number, number] {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "3-integer tuple");

		return [
			Loader.toInteger(`${name}[0]`, instance[0]),
			Loader.toInteger(`${name}[1]`, instance[1]),
			Loader.toInteger(`${name}[2]`, instance[2])
		];
	}

	private static toMapOf<T>(name: string, instance: any, converter: (name: string, item: any) => T) {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "map");

		const map: Map<T> = {};

		for (const key in instance)
			map[key] = converter(`${name}.${key}`, instance[key]);

		return map;
	}

	private static toMaterial(name: string, instance: any): Material {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "material");

		return {
			colorBase: instance.colorBase !== undefined ? Loader.toColor(`${name}.colorBase`, instance.colorBase) : defaultColor,
			colorMap: instance.colorMap !== undefined ? Loader.toString(`${name}.colorMap`, instance.colorMap) : undefined
		};
	}

	private static toMesh(name: string, instance: any): Mesh {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "mesh");

		return {
			colors: instance.colors !== undefined ? Loader.toArrayOf(`${name}.colors`, instance.colors, Loader.toColor) : undefined,
			coords: instance.coords !== undefined ? Loader.toArrayOf(`${name}.coords`, instance.coords, Loader.toCoord) : undefined,
			indices: Loader.toArrayOf(`${name}.indices`, instance.indices, Loader.toIntegerTuple3),
			materialName: instance.materialName !== undefined ? Loader.toString(`${name}.materialName`, instance.materialName) : undefined,
			normals: instance.normals !== undefined ? Loader.toArrayOf(`${name}.normals`, instance.normals, Loader.toVertex) : undefined,
			points: Loader.toArrayOf(`${name}.points`, instance.points, Loader.toVertex)
		};
	}

	private static toModel(name: string, instance: any): Model {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "model");

		return {
			materials: instance.materials !== undefined ? Loader.toMapOf(`${name}.materials`, instance.materials, Loader.toMaterial) : undefined,
			meshes: Loader.toArrayOf(`${name}.meshes`, instance.meshes, Loader.toMesh)
		};
	}

	private static toString(name: string, instance: any): string {
		if (typeof instance !== "string")
			throw Loader.invalid(name, instance, "string");

		return <string>instance;
	}

	private static toVertex(name: string, instance: any): math.Vector3 {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "vertex");

		return {
			x: Loader.toDecimal(`${name}.x`, instance.x),
			y: Loader.toDecimal(`${name}.y`, instance.y),
			z: Loader.toDecimal(`${name}.z`, instance.z)
		};
	}
}

export { Loader, Model, defaultColor };
