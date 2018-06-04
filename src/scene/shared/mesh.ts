import * as matrix from "../../engine/math/matrix";

interface CustomMesh {
	indices: number[],
	points: number[]
}

const convert = (custom: CustomMesh) => ({
	materials: {},
	nodes: [{
		children: [],
		geometries: [{
			indices: new Uint32Array(custom.indices),
			points: {
				buffer: new Float32Array(custom.points),
				stride: 3
			}
		}],
		transform: matrix.Matrix4.createIdentity()
	}]
});

export { convert }