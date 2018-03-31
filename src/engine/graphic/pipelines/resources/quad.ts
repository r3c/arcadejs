const triangles: [number, number, number][] = [
	[0, 1, 2],
	[0, 2, 3]
];

const model = {
	"meshes": [
		{
			"points": [
				{ x: -1.0, y: -1.0, z: 0.0 },
				{ x: -1.0, y: 1.0, z: 0.0 },
				{ x: 1.0, y: 1.0, z: 0.0 },
				{ x: 1.0, y: -1.0, z: 0.0 }
			],
			"triangles": triangles
		}
	]
};

export { model }