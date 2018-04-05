import * as display from "../display";
import * as functional from "../language/functional";
import * as matrix from "../math/matrix";
import * as mesh from "../graphic/mesh";
import * as model from "../graphic/model";
import * as vector from "../math/vector";

enum DrawMode {
	Default,
	Wire
}

interface Image {
	colors: Uint8ClampedArray,
	depths: Float32Array,
	height: number,
	width: number
}

interface Vertex {
	color: vector.Vector4,
	coord: vector.Vector2,
	point: vector.Vector3
}

const defaultAttribute = {
	buffer: new Float32Array(4).fill(0),
	stride: 0
};

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

const defaultCoord = {
	x: 0,
	y: 0
};

const lerpScalar = (min: number, max: number, ratio: number) => {
	return min + (max - min) * ratio;
};

const lerpVector2 = (min: vector.Vector2, max: vector.Vector2, ratio: number) => {
	return {
		x: lerpScalar(min.x, max.x, ratio),
		y: lerpScalar(min.y, max.y, ratio)
	}
};

const lerpVector4 = (min: vector.Vector4, max: vector.Vector4, ratio: number) => {
	return {
		x: lerpScalar(min.x, max.x, ratio),
		y: lerpScalar(min.y, max.y, ratio),
		z: lerpScalar(min.z, max.z, ratio),
		w: lerpScalar(min.w, max.w, ratio)
	}
};

const fillScanline = (image: Image, y: number, va: Vertex, vb: Vertex, vc: Vertex, vd: Vertex, material: mesh.Material | undefined) => {
	if (y < 0 || y >= image.height)
		return;

	const ratio1 = (y - va.point.y) / Math.max(vb.point.y - va.point.y, 1);
	const ratio2 = (y - vc.point.y) / Math.max(vd.point.y - vc.point.y, 1);

	let begin = {
		color: lerpVector4(va.color, vb.color, ratio1),
		coord: lerpVector2(va.coord, vb.coord, ratio1),
		depth: lerpScalar(va.point.z, vb.point.z, ratio1),
		x: lerpScalar(va.point.x, vb.point.x, ratio1)
	};

	let end = {
		color: lerpVector4(vc.color, vd.color, ratio2),
		coord: lerpVector2(vc.coord, vd.coord, ratio2),
		depth: lerpScalar(vc.point.z, vd.point.z, ratio2),
		x: lerpScalar(vc.point.x, vd.point.x, ratio2)
	};

	if (begin.x > end.x)
		[begin, end] = [end, begin];

	const offset = ~~y * image.width;
	const length = Math.max(end.x - begin.x, 1);

	for (var x = Math.max(begin.x, 0); x <= Math.min(end.x, image.width - 1); ++x) {
		const ratio = (x - begin.x) / length;

		// Vertex depth
		const depth = lerpScalar(begin.depth, end.depth, ratio);
		const depthIndex = offset + ~~x;

		if (depth >= image.depths[depthIndex])
			continue;

		image.depths[depthIndex] = depth;

		// Vertex color
		const color = lerpVector4(begin.color, end.color, ratio);
		const colorIndex = depthIndex * 4;

		// Apply material properties
		if (material !== undefined) {
			// Albedo color
			if (material.albedoColor !== undefined) {
				color.x *= material.albedoColor.x;
				color.y *= material.albedoColor.y;
				color.z *= material.albedoColor.z;
				color.w *= material.albedoColor.w;
			}

			// Albedo map
			if (material.albedoMap !== undefined) {
				const coord = lerpVector2(begin.coord, end.coord, ratio);
				const image = material.albedoMap;

				const x = ~~(coord.x * image.width) % image.width;
				const y = ~~(coord.y * image.height) % image.height;

				const coordIndex = (x + y * image.width) * 4;

				color.x *= image.data[coordIndex + 0] / 255;
				color.y *= image.data[coordIndex + 1] / 255;
				color.z *= image.data[coordIndex + 2] / 255;
				color.w *= image.data[coordIndex + 3] / 255;
			}
		}

		// Set pixels
		image.colors[colorIndex + 0] = color.x * 255;
		image.colors[colorIndex + 1] = color.y * 255;
		image.colors[colorIndex + 2] = color.z * 255;
		image.colors[colorIndex + 3] = color.w * 255;
	}
}

