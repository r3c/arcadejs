import * as io from "./io";
import * as json from "./model/loaders/json";
import * as math from "./math";
import * as mesh from "./model/mesh";
import * as obj from "./model/loaders/obj";
import * as scalar from "./type/scalar";
import * as tds from "./model/loaders/3ds";

interface Config {
	scale?: Scale
	shift?: Shift
}

interface Model {
	materials?: { [key: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

interface Scale {
	xx?: number,
	xy?: number,
	xz?: number,
	yx?: number,
	yy?: number,
	yz?: number,
	zx?: number,
	zy?: number,
	zz?: number
}

interface Shift {
	x?: number,
	y?: number,
	z?: number
}

const defaultMaterial: mesh.Material = {
	colorBase: mesh.defaultColor,
	colorMap: mesh.defaultMap,
	glossMap: mesh.defaultMap,
	shininess: 1
};

/*
** Based on:
** http://www.iquilezles.org/www/articles/normals/normals.htm
*/
const computeNormals = (triangles: [number, number, number][], points: math.Vector3[]) => {
	const normals = [];

	for (const [index1, index2, index3] of triangles) {
		const point1 = points[index1];
		const point2 = points[index2];
		const point3 = points[index3];

		const normal = math.Vector.normalize3(math.Vector.cross(
			math.Vector.substract3(point3, point2),
			math.Vector.substract3(point1, point2)));

		normals[index1] = normal;
		normals[index2] = normal;
		normals[index3] = normal;
	}

	return normals;
};

const displaceVertex = (vertex: math.Vector3, scaleX: math.Vector3, scaleY: math.Vector3, scaleZ: math.Vector3, shift: math.Vector3) => {
	return {
		x: shift.x + scaleX.x * vertex.x + scaleX.y * vertex.y + scaleX.z * vertex.z,
		y: shift.y + scaleY.x * vertex.x + scaleY.y * vertex.y + scaleY.z * vertex.z,
		z: shift.z + scaleZ.x * vertex.x + scaleZ.y * vertex.y + scaleZ.z * vertex.z
	};
};

const finalize = async (modelPromise: Promise<Model>, configOrUndefined: Config | undefined) => {
	const config = configOrUndefined || {};
	const model = await modelPromise;

	for (const mesh of model.meshes) {
		const scale = config.scale || {};
		const scaleX = { x: scalar.coalesce(scale.xx, 1), y: scalar.coalesce(scale.xy, 0), z: scalar.coalesce(scale.xz, 0) };
		const scaleY = { x: scalar.coalesce(scale.yx, 0), y: scalar.coalesce(scale.yy, 1), z: scalar.coalesce(scale.yz, 0) };
		const scaleZ = { x: scalar.coalesce(scale.zx, 0), y: scalar.coalesce(scale.zy, 0), z: scalar.coalesce(scale.zz, 1) };
		const shift = config.shift || {};
		const shiftVector = { x: scalar.coalesce(shift.x, 0), y: scalar.coalesce(shift.y, 0), z: scalar.coalesce(shift.z, 0) };
		const shiftZero = { x: 0, y: 0, z: 0 };

		// Displace points
		mesh.points = mesh.points.map(point => displaceVertex(point, scaleX, scaleY, scaleZ, shiftVector));

		// Displace normals or compute them from vertices
		if (mesh.normals !== undefined)
			mesh.normals = mesh.normals.map(normal => displaceVertex(normal, scaleX, scaleY, scaleZ, shiftZero));
		else
			mesh.normals = computeNormals(mesh.triangles, mesh.points);

		// Normalize normals
		mesh.normals = mesh.normals.map(math.Vector.normalize3);
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

export { Model, defaultMaterial, from3DS, fromJSON, fromOBJ };
