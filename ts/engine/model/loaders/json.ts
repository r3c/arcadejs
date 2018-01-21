import * as io from "../../io";
import * as math from "../../math";
import * as mesh from "../mesh";

const load = async (urlOrData: any) => {
	let directory: string;
	let root: any;

	if (typeof urlOrData === "string") {
		const url = <string>urlOrData;

		directory = url.substr(0, url.lastIndexOf('/') + 1); // FIXME: path.base
		root = await io.readURL(io.JSONRequest, url);
	}
	else if (typeof urlOrData === "object") {
		directory = "";
		root = urlOrData;
	}
	else
		throw invalid(name, root, "model");

	return {
		materials: root.materials !== undefined
			? await toMapOf("materials", root.materials, toMaterial, directory)
			: {},
		meshes: toArrayOf("meshes", root.meshes, toMesh)
	};
};

const invalid = (name: string, instance: any, expected: string) => {
	return new Error(`value "${instance}" of property "${name}" is not a valid ${expected}`);
};

const toArrayOf = <T>(name: string, instance: any, converter: (name: string, item: any) => T) => {
	if (!(instance instanceof Array))
		throw invalid(name, instance, "array");

	return (<any[]>instance).map((v, i) => converter(name + "[" + i + "]", v));
};

const toColor = (name: string, instance: any): math.Vector4 => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "rgb(a) color");

	return {
		x: Math.max(Math.min(toDecimal(`${name}.r`, instance.r), 1), 0),
		y: Math.max(Math.min(toDecimal(`${name}.g`, instance.g), 1), 0),
		z: Math.max(Math.min(toDecimal(`${name}.b`, instance.b), 1), 0),
		w: instance.a !== undefined ? Math.max(Math.min(toDecimal(`${name}.a`, instance.a), 1), 0) : 1
	};
};

const toCoord = (name: string, instance: any): math.Vector2 => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "texture coordinate");

	return {
		x: toDecimal(`${name}.u`, instance.u),
		y: toDecimal(`${name}.v`, instance.v)
	};
};

const toDecimal = (name: string, instance: any) => {
	if (typeof instance !== "number")
		throw invalid(name, instance, "decimal number");

	return <number>instance;
};

const toInteger = (name: string, instance: any) => {
	if (typeof instance !== "number" || ~~instance !== instance)
		throw invalid(name, instance, "integer number");

	return <number>instance;
};

const toMapOf = async <T>(name: string, instance: any, converter: (name: string, item: any, directory: string) => Promise<T>, directory: string) => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "map");

	const map: { [key: string]: T } = {};

	for (const key in instance)
		map[key] = await converter(`${name}.${key}`, instance[key], directory);

	return map;
};

const toMaterial = async (name: string, instance: any, directory: string) => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "material");

	return {
		colorBase: instance.colorBase !== undefined
			? toColor(`${name}.colorBase`, instance.colorBase)
			: mesh.defaultColor,
		colorMap: instance.colorMap !== undefined
			? await mesh.loadImage(toString(`${name}.colorMap`, directory + instance.colorMap)) // FIXME: path.combine
			: mesh.defaultMap
	};
};

const toMesh = (name: string, instance: any): mesh.Mesh => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "mesh");

	return {
		colors: instance.colors !== undefined ? toArrayOf(`${name}.colors`, instance.colors, toColor) : undefined,
		coords: instance.coords !== undefined ? toArrayOf(`${name}.coords`, instance.coords, toCoord) : undefined,
		triangles: toArrayOf(`${name}.triangles`, instance.triangles, (name, item) => toTuple3(name, item, toInteger)),
		materialName: instance.materialName !== undefined ? toString(`${name}.materialName`, instance.materialName) : undefined,
		normals: instance.normals !== undefined ? toArrayOf(`${name}.normals`, instance.normals, toVertex) : undefined,
		points: toArrayOf(`${name}.points`, instance.points, toVertex)
	};
};

const toString = (name: string, instance: any): string => {
	if (typeof instance !== "string")
		throw invalid(name, instance, "string");

	return <string>instance;
};

const toTuple3 = <T>(name: string, instance: any, converter: (name: string, item: any) => T): [T, T, T] => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "3-tuple");

	return [
		converter(`${name}[0]`, instance[0]),
		converter(`${name}[1]`, instance[1]),
		converter(`${name}[2]`, instance[2])
	];
};

const toVertex = (name: string, instance: any): math.Vector3 => {
	if (typeof instance !== "object")
		throw invalid(name, instance, "vertex");

	return {
		x: toDecimal(`${name}.x`, instance.x),
		y: toDecimal(`${name}.y`, instance.y),
		z: toDecimal(`${name}.z`, instance.z)
	};
};

export { load }
