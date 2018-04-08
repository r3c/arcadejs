import * as functional from "../language/functional";
import * as gltf from "./loaders/gltf";
import * as json from "./loaders/json";
import * as matrix from "../math/matrix";
import * as model from "./model";
import * as obj from "./loaders/obj";
import * as tds from "./loaders/3ds";
import * as vector from "../math/vector";

interface Config {
	transform?: matrix.Matrix4
}

/*
** Based on:
** http://www.iquilezles.org/www/articles/normals/normals.htm
*/
const computeNormals = (indices: model.Array, points: model.Attribute) => {
	const pointsBuffer = points.buffer;
	const pointsCount = points.componentCount;
	const normals = functional.range(Math.floor(pointsBuffer.length / pointsCount), i => vector.Vector3.zero);

	for (let i = 0; i + 2 < indices.length; i += 3) {
		const index1 = indices[i + 0];
		const index2 = indices[i + 1];
		const index3 = indices[i + 2];
		const point1 = { x: pointsBuffer[index1 * pointsCount + 0], y: pointsBuffer[index1 * pointsCount + 1], z: pointsBuffer[index1 * pointsCount + 2] };
		const point2 = { x: pointsBuffer[index2 * pointsCount + 0], y: pointsBuffer[index2 * pointsCount + 1], z: pointsBuffer[index2 * pointsCount + 2] };
		const point3 = { x: pointsBuffer[index3 * pointsCount + 0], y: pointsBuffer[index3 * pointsCount + 1], z: pointsBuffer[index3 * pointsCount + 2] };

		const normal = vector.Vector3.cross(
			vector.Vector3.sub(point3, point2),
			vector.Vector3.sub(point1, point2)
		);

		normals[index1] = vector.Vector3.add(normals[index1], normal);
		normals[index2] = vector.Vector3.add(normals[index2], normal);
		normals[index3] = vector.Vector3.add(normals[index3], normal);
	}

	const normalsBuffer = new Float32Array(normals.length * 3);
	const normalsCount = 3;

	for (let i = 0; i < normals.length; ++i) {
		const normal = vector.Vector3.normalize(normals[i]);

		normalsBuffer[i * normalsCount + 0] = normal.x;
		normalsBuffer[i * normalsCount + 1] = normal.y;
		normalsBuffer[i * normalsCount + 2] = normal.z;
	}

	return {
		buffer: normalsBuffer,
		componentCount: normalsCount
	};
};

