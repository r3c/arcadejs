import * as matrix from "../../../math/matrix";

const model = {
	materials: {},
	root: {
		children: [],
		geometries: [
			{
				coords: {
					buffer: new Float32Array([
						0.0, 0.0,
						1.0, 0.0,
						1.0, 1.0,
						0.0, 1.0
					]),
					stride: 2
				},
				indices: new Uint32Array([
					0, 1, 2,
					0, 2, 3
				]),
				points: {
					buffer: new Float32Array([
						-1.0, -1.0, 0.0,
						1.0, -1.0, 0.0,
						1.0, 1.0, 0.0,
						-1.0, 1.0, 0.0
					]),
					stride: 3
				}
			}
		],
		transform: matrix.Matrix4.createIdentity()
	}
};

export { model }