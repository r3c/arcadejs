import * as matrix from "../math/matrix";
import * as vector from "../math/vector";

type Array = Float32Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array;

interface Attribute {
	buffer: Array,
	componentCount: number
}

interface Geometry {
	colors?: Attribute,
	coords?: Attribute,
	indices: Array
	materialName?: string,
	normals?: Attribute,
	points: Attribute,
	tangents?: Attribute,
}

const enum Interpolation {
	Linear,
	Nearest
}

interface Material {
	albedoFactor?: vector.Vector4,
	albedoMap?: Texture,
	emissiveFactor?: vector.Vector4,
	emissiveMap?: Texture,
	glossFactor?: vector.Vector4,
	glossMap?: Texture,
	heightMap?: Texture,
	heightParallaxBias?: number,
	heightParallaxScale?: number,
	metalnessMap?: Texture,
	metalnessStrength?: number,
	normalMap?: Texture,
	occlusionMap?: Texture,
	occlusionStrength?: number,
	roughnessMap?: Texture,
	roughnessStrength?: number,
	shininess?: number
}

interface Mesh {
	materials: { [name: string]: Material },
	nodes: Node[]
}

interface Node {
	children: Node[],
	geometries: Geometry[],
	transform: matrix.Matrix4
}

interface Texture {
	image: ImageData,
	magnifier: Interpolation,
	minifier: Interpolation,
	mipmap: boolean,
	wrap: Wrap
}

const enum Wrap {
	Clamp,
	Repeat,
	Mirror
}

const channelIndices: { [name: string]: number } = {
	r: 0,
	g: 1,
	b: 2,
	a: 3
};

const defaultColor: vector.Vector4 = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

const loadImage = async (identifier: string) => {
	const match = /(.*?)(?::([abgr]{1,4}))?$/.exec(identifier);

	if (match === null)
		return Promise.reject(`could not extract path from image identifier "${identifier}"`);

	const channels = match[2];
	const url = match[1];

	// Read source channel indices
	const indices: number[] = [];

	if (channels) {
		for (const channel of channels) {
			const index = channelIndices[channel];

			if (index === undefined)
				return Promise.reject(`unknown channel "${channel}" in image identifier "${identifier}"`);

			indices.push(index);
		}
	}

	// Read image from URL
	return new Promise<ImageData>((resolve, reject) => {
		const image = new Image();

		image.crossOrigin = "anonymous";
		image.onabort = () => reject(`image load aborted on URL "${url}"`);
		image.onerror = () => reject(`image load failed on URL "${url}"`);
		image.onload = () => {
			const canvas = document.createElement("canvas");

			canvas.height = image.height;
			canvas.width = image.width;

			const context = canvas.getContext("2d");

			if (context === null)
				return reject(`image loaded failed (cannot get canvas 2d context) on URL "${url}"`);

			context.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

			const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

			if (indices.length > 0) {
				for (let i = imageData.width * imageData.height; i > 0; --i) {
					const offset = (i - 1) * 4;
					const pixel = indices.map(i => imageData.data[offset + i]).concat([0, 0, 0]);

					imageData.data[offset + 0] = pixel[0];
					imageData.data[offset + 1] = pixel[1];
					imageData.data[offset + 2] = pixel[2];
					imageData.data[offset + 3] = pixel[3];
				}
			}

			resolve(imageData);
		};

		image.src = url;
	});
};

export { Array, Attribute, Geometry, Interpolation, Material, Mesh, Node, Texture, Wrap, defaultColor, loadImage }
