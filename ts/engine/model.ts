import * as io from "./io";
import * as json from "./model/loaders/json";
import * as math from "./math";
import * as mesh from "./model/mesh";
import * as obj from "./model/loaders/obj";
import * as tds from "./model/loaders/3ds";

interface Model {
	materials?: { [key: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

const defaultMaterial: mesh.Material = {
	colorBase: mesh.defaultColor,
	colorMap: mesh.defaultMap
};

/*
** Based on:
** http://www.iquilezles.org/www/articles/normals/normals.htm
*/
const finalizeNormals = (triangles: [number, number, number][], points: math.Vector3[]) => {
	const normals = [];

	for (const [index1, index2, index3] of triangles) {
		const point1 = points[index1];
		const point2 = points[index2];
		const point3 = points[index3];

		const u = {
			x: point1.x - point2.x,
			y: point1.y - point2.y,
			z: point1.z - point2.z
		};

		const v = {
			x: point3.x - point2.x,
			y: point3.y - point2.y,
			z: point3.z - point2.z
		};

		const normal = math.Vector.normalize3({
			x: u.y * v.z - u.z * v.y,
			y: u.z * v.x - u.x * v.z,
			z: u.x * v.y - u.y * v.x
		});

		normals[index1] = normal;
		normals[index2] = normal;
		normals[index3] = normal;
	}

	return normals;
};

const finalize = (model: Model) => {
	for (const mesh of model.meshes) {
		if (mesh.normals === undefined)
			mesh.normals = finalizeNormals(mesh.triangles, mesh.points);
	}

	return model;
};

const from3DS = async (url: string) => {
	return tds.load(url).then(finalize);
};

const fromJSON = async (urlOrData: any) => {
	return json.load(urlOrData).then(finalize);
};

const fromOBJ = async (url: string) => {
	return obj.load(url).then(finalize);
};

export { Model, defaultMaterial, from3DS, fromJSON, fromOBJ };
