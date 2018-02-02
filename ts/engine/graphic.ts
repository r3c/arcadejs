import * as math from "./math";

interface Map<T> {
	[key: string]: T;
}

interface Material {
	ambientMap?: string;
}

interface MaterialMap {
	[name: string]: Material;
}

interface Mesh {
	colors?: math.Vector4[];
	faces: [number, number, number][];
	materialName?: string;
	normals?: math.Vector3[];
	positions: math.Vector3[];
}

interface Model {
	materials?: MaterialMap;
	meshes: Mesh[];
}

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
			ambientMap: instance.ambientMap !== undefined ? Loader.toString(`${name}.ambientMap`, instance.ambientMap) : undefined
		};
	}

	private static toMesh(name: string, instance: any): Mesh {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "mesh");

		return {
			colors: instance.colors !== undefined ? Loader.toArrayOf(`${name}.colors`, instance.colors, Loader.toVector4) : undefined,
			faces: Loader.toArrayOf(`${name}.faces`, instance.faces, Loader.toIntegerTuple3),
			materialName: instance.materialName !== undefined ? Loader.toString(`${name}.materialName`, instance.materialName) : undefined,
			normals: instance.normals !== undefined ? Loader.toArrayOf(`${name}.normals`, instance.normals, Loader.toVector3) : undefined,
			positions: Loader.toArrayOf(`${name}.positions`, instance.positions, Loader.toVector3)
		};
	}

	private static toModel(name: string, instance: any): Model {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "model");

		return {
			materials: Loader.toMapOf(`${name}.materials`, instance.materials, Loader.toMaterial),
			meshes: Loader.toArrayOf(`${name}.meshes`, instance.meshes, Loader.toMesh)
		};
	}

	private static toString(name: string, instance: any): string {
		if (typeof instance !== "string")
			throw Loader.invalid(name, instance, "string");

		return <string>instance;
	}

	private static toVector3(name: string, instance: any): math.Vector3 {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "3-dimensional vector");

		return {
			x: Loader.toDecimal(`${name}.x`, instance.x),
			y: Loader.toDecimal(`${name}.y`, instance.y),
			z: Loader.toDecimal(`${name}.z`, instance.z)
		};
	}

	private static toVector4(name: string, instance: any): math.Vector4 {
		if (typeof instance !== "object")
			throw Loader.invalid(name, instance, "4-dimensional vector");

		return {
			x: Loader.toDecimal(`${name}.x`, instance.x),
			y: Loader.toDecimal(`${name}.y`, instance.y),
			z: Loader.toDecimal(`${name}.z`, instance.z),
			w: Loader.toDecimal(`${name}.w`, instance.w)
		};
	}
}

export { Loader, Model };
