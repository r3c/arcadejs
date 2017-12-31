import * as display from "./display";
import * as math from "./math";

interface Mesh {
	faces: [number, number, number][];
	normals?: math.Vector3[];
	points: math.Vector3[];
}

const interpolate = (min: number, max: number, ratio: number) => {
	return min + (max - min) * ratio;
};

const processScanLine = (context: CanvasRenderingContext2D, y: number, pa: math.Vector3, pb: math.Vector3, pc: math.Vector3, pd: math.Vector3) => {
	var ratio1 = pa.y != pb.y ? (y - pa.y) / (pb.y - pa.y) : 1;
	var ratio2 = pc.y != pd.y ? (y - pc.y) / (pd.y - pc.y) : 1;

	var x1 = interpolate(pa.x, pb.x, ratio1) >> 0;
	var x2 = interpolate(pc.x, pd.x, ratio2) >> 0;

	if (x1 < x2) {
		for (var x = x1; x < x2; x++) {
			context.fillStyle = 'white';
			context.fillRect(x, y, 1, 1);
		}
	}
	else {
		for (var x = x2; x < x1; x++) {
			context.fillStyle = 'white';
			context.fillRect(x, y, 1, 1);
		}
	}
}

/*
** From: https://www.davrous.com/2013/06/21/tutorial-part-4-learning-how-to-write-a-3d-software-engine-in-c-ts-or-js-rasterization-z-buffering/
*/
const drawTriangleFill = (context: CanvasRenderingContext2D, p1: math.Vector3, p2: math.Vector3, p3: math.Vector3) => {
	// Reorder p1, p2 and p3 so that p1.y <= p2.y <= p3.y
	if (p1.y > p2.y)
		[p1, p2] = [p2, p1];

	if (p2.y > p3.y)
		[p2, p3] = [p3, p2];

	if (p1.y > p2.y)
		[p1, p2] = [p2, p1];

	// Compute p1-p2 and p1-p3 slopes
	const slope12 = p2.y > p1.y ? (p2.x - p1.x) / (p2.y - p1.y) : 0;
	const slope13 = p3.y > p1.y ? (p3.x - p1.x) / (p3.y - p1.y) : 0;

	// First case where triangles are like that:
	// P1
	// -
	// -- 
	// - -
	// -  -
	// -   - P2
	// -  -
	// - -
	// -
	// P3
	if (slope12 > slope13) {
		for (let y = p1.y; y < p2.y; ++y)
			processScanLine(context, y, p1, p3, p1, p2);

		for (let y = p2.y; y <= p3.y; ++y)
			processScanLine(context, y, p1, p3, p2, p3);
	}

	// First case where triangles are like that:
	//       P1
	//        -
	//       -- 
	//      - -
	//     -  -
	// P2 -   - 
	//     -  -
	//      - -
	//        -
	//       P3
	else {
		for (let y = p1.y; y < p2.y; ++y)
			processScanLine(context, y, p1, p2, p1, p3);

		for (let y = p2.y; y <= p3.y; ++y)
			processScanLine(context, y, p2, p3, p1, p3);
	}
};

const drawTriangleWire = (context: CanvasRenderingContext2D, p1: math.Vector3, p2: math.Vector3, p3: math.Vector3) => {
	context.strokeStyle = 'white';
	context.beginPath();
	context.moveTo(p1.x, p1.y);
	context.lineTo(p2.x, p2.y);
	context.lineTo(p3.x, p3.y);
	context.lineTo(p1.x, p1.y);
	context.stroke();
};

const draw = (screen: display.Screen, projection: math.Matrix, modelView: math.Matrix, mesh: Mesh) => {
	const halfWidth = screen.getWidth() * 0.5;
	const halfHeight = screen.getHeight() * 0.5;

	const modelViewProjection = projection.compose(modelView);

	const faces = mesh.faces;
	const points = mesh.points;

	for (const [i, j, k] of faces) {
		drawTriangleFill(screen.context,
			projectToScreen(modelViewProjection, halfWidth, halfHeight, points[i]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, points[j]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, points[k])
		);
	}
};

const projectToScreen = (modelViewProjection: math.Matrix, halfWidth: number, halfHeight: number, vertex: math.Vector3) => {
	const point = modelViewProjection.transform(vertex);

	return {
		x: (point.x * halfWidth + halfWidth) >> 0,
		y: (point.y * halfHeight + halfHeight) >> 0,
		z: point.z
	};
};

export { draw };
