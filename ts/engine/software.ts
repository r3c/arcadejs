import * as display from "./display";
import * as graphic from "./graphic";
import * as math from "./math";

enum DrawMode {
	Default,
	Wire
}

interface Image {
	colors: Uint8ClampedArray;
	depths: Float32Array;
	height: number;
	width: number;
}

interface Material {
	colorMap: ImageData | undefined;
}

interface MaterialMap {
	[name: string]: Material;
}

interface Mesh {
	colors: math.Vector4[] | undefined;
	coords: math.Vector2[] | undefined;
	faces: [number, number, number][];
	material: Material;
	normals: math.Vector3[] | undefined;
	positions: math.Vector3[];
}

interface Vertex {
	color: math.Vector4;
	coord: math.Vector2;
	point: math.Vector3;
}

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

const lerpVector2 = (min: math.Vector2, max: math.Vector2, ratio: number) => {
	return {
		x: lerpScalar(min.x, max.x, ratio),
		y: lerpScalar(min.y, max.y, ratio)
	}
};

const lerpVector4 = (min: math.Vector4, max: math.Vector4, ratio: number) => {
	return {
		x: lerpScalar(min.x, max.x, ratio),
		y: lerpScalar(min.y, max.y, ratio),
		z: lerpScalar(min.z, max.z, ratio),
		w: lerpScalar(min.w, max.w, ratio)
	}
};

const fillScanline = (image: Image, y: number, va: Vertex, vb: Vertex, vc: Vertex, vd: Vertex, material: Material | undefined) => {
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

		// Ambient map
		if (material !== undefined && material.colorMap !== undefined) {
			const coord = lerpVector2(begin.coord, end.coord, ratio);
			const image = material.colorMap;

			const x = ~~(coord.x * image.width) % image.width;
			const y = ~~(coord.y * image.height) % image.height;

			const coordIndex = (x + y * image.width) * 4;

			color.x *= image.data[coordIndex + 0] / 255;
			color.y *= image.data[coordIndex + 1] / 255;
			color.z *= image.data[coordIndex + 2] / 255;
			color.w *= image.data[coordIndex + 3] / 255;
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
const fillTriangle = (image: Image, v1: Vertex, v2: Vertex, v3: Vertex, material: Material | undefined) => {
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

const projectToScreen = (modelViewProjection: math.Matrix, halfWidth: number, halfHeight: number, position: math.Vector3) => {
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

const draw = (screen: display.Context2DScreen, projection: math.Matrix, modelView: math.Matrix, drawMode: DrawMode, meshes: Mesh[]) => {
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

	for (const mesh of meshes) {
		const colors = mesh.colors || [];
		const coords = mesh.coords || [];
		const faces = mesh.faces;
		const material = mesh.material;
		const positions = mesh.positions;

		for (const [i, j, k] of faces) {
			const vertex1 = {
				color: colors[i] || defaultColor,
				coord: coords[i] || defaultCoord,
				point: projectToScreen(modelViewProjection, halfWidth, halfHeight, positions[i])
			};

			const vertex2 = {
				color: colors[j] || defaultColor,
				coord: coords[j] || defaultCoord,
				point: projectToScreen(modelViewProjection, halfWidth, halfHeight, positions[j])
			};

			const vertex3 = {
				color: colors[k] || defaultColor,
				coord: coords[k] || defaultCoord,
				point: projectToScreen(modelViewProjection, halfWidth, halfHeight, positions[k])
			};

			triangle(image, vertex1, vertex2, vertex3, material);
		}
	}

	screen.context.putImageData(capture, 0, 0);
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

const load = async (model: graphic.Model, path: string = "") => {
	const definitions = model.materials || {};
	const materials: MaterialMap = {};
	const meshes: Mesh[] = [];

	for (const mesh of model.meshes) {
		let material: Material;
		const name = mesh.materialName;

		if (name !== undefined && definitions[name] !== undefined) {
			if (materials[name] === undefined) {
				const definition = definitions[name];

				materials[name] = {
					colorMap: definition.colorMap !== undefined
						? await loadImageData(path + definition.colorMap)
						: undefined
				}
			}

			material = materials[name];
		}
		else {
			material = {
				colorMap: undefined
			};
		}

		meshes.push({
			colors: mesh.colors,
			coords: mesh.coords,
			faces: mesh.indices,
			material: material,
			normals: mesh.normals,
			positions: mesh.points
		})
	}

	return meshes;
};

export { DrawMode, Mesh, draw, load };