/*
** From: https://www.davrous.com/2013/06/21/tutorial-part-4-learning-how-to-write-a-3d-software-engine-in-c-ts-or-js-rasterization-z-buffering/
*/
const fillTriangle = (image: Image, v1: Vertex, v2: Vertex, v3: Vertex, material: mesh.Material | undefined) => {
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
			fillScanline(image, y, v1, v3, v1, v2, material);

		for (let y = v2.point.y; y <= v3.point.y; ++y)
			fillScanline(image, y, v1, v3, v2, v3, material);
	}

	else {
		for (let y = v1.point.y; y < v2.point.y; ++y)
			fillScanline(image, y, v1, v2, v1, v3, material);

		for (let y = v2.point.y; y <= v3.point.y; ++y)
			fillScanline(image, y, v2, v3, v1, v3, material);
	}
};

const wireLine = (image: Image, begin: vector.Vector3, end: vector.Vector3) => {
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

const projectToScreen = (modelViewProjection: matrix.Matrix4, halfWidth: number, halfHeight: number, position: vector.Vector3) => {
	const point = modelViewProjection.transform({
		x: position.x,
		y: position.y,
		z: position.z,
		w: 1
	});

	/*
	** Normalize point and apply following conversions:
	** - Convert x range from [-1, 1] to [0, screen.width]
	** - Convert y range from [-1, 1] to [0, screen.height]
	** - Negate y to use WebGL convension
	*/
	return {
		x: point.x / point.w * halfWidth + halfWidth,
		y: -point.y / point.w * halfHeight + halfHeight,
		z: point.z / point.w
	};
};

const loadImageData = (url: string) => {
	return new Promise<ImageData>((resolve, reject) => {
		const image = new Image();

		image.onabort = () => reject(`image load aborted: "${url}"`);
		image.onerror = () => reject(`image load failed: "${url}"`);
		image.onload = () => {
			const canvas = document.createElement('canvas');

			canvas.height = image.height;
			canvas.width = image.width;

			const context = canvas.getContext('2d');

			if (context === null)
				return reject("cannot get canvas 2d contxt");

			context.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

			resolve(context.getImageData(0, 0, canvas.width, canvas.height));
		};

		image.src = url;
	});
};

class Renderer {
	private readonly screen: display.Context2DScreen;

	public constructor(screen: display.Context2DScreen) {
		this.screen = screen;
	}

	public clear() {
		const screen = this.screen;

		screen.context.fillStyle = 'black';
		screen.context.fillRect(0, 0, screen.getWidth(), screen.getHeight());
	}

	public draw(model: model.Model, projection: matrix.Matrix4, modelView: matrix.Matrix4, drawMode: DrawMode) {
		const screen = this.screen;
		const capture = screen.context.getImageData(0, 0, screen.getWidth(), screen.getHeight());

		const image = {
			colors: capture.data,
			depths: new Float32Array(capture.width * capture.height),
			height: capture.height,
			width: capture.width
		};

		image.depths.fill(Math.pow(2, 127));

		const halfWidth = screen.getWidth() * 0.5;
		const halfHeight = screen.getHeight() * 0.5;
		const modelViewProjection = projection.compose(modelView);

		const triangle = drawMode === DrawMode.Default ? fillTriangle : wireTriangle;
		const vertices: Vertex[] = [];

		let index = 0;

		for (const mesh of model.meshes) {
			const colors = mesh.colors || defaultAttribute;
			const coords = mesh.coords || defaultAttribute;
			const indices = mesh.indices;
			const material = model.materials !== undefined && mesh.materialName !== undefined ? model.materials[mesh.materialName] : undefined;
			const points = mesh.points;

			indices.forEach(i => {
				vertices[index++] = {
					color: { x: colors.buffer[i * colors.stride + 0], y: colors.buffer[i * colors.stride + 1], z: colors.buffer[i * colors.stride + 2], w: colors.buffer[i * colors.stride + 3] },
					coord: { x: coords.buffer[i * coords.stride + 0], y: coords.buffer[i * coords.stride + 1] },
					point: projectToScreen(modelViewProjection, halfWidth, halfHeight, { x: points.buffer[i * points.stride + 0], y: points.buffer[i * points.stride + 1], z: points.buffer[i * points.stride + 2] })
				};

				if (index >= 3) {
					triangle(image, vertices[0], vertices[1], vertices[2], material);

					index = 0;
				}
			});
		}

		screen.context.putImageData(capture, 0, 0);
	}
}

export { DrawMode, Renderer };
