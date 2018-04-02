const model = {
	meshes: [
		{
			coords: new Float32Array([
				0.0, 0.0,
				1.0, 0.0,
				1.0, 1.0,
				0.0, 1.0
			]),
			indices: new Uint32Array([
				0, 1, 2,
				0, 2, 3
			]),
			points: new Float32Array([
				-1.0, -1.0, 0.0,
				1.0, -1.0, 0.0,
				1.0, 1.0, 0.0,
				-1.0, 1.0, 0.0
			])
		}
	]
};

export { model }