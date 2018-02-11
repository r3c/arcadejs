import * as functional from "./language/functional";
import * as io from "./io";
import * as json from "./model/loaders/json";
import * as math from "./math";
import * as mesh from "./model/mesh";
import * as obj from "./model/loaders/obj";
import * as tds from "./model/loaders/3ds";

interface Config {
	transform?: math.Matrix
}

interface Model {
	materials?: { [key: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

/*
** Based on:
** http://www.iquilezles.org/www/articles/normals/normals.htm
*/
const computeNormals = (triangles: [number, number, number][], points: math.Vector3[]) => {
	const normals = functional.range(points.length, i => ({ x: 0, y: 0, z: 0 }));

	for (const [index1, index2, index3] of triangles) {
		const point1 = points[index1];
		const point2 = points[index2];
		const point3 = points[index3];

		const normal = math.Vector.cross(
			math.Vector.substract3(point3, point2),
			math.Vector.substract3(point1, point2));

		normals[index1] = math.Vector.add3(normals[index1], normal);
		normals[index2] = math.Vector.add3(normals[index2], normal);
		normals[index3] = math.Vector.add3(normals[index3], normal);
	}

	for (let i = 0; i < normals.length; ++i)
		normals[i] = math.Vector.normalize3(normals[i]);

	return normals;
};

/*
** Based on:
** http://fabiensanglard.net/bumpMapping/index.php
** http://www.terathon.com/code/tangent.html
*/
const computeTangents = (triangles: [number, number, number][], points: math.Vector3[], coords: math.Vector2[], normals: math.Vector3[]) => {
	const tangents = functional.range(normals.length, i => ({ x: 0, y: 0, z: 0 }));

	for (const [index1, index2, index3] of triangles) {
		const coord1 = coords[index1];
		const coord2 = coords[index2];
		const coord3 = coords[index3];
		const point1 = points[index1];
		const point2 = points[index2];
		const point3 = points[index3];

		const c1 = math.Vector.substract2(coord3, coord2);
		const c2 = math.Vector.substract2(coord1, coord2);
		const p1 = math.Vector.substract3(point3, point2);
		const p2 = math.Vector.substract3(point1, point2);

		const coef = 1 / (c1.x * c2.y - c2.x * c1.y);

		const tangent = {
			x: coef * (p1.x * c2.y - p2.x * c1.y),
			y: coef * (p1.y * c2.y - p2.y * c1.y),
			z: coef * (p1.z * c2.y - p2.z * c1.y)
		};

		tangents[index1] = math.Vector.add3(tangents[index1], tangent);
		tangents[index2] = math.Vector.add3(tangents[index2], tangent);
		tangents[index3] = math.Vector.add3(tangents[index3], tangent);
	}

	for (let i = 0; i < normals.length; ++i) {
		const n = normals[i];
		const t = tangents[i];

		// Gram-Schmidt orthogonalize: t' = normalize(t - n * dot(n, t));
		tangents[i] = math.Vector.normalize3(
			math.Vector.substract3(t, math.Vector.scale3(n, math.Vector.dot3(n, t)))
		);
	}

	return tangents;
};

const finalize = async (modelPromise: Promise<Model>, configOrUndefined: Config | undefined) => {
	const config = configOrUndefined || {};
	const model = await modelPromise;

	for (const mesh of model.meshes) {
		const transform = config.transform || math.Matrix.createIdentity();

		// Transform points
		mesh.points = mesh.points.map(point => transform.transform({ x: point.x, y: point.y, z: point.z, w: 1 }));

		// Transform normals or compute them from vertices
		if (mesh.normals !== undefined)
			mesh.normals = mesh.normals.map(normal => math.Vector.normalize3(transform.transform({ x: normal.x, y: normal.y, z: normal.z, w: 0 })));
		else
			mesh.normals = computeNormals(mesh.triangles, mesh.points);

		// Transform tangents or compute them from vertices, normals and texture coordinates
		if (mesh.tangents !== undefined)
			mesh.tangents = mesh.tangents.map(tangent => math.Vector.normalize3(transform.transform({ x: tangent.x, y: tangent.y, z: tangent.z, w: 0 })));
		else if (mesh.coords !== undefined)
			mesh.tangents = computeTangents(mesh.triangles, mesh.points, mesh.coords, mesh.normals);
	}

	return model;
};

const from3DS = (url: string, config?: Config) => {
	return finalize(tds.load(url), config);
};

const fromJSON = (urlOrData: any, config?: Config) => {
	return finalize(json.load(urlOrData), config);
};

const fromOBJ = (url: string, config?: Config) => {
	return finalize(obj.load(url), config);
};

export { Model, from3DS, fromJSON, fromOBJ };