/*
** Based on:
** http://fabiensanglard.net/bumpMapping/index.php
** http://www.terathon.com/code/tangent.html
*/
const computeTangents = (indices: model.Array, points: model.Attribute, coords: model.Attribute, normals: model.Attribute) => {
	const coordsBuffer = coords.buffer;
	const coordsCount = coords.componentCount;
	const pointsBuffer = points.buffer;
	const pointsCount = points.componentCount;
	const tangents = functional.range(Math.floor(pointsBuffer.length / pointsCount), i => vector.Vector3.zero);

	for (let i = 0; i + 2 < indices.length; i += 3) {
		const index1 = indices[i + 0];
		const index2 = indices[i + 1];
		const index3 = indices[i + 2];
		const coord1 = { x: coordsBuffer[index1 * coordsCount + 0], y: coordsBuffer[index1 * coordsCount + 1] };
		const coord2 = { x: coordsBuffer[index2 * coordsCount + 0], y: coordsBuffer[index2 * coordsCount + 1] };
		const coord3 = { x: coordsBuffer[index3 * coordsCount + 0], y: coordsBuffer[index3 * coordsCount + 1] };
		const point1 = { x: pointsBuffer[index1 * pointsCount + 0], y: pointsBuffer[index1 * pointsCount + 1], z: pointsBuffer[index1 * pointsCount + 2] };
		const point2 = { x: pointsBuffer[index2 * pointsCount + 0], y: pointsBuffer[index2 * pointsCount + 1], z: pointsBuffer[index2 * pointsCount + 2] };
		const point3 = { x: pointsBuffer[index3 * pointsCount + 0], y: pointsBuffer[index3 * pointsCount + 1], z: pointsBuffer[index3 * pointsCount + 2] };

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

	const normalsBuffer = normals.buffer;
	const normalsCount = normals.componentCount;
	const tangentsBuffer = new Float32Array(tangents.length * 3);
	const tangentsCount = 3;

	for (let i = 0; i < tangents.length; ++i) {
		const n = { x: normalsBuffer[i * normalsCount + 0], y: normalsBuffer[i * normalsCount + 1], z: normalsBuffer[i * normalsCount + 2] };
		const t = tangents[i];

		// Gram-Schmidt orthogonalize: t' = normalize(t - n * dot(n, t));
		const tangent = vector.Vector3.normalize(
			vector.Vector3.sub(t, vector.Vector3.scale(n, vector.Vector3.dot(n, t)))
		);

		tangentsBuffer[i * tangentsCount + 0] = tangent.x;
		tangentsBuffer[i * tangentsCount + 1] = tangent.y;
		tangentsBuffer[i * tangentsCount + 2] = tangent.z;
	}

	return {
		buffer: tangentsBuffer,
		componentCount: tangentsCount
	};
};

const finalizeMesh = (mesh: model.Geometry, config: Config) => {
	const transform = config.transform || matrix.Matrix4.createIdentity();

	// Transform points
	const buffer = mesh.points.buffer;
	const count = mesh.points.componentCount;

	for (let i = 0; i + 2 < buffer.length; i += count) {
		const point = transform.transform({ x: buffer[i + 0], y: buffer[i + 1], z: buffer[i + 2], w: 1 });

		buffer[i + 0] = point.x;
		buffer[i + 1] = point.y;
		buffer[i + 2] = point.z;
	}

	// Transform normals or compute them from vertices
	if (mesh.normals !== undefined) {
		const buffer = mesh.normals.buffer;
		const count = mesh.normals.componentCount;

		for (let i = 0; i + 2 < buffer.length; i += count) {
			const normal = vector.Vector3.normalize(transform.transform({ x: buffer[i + 0], y: buffer[i + 1], z: buffer[i + 2], w: 0 }));

			buffer[i + 0] = normal.x;
			buffer[i + 1] = normal.y;
			buffer[i + 2] = normal.z;
		}
	}
	else
		mesh.normals = computeNormals(mesh.indices, mesh.points);

	// Transform tangents or compute them from vertices, normals and texture coordinates
	if (mesh.tangents !== undefined) {
		const buffer = mesh.tangents.buffer;
		const count = mesh.tangents.componentCount;

		for (let i = 0; i + 2 < buffer.length; i += count) {
			const tangent = vector.Vector3.normalize(transform.transform({ x: buffer[i + 0], y: buffer[i + 1], z: buffer[i + 2], w: 0 }));

			buffer[i + 0] = tangent.x;
			buffer[i + 1] = tangent.y;
			buffer[i + 2] = tangent.z;
		}
	}
	else if (mesh.coords !== undefined)
		mesh.tangents = computeTangents(mesh.indices, mesh.points, mesh.coords, mesh.normals);
};

const finalizeNode = (node: model.Node, config: Config) => {
	node.children.forEach(child => finalizeNode(child, config));
	node.geometries.forEach(mesh => finalizeMesh(mesh, config));
};

const finalize = async (meshPromise: Promise<model.Mesh>, configOrUndefined: Config | undefined) => {
	const config = configOrUndefined || {};
	const mesh = await meshPromise;

	mesh.nodes.forEach(node => finalizeNode(node, config));

	return mesh;
};

const from3DS = (url: string, config?: Config) => {
	return finalize(tds.load(url), config);
};

const fromGLTF = (url: string, config?: Config) => {
	return finalize(gltf.load(url), config);
};

const fromJSON = (urlOrData: any, config?: Config) => {
	return finalize(json.load(urlOrData), config);
};

const fromOBJ = (url: string, config?: Config) => {
	return finalize(obj.load(url), config);
};

export { from3DS, fromGLTF, fromJSON, fromOBJ };
