import * as functional from "../language/functional";
import * as json from "./loaders/json";
import * as matrix from "../math/matrix";
import * as mesh from "./mesh";
import * as obj from "./loaders/obj";
import * as tds from "./loaders/3ds";
import * as vector from "../math/vector";

interface Config {
	transform?: matrix.Matrix4
}

interface Model {
	materials?: { [key: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

/*
** Based on:
** http://www.iquilezles.org/www/articles/normals/normals.htm
*/
const computeNormals = (indices: Uint32Array, points: Float32Array) => {
	const normals = functional.range(Math.floor(points.length / 3), i => vector.Vector3.zero);

	for (let i = 0; i + 2 < indices.length; i += 3) {
		const index1 = indices[i + 0];
		const index2 = indices[i + 1];
		const index3 = indices[i + 2];
		const point1 = { x: points[index1 * 3 + 0], y: points[index1 * 3 + 1], z: points[index1 * 3 + 2] };
		const point2 = { x: points[index2 * 3 + 0], y: points[index2 * 3 + 1], z: points[index2 * 3 + 2] };
		const point3 = { x: points[index3 * 3 + 0], y: points[index3 * 3 + 1], z: points[index3 * 3 + 2] };

		const normal = vector.Vector3.cross(
			vector.Vector3.sub(point3, point2),
			vector.Vector3.sub(point1, point2)
		);

		normals[index1] = vector.Vector3.add(normals[index1], normal);
		normals[index2] = vector.Vector3.add(normals[index2], normal);
		normals[index3] = vector.Vector3.add(normals[index3], normal);
	}

	const array = new Float32Array(points.length);

	for (let i = 0; i < normals.length; ++i) {
		const normal = vector.Vector3.normalize(normals[i]);

		array[i * 3 + 0] = normal.x;
		array[i * 3 + 1] = normal.y;
		array[i * 3 + 2] = normal.z;
	}

	return array;
};

/*
** Based on:
** http://fabiensanglard.net/bumpMapping/index.php
** http://www.terathon.com/code/tangent.html
*/
const computeTangents = (indices: Uint32Array, points: Float32Array, coords: Float32Array, normals: Float32Array) => {
	const tangents = functional.range(Math.floor(points.length / 3), i => vector.Vector3.zero);

	for (let i = 0; i + 2 < indices.length; i += 3) {
		const index1 = indices[i + 0];
		const index2 = indices[i + 1];
		const index3 = indices[i + 2];
		const coord1 = { x: coords[index1 * 2 + 0], y: coords[index1 * 2 + 1] };
		const coord2 = { x: coords[index2 * 2 + 0], y: coords[index2 * 2 + 1] };
		const coord3 = { x: coords[index3 * 2 + 0], y: coords[index3 * 2 + 1] };
		const point1 = { x: points[index1 * 3 + 0], y: points[index1 * 3 + 1], z: points[index1 * 3 + 2] };
		const point2 = { x: points[index2 * 3 + 0], y: points[index2 * 3 + 1], z: points[index2 * 3 + 2] };
		const point3 = { x: points[index3 * 3 + 0], y: points[index3 * 3 + 1], z: points[index3 * 3 + 2] };

		const c1 = vector.Vector2.sub(coord3, coord2);
		const c2 = vector.Vector2.sub(coord1, coord2);
		const p1 = vector.Vector3.sub(point3, point2);
		const p2 = vector.Vector3.sub(point1, point2);

		const coef = 1 / (c1.x * c2.y - c2.x * c1.y);

		const tangent = {
			x: coef * (p1.x * c2.y - p2.x * c1.y),
			y: coef * (p1.y * c2.y - p2.y * c1.y),
			z: coef * (p1.z * c2.y - p2.z * c1.y)
		};

		tangents[index1] = vector.Vector3.add(tangents[index1], tangent);
		tangents[index2] = vector.Vector3.add(tangents[index2], tangent);
		tangents[index3] = vector.Vector3.add(tangents[index3], tangent);
	}

	const array = new Float32Array(points.length);

	for (let i = 0; i < tangents.length; ++i) {
		const n = { x: normals[i * 3 + 0], y: normals[i * 3 + 1], z: normals[i * 3 + 2] };
		const t = tangents[i];

		// Gram-Schmidt orthogonalize: t' = normalize(t - n * dot(n, t));
		const tangent = vector.Vector3.normalize(
			vector.Vector3.sub(t, vector.Vector3.scale(n, vector.Vector3.dot(n, t)))
		);

		array[i * 3 + 0] = tangent.x;
		array[i * 3 + 1] = tangent.y;
		array[i * 3 + 2] = tangent.z;
	}

	return array;
};

const finalize = async (modelPromise: Promise<Model>, configOrUndefined: Config | undefined) => {
	const config = configOrUndefined || {};
	const model = await modelPromise;

	for (const mesh of model.meshes) {
		const transform = config.transform || matrix.Matrix4.createIdentity();

		// Transform points
		for (let i = 0; i + 2 < mesh.points.length; i += 3) {
			const point = transform.transform({ x: mesh.points[i + 0], y: mesh.points[i + 1], z: mesh.points[i + 2], w: 1 });

			mesh.points[i + 0] = point.x;
			mesh.points[i + 1] = point.y;
			mesh.points[i + 2] = point.z;
		}

		// Transform normals or compute them from vertices
		if (mesh.normals !== undefined) {
			for (let i = 0; i + 2 < mesh.normals.length; i += 3) {
				const normal = vector.Vector3.normalize(transform.transform({ x: mesh.normals[i + 0], y: mesh.normals[i + 1], z: mesh.normals[i + 2], w: 0 }));

				mesh.normals[i + 0] = normal.x;
				mesh.normals[i + 1] = normal.y;
				mesh.normals[i + 2] = normal.z;
			}
		}
		else
			mesh.normals = computeNormals(mesh.indices, mesh.points);

		// Transform tangents or compute them from vertices, normals and texture coordinates
		if (mesh.tangents !== undefined) {
			for (let i = 0; i + 2 < mesh.tangents.length; i += 3) {
				const tangent = vector.Vector3.normalize(transform.transform({ x: mesh.tangents[i + 0], y: mesh.tangents[i + 1], z: mesh.tangents[i + 2], w: 0 }));

				mesh.tangents[i + 0] = tangent.x;
				mesh.tangents[i + 1] = tangent.y;
				mesh.tangents[i + 2] = tangent.z;
			}
		}
		else if (mesh.coords !== undefined)
			mesh.tangents = computeTangents(mesh.indices, mesh.points, mesh.coords, mesh.normals);
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
