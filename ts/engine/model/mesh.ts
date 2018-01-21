import * as math from "../math";

interface Material {
	colorBase: math.Vector4,
	colorMap?: string
}

interface Mesh {
	colors?: math.Vector4[],
	coords?: math.Vector2[],
	materialName?: string,
	normals?: math.Vector3[],
	points: math.Vector3[],
	triangles: [number, number, number][]
}

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

export { Material, Mesh, defaultColor }
