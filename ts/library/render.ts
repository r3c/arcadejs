import * as display from "./display";
import * as math from "./math";

interface Image {
	data: Uint8ClampedArray;
	height: number;
	width: number;
}

interface Mesh {
	faces: [number, number, number][];
	normals?: math.Vector3[];
	points: math.Vector3[];
}

const interpolate = (min: number, max: number, ratio: number) => {
	return min + (max - min) * ratio;
};

const blitScanline = (image: Image, y: number, pa: math.Vector3, pb: math.Vector3, pc: math.Vector3, pd: math.Vector3) => {
	if (y < 0 || y >= image.height)
		return;

	const offset = y * image.width;

	const ratio1 = pa.y != pb.y ? (y - pa.y) / (pb.y - pa.y) : 1;
	const ratio2 = pc.y != pd.y ? (y - pc.y) / (pd.y - pc.y) : 1;

	let x1 = Math.max(Math.min(interpolate(pa.x, pb.x, ratio1) >> 0, image.width - 1), 0);
	let x2 = Math.max(Math.min(interpolate(pc.x, pd.x, ratio2) >> 0, image.width - 1), 0);

	if (x1 > x2)
		[x1, x2] = [x2, x1];

	for (var x = x1; x < x2; x++) {
		const index = (x + offset) * 4;

		image.data[index + 0] = 255;
		image.data[index + 1] = 255;
		image.data[index + 2] = 255;
		image.data[index + 3] = 255;
	}
}

/*
** From: https://www.davrous.com/2013/06/21/tutorial-part-4-learning-how-to-write-a-3d-software-engine-in-c-ts-or-js-rasterization-z-buffering/
*/
const blitTriangle = (image: Image, p1: math.Vector3, p2: math.Vector3, p3: math.Vector3) => {
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

	if (slope12 > slope13) {
		for (let y = p1.y; y < p2.y; ++y)
			blitScanline(image, y, p1, p3, p1, p2);

		for (let y = p2.y; y <= p3.y; ++y)
			blitScanline(image, y, p1, p3, p2, p3);
	}

	else {
		for (let y = p1.y; y < p2.y; ++y)
			blitScanline(image, y, p1, p2, p1, p3);

		for (let y = p2.y; y <= p3.y; ++y)
			blitScanline(image, y, p2, p3, p1, p3);
	}
};

const draw = (screen: display.Screen, projection: math.Matrix, modelView: math.Matrix, mesh: Mesh) => {
	const capture = screen.context.getImageData(0, 0, screen.getWidth(), screen.getHeight());

	const image = {
		data: capture.data,
		height: screen.getHeight(),
		width: screen.getWidth()
	};

	const halfWidth = screen.getWidth() * 0.5;
	const halfHeight = screen.getHeight() * 0.5;

	const modelViewProjection = projection.compose(modelView);

	const faces = mesh.faces;
	const points = mesh.points;

	for (const [i, j, k] of faces) {
		blitTriangle(image,
			projectToScreen(modelViewProjection, halfWidth, halfHeight, points[i]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, points[j]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, points[k])
		);
	}

	screen.context.putImageData(capture, 0, 0);
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
