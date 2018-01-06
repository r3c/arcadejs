import * as display from "./display";
import * as graphic from "./graphic";
import * as math from "./math";
import { Vector4 } from "./math";

interface Image {
	colors: Uint8ClampedArray;
	depths: Float32Array;
	height: number;
	width: number;
}

enum Mode {
	Default,
	Wire
}

interface Vertex {
	color: math.Vector4;
	point: math.Vector3;
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

const fillScanline = (image: Image, y: number, va: Vertex, vb: Vertex, vc: Vertex, vd: Vertex) => {
	if (y < 0 || y >= image.height)
		return;

	const ratio1 = (y - va.point.y) / Math.max(vb.point.y - va.point.y, 1);
	const ratio2 = (y - vc.point.y) / Math.max(vd.point.y - vc.point.y, 1);

	let start = {
		color: lerpVector4(va.color, vb.color, ratio1),
		depth: lerpScalar(va.point.z, vb.point.z, ratio1),
		x: Math.max(Math.min(~~lerpScalar(va.point.x, vb.point.x, ratio1), image.width - 1), 0)
	};

	let stop = {
		color: lerpVector4(vc.color, vd.color, ratio2),
		depth: lerpScalar(vc.point.z, vd.point.z, ratio2),
		x: Math.max(Math.min(~~lerpScalar(vc.point.x, vd.point.x, ratio2), image.width - 1), 0)
	};

	if (start.x > stop.x)
		[start, stop] = [stop, start];

	const offset = ~~y * image.width;
	const length = Math.max(stop.x - start.x, 1);

	for (var x = start.x; x <= stop.x; x += 1) {
		const ratio = (x - start.x) / length;

		// Depth test
		const depth = lerpScalar(start.depth, stop.depth, ratio);
		const depthIndex = offset + x;

		if (depth >= image.depths[depthIndex])
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
	if (v1.point.y > v2.point.y)
		[v1, v2] = [v2, v1];

	if (v2.point.y > v3.point.y)
		[v2, v3] = [v3, v2];

	if (v1.point.y > v2.point.y)
		[v1, v2] = [v2, v1];

	// Compute p1-p2 and p1-p3 slopes
	const slope12 = v2.point.y > v1.point.y ? (v2.point.x - v1.point.x) / (v2.point.y - v1.point.y) : 0;
	const slope13 = v3.point.y > v1.point.y ? (v3.point.x - v1.point.x) / (v3.point.y - v1.point.y) : 0;

	if (slope12 > slope13) {
		for (let y = v1.point.y; y < v2.point.y; ++y)
			fillScanline(image, y, v1, v3, v1, v2);

		for (let y = v2.point.y; y <= v3.point.y; ++y)
			fillScanline(image, y, v1, v3, v2, v3);
	}

	else {
		for (let y = v1.point.y; y < v2.point.y; ++y)
			fillScanline(image, y, v1, v2, v1, v3);

		for (let y = v2.point.y; y <= v3.point.y; ++y)
			fillScanline(image, y, v2, v3, v1, v3);
	}
};

const wireLine = (image: Image, begin: math.Vector3, end: math.Vector3) => {
	let x0 = ~~begin.x;
	const x1 = ~~end.x;
	let y0 = ~~begin.y;
	const y1 = ~~end.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1;
	const sy = (y0 < y1) ? 1 : -1;

    let err = dx - dy;

    while (x0 !== x1 || y0 !== y1) {
		if (x0 >= 0 && x0 < image.width && y0 >= 0 && y0 < image.height) {
			const index = (x0 + y0 * image.width) * 4;
	
			image.colors[index + 0] = 255;
			image.colors[index + 1] = 255;
			image.colors[index + 2] = 255;
			image.colors[index + 3] = 255;
		}

		const e2 = err * 2;

        if (e2 > -dy) {
			err -= dy;
			x0 += sx;
		}

        if (e2 < dx) {
			err += dx;
			y0 += sy;
		}
	}
};

const wireTriangle = (image: Image, v1: Vertex, v2: Vertex, v3: Vertex) => {
	wireLine(image, v1.point, v2.point);
	wireLine(image, v1.point, v3.point);
	wireLine(image, v2.point, v3.point);
};

const draw = (screen: display.Screen, projection: math.Matrix, modelView: math.Matrix, mode: Mode, model: graphic.Model) => {
	const capture = screen.context.getImageData(0, 0, screen.getWidth(), screen.getHeight());

	const image = {
		colors: capture.data,
		depths: new Float32Array(capture.width * capture.height),
		height: screen.getHeight(),
		width: screen.getWidth()
	};

	image.depths.fill(Math.pow(2, 127));

	const halfWidth = screen.getWidth() * 0.5;
	const halfHeight = screen.getHeight() * 0.5;

	const modelViewProjection = projection.compose(modelView);

	const triangle = mode === Mode.Default ? fillTriangle : wireTriangle;

	for (const mesh of model.meshes) {
		const colors = mesh.colors || [];
		const coords = mesh.positions;
		const faces = mesh.faces;

		for (const [i, j, k] of faces) {
			const color1 = colors[i] || white;
			const color2 = colors[j] || white;
			const color3 = colors[k] || white;
			const point1 = projectToScreen(modelViewProjection, halfWidth, halfHeight, coords[i]);
			const point2 = projectToScreen(modelViewProjection, halfWidth, halfHeight, coords[j]);
			const point3 = projectToScreen(modelViewProjection, halfWidth, halfHeight, coords[k]);

			triangle(image,
				{ color: color1, point: point1 },
				{ color: color2, point: point2 },
				{ color: color3, point: point3 }
			);
		}
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
		z: point.z / point.w
	};
};

export { draw, Mode };
