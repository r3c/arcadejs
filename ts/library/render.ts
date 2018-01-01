import * as display from "./display";
import * as math from "./math";
import { Vector4 } from "./math";

interface Image {
	colors: Uint8ClampedArray;
	depths: Float32Array;
	height: number;
	width: number;
}

interface Mesh {
	colors?: math.Vector4[];
	faces: [number, number, number][];
	normals?: math.Vector3[];
	positions: math.Vector3[];
}

interface Vertex {
	color: math.Vector4;
	position: math.Vector3;
}

const white = {
	x: 255,
	y: 255,
	z: 255,
	w: 255
};

const lerpScalar = (min: number, max: number, ratio: number) => {
	return min + (max - min) * ratio;
};

const lerpVector4 = (min: Vector4, max: Vector4, ratio: number) => {
	return {
		x: lerpScalar(min.x, max.x, ratio),
		y: lerpScalar(min.y, max.y, ratio),
		z: lerpScalar(min.z, max.z, ratio),
		w: lerpScalar(min.w, max.w, ratio)
	}
};

const fillScanline = (image: Image, y: number, pa: Vertex, pb: Vertex, pc: Vertex, pd: Vertex) => {
	if (y < 0 || y >= image.height)
		return;

	const ratio1 = pa.position.y != pb.position.y ? (y - pa.position.y) / (pb.position.y - pa.position.y) : 1;
	const ratio2 = pc.position.y != pd.position.y ? (y - pc.position.y) / (pd.position.y - pc.position.y) : 1;

	let start = {
		color: lerpVector4(pa.color, pb.color, ratio1),
		depth: lerpScalar(pa.position.z, pb.position.z, ratio1),
		x: Math.max(Math.min(lerpScalar(pa.position.x, pb.position.x, ratio1) >> 0, image.width - 1), 0)
	};

	let stop = {
		color: lerpVector4(pc.color, pd.color, ratio2),
		depth: lerpScalar(pc.position.z, pd.position.z, ratio2),
		x: Math.max(Math.min(lerpScalar(pc.position.x, pd.position.x, ratio2) >> 0, image.width - 1), 0)
	};

	if (start.x > stop.x)
		[start, stop] = [stop, start];

	const offset = (y >> 0) * image.width;

	for (var x = start.x; x <= stop.x; x++) {
		const ratio = (x - start.x) / (stop.x - start.x);

		// Depth test
		const depth = lerpScalar(start.depth, stop.depth, ratio);
		const depthIndex = offset + x;

		if (depth <= image.depths[depthIndex])
			continue;

		image.depths[depthIndex] = depth;

		// Color update
		const color = lerpVector4(start.color, stop.color, ratio);
		const colorIndex = depthIndex * 4;

		image.colors[colorIndex + 0] = color.x;
		image.colors[colorIndex + 1] = color.y;
		image.colors[colorIndex + 2] = color.z;
		image.colors[colorIndex + 3] = color.w;
	}
}

/*
** From: https://www.davrous.com/2013/06/21/tutorial-part-4-learning-how-to-write-a-3d-software-engine-in-c-ts-or-js-rasterization-z-buffering/
*/
const fillTriangle = (image: Image, v1: Vertex, v2: Vertex, v3: Vertex) => {
	// Reorder p1, p2 and p3 so that p1.y <= p2.y <= p3.y
	if (v1.position.y > v2.position.y)
		[v1, v2] = [v2, v1];

	if (v2.position.y > v3.position.y)
		[v2, v3] = [v3, v2];

	if (v1.position.y > v2.position.y)
		[v1, v2] = [v2, v1];

	// Compute p1-p2 and p1-p3 slopes
	const slope12 = v2.position.y > v1.position.y ? (v2.position.x - v1.position.x) / (v2.position.y - v1.position.y) : 0;
	const slope13 = v3.position.y > v1.position.y ? (v3.position.x - v1.position.x) / (v3.position.y - v1.position.y) : 0;

	if (slope12 > slope13) {
		for (let y = v1.position.y; y < v2.position.y; ++y)
			fillScanline(image, y, v1, v3, v1, v2);

		for (let y = v2.position.y; y <= v3.position.y; ++y)
			fillScanline(image, y, v1, v3, v2, v3);
	}

	else {
		for (let y = v1.position.y; y < v2.position.y; ++y)
			fillScanline(image, y, v1, v2, v1, v3);

		for (let y = v2.position.y; y <= v3.position.y; ++y)
			fillScanline(image, y, v2, v3, v1, v3);
	}
};

const draw = (screen: display.Screen, projection: math.Matrix, modelView: math.Matrix, mesh: Mesh) => {
	const capture = screen.context.getImageData(0, 0, screen.getWidth(), screen.getHeight());

	const image = {
		colors: capture.data,
		depths: new Float32Array(capture.width * capture.height),
		height: screen.getHeight(),
		width: screen.getWidth()
	};

	image.depths.fill(-Math.pow(2, 127));

	const halfWidth = screen.getWidth() * 0.5;
	const halfHeight = screen.getHeight() * 0.5;

	const modelViewProjection = projection.compose(modelView);

	const colors = mesh.colors || [];
	const coords = mesh.positions;
	const faces = mesh.faces;

	for (const [i, j, k] of faces) {
		fillTriangle(image,
			{ position: projectToScreen(modelViewProjection, halfWidth, halfHeight, coords[i]), color: colors[i] || white },
			{ position: projectToScreen(modelViewProjection, halfWidth, halfHeight, coords[j]), color: colors[j] || white },
			{ position: projectToScreen(modelViewProjection, halfWidth, halfHeight, coords[k]), color: colors[k] || white }
		);
	}

	screen.context.putImageData(capture, 0, 0);
};

const projectToScreen = (modelViewProjection: math.Matrix, halfWidth: number, halfHeight: number, vertex: math.Vector3) => {
	const point = modelViewProjection.transform({
		x: vertex.x,
		y: vertex.y,
		z: vertex.z,
		w: 1
	});

	return {
		x: point.x / point.w * halfWidth + halfWidth,
		y: point.y / point.w * halfHeight + halfHeight,
		z: point.z
	};
};

export { draw };
