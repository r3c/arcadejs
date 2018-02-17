import * as vector from "../math/vector";

interface Material {
	ambientColor?: vector.Vector4,
	ambientMap?: ImageData,
	diffuseColor?: vector.Vector4,
	diffuseMap?: ImageData,
	heightMap?: ImageData,
	normalMap?: ImageData,
	reflectionMap?: ImageData,
	shininess?: number,
	specularColor?: vector.Vector4,
	specularMap?: ImageData
}

interface Mesh {
	colors?: vector.Vector4[],
	coords?: vector.Vector2[],
	materialName?: string,
	normals?: vector.Vector3[],
	points: vector.Vector3[],
	tangents?: vector.Vector3[],
	triangles: [number, number, number][]
}

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

const loadImage = async (url: string) => {
	return new Promise<ImageData>((resolve, reject) => {
		const image = new Image();

		image.onabort = () => reject(`image load aborted on URL "${url}"`);
		image.onerror = () => reject(`image load failed on URL "${url}"`);
		image.onload = () => {
			const canvas = document.createElement('canvas');

			canvas.height = image.height;
			canvas.width = image.width;

			const context = canvas.getContext('2d');

			if (context === null)
				return reject(`image loaded failed (cannot get canvas 2d context) on URL "${url}"`);

			context.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

			resolve(context.getImageData(0, 0, canvas.width, canvas.height));
		};

		image.src = url;
	});
};

export { Material, Mesh, defaultColor, loadImage }