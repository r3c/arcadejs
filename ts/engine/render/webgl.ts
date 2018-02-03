import * as functional from "../type/functional";
import * as math from "../math";
import * as model from "../model";

type ShaderUniformMatrix<T> = (location: WebGLUniformLocation, transpose: boolean, value: T) => void;
type ShaderUniformValue<T> = (location: WebGLUniformLocation, value: T) => void;

interface Binding {
	ambientColor?: UniformValue<number[]>,
	ambientMap?: UniformTexture,
	colors?: Attribute,
	coords?: Attribute,
	diffuseColor?: UniformValue<number[]>,
	diffuseMap?: UniformTexture,
	heightMap?: UniformTexture,
	modelViewMatrix: UniformValue<Float32Array>,
	normalMap?: UniformTexture,
	normalMatrix?: UniformValue<Float32Array>,
	normals?: Attribute,
	points: Attribute,
	projectionMatrix: UniformValue<Float32Array>,
	reflectionMap?: UniformTexture,
	shininess?: UniformValue<number>,
	specularColor?: UniformValue<number[]>,
	specularMap?: UniformTexture,
	tangents?: Attribute
}

interface Material {
	ambientColor: number[],
	ambientMap: WebGLTexture,
	diffuseColor: number[],
	diffuseMap: WebGLTexture,
	heightMap: WebGLTexture,
	normalMap: WebGLTexture,
	reflectionMap: WebGLTexture,
	shininess: number,
	specularColor: number[],
	specularMap: WebGLTexture
}

interface MaterialMap {
	[name: string]: Material
}

interface Mesh {
	colors: WebGLBuffer | undefined,
	coords: WebGLBuffer | undefined,
	count: number,
	indices: WebGLBuffer,
	material: Material,
	normals: WebGLBuffer | undefined,
	points: WebGLBuffer,
	tangents: WebGLBuffer | undefined
}

interface Quality {
	textureElementLinear: boolean,
	textureMipmapLinear: boolean
}

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

const defaultQuality = {
	textureElementLinear: true,
	textureMipmapLinear: false
};

const defaultShininess = 1;

const createBuffer = (gl: WebGLRenderingContext, target: number, values: ArrayBufferView) => {
	const buffer = gl.createBuffer();

	if (buffer === null)
		throw Error("could not create buffer");

	gl.bindBuffer(target, buffer);
	gl.bufferData(target, values, gl.STATIC_DRAW);

	return buffer;
};

const createTextureImage = (gl: WebGLRenderingContext, image: ImageData, quality: Quality) => {
	const isPowerOf2 = (value: number) => {
		return ((value - 1) & value) === 0;
	};

	if (!isPowerOf2(image.width) || !isPowerOf2(image.height))
		throw Error("image doesn't have power-of-2 dimensions");

	const texture = gl.createTexture();

	if (texture === null)
		throw Error("texture creation failed");

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, quality.textureElementLinear ? gl.LINEAR : gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, quality.textureElementLinear
		? (quality.textureMipmapLinear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR)
		: (quality.textureMipmapLinear ? gl.LINEAR_MIPMAP_NEAREST : gl.NEAREST_MIPMAP_NEAREST));
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return texture;
};

const invalidAttributeBinding = (name: string) => {
	return Error(`cannot draw a mesh with no ${name} attribute when shader expects one`);
};

const toArray2 = (input: math.Vector2) => [input.x, input.y];
const toArray3 = (input: math.Vector3) => [input.x, input.y, input.z];
const toArray4 = (input: math.Vector4) => [input.x, input.y, input.z, input.w];
const toArrayBuffer = <T, U>(constructor: { new(items: number[]): T }, items: U[], toArray: (input: U) => number[]) => new constructor(functional.flatten(items.map(toArray)));

class Attribute {
	private readonly gl: WebGLRenderingContext;
	private readonly location: number;
	private readonly size: number;
	private readonly type: number;

	public constructor(gl: WebGLRenderingContext, location: number, size: number, type: number) {
		this.gl = gl;
		this.location = location;
		this.size = size;
		this.type = type;
	}

	public clear() {
		this.gl.disableVertexAttribArray(this.location);
	}

	public set(buffer: WebGLBuffer) {
		const gl = this.gl;

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.vertexAttribPointer(this.location, this.size, this.type, false, 0, 0);
		gl.enableVertexAttribArray(this.location);
	}
}

class Renderer {
	private readonly defaultMap: WebGLTexture;
	private readonly gl: WebGLRenderingContext;
	private readonly quality: Quality;

	public constructor(gl: WebGLRenderingContext, quality: Quality = defaultQuality) {
		const blankImage = new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1);

		gl.clearColor(0, 0, 0, 1);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.clearDepth(1.0);

		this.defaultMap = createTextureImage(gl, blankImage, quality);
		this.gl = gl;
		this.quality = quality;
	}

	public clear() {
		const gl = this.gl;

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	};

	public load(model: model.Model) {
		const definitions = model.materials || {};
		const gl = this.gl;
		const materials: MaterialMap = {};
		const meshes: Mesh[] = [];

		for (const mesh of model.meshes) {
			const name = mesh.materialName;

			let material: Material;

			if (name !== undefined && definitions[name] !== undefined) {
				if (materials[name] === undefined) {
					const definition = definitions[name];

					const ambientColor = definition.ambientColor || defaultColor;
					const ambientMap = definition.ambientMap !== undefined
						? createTextureImage(gl, definition.ambientMap, this.quality)
						: this.defaultMap;
					const diffuseColor = definition.diffuseColor || ambientColor;
					const diffuseMap = definition.diffuseMap !== undefined
						? createTextureImage(gl, definition.diffuseMap, this.quality)
						: ambientMap;
					const specularColor = definition.specularColor || diffuseColor;
					const specularMap = definition.specularMap !== undefined
						? createTextureImage(gl, definition.specularMap, this.quality)
						: diffuseMap;

					materials[name] = {
						ambientColor: toArray4(ambientColor),
						ambientMap: ambientMap,
						diffuseColor: toArray4(diffuseColor),
						diffuseMap: diffuseMap,
						heightMap: definition.heightMap !== undefined
							? createTextureImage(gl, definition.heightMap, this.quality)
							: this.defaultMap,
						normalMap: definition.normalMap !== undefined
							? createTextureImage(gl, definition.normalMap, this.quality)
							: this.defaultMap,
						reflectionMap: definition.reflectionMap !== undefined
							? createTextureImage(gl, definition.reflectionMap, this.quality)
							: this.defaultMap,
						shininess: functional.coalesce(definition.shininess, defaultShininess),
						specularColor: toArray4(specularColor),
						specularMap: specularMap
					}
				}

				material = materials[name];
			}
			else {
				material = {
					ambientColor: toArray4(defaultColor),
					ambientMap: this.defaultMap,
					diffuseColor: toArray4(defaultColor),
					diffuseMap: this.defaultMap,
					heightMap: this.defaultMap,
					normalMap: this.defaultMap,
					reflectionMap: this.defaultMap,
					shininess: defaultShininess,
					specularColor: toArray4(defaultColor),
					specularMap: this.defaultMap
				};
			}

			meshes.push({
				colors: mesh.colors !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, toArrayBuffer(Float32Array, mesh.colors, toArray4))
					: undefined,
				coords: mesh.coords !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, toArrayBuffer(Float32Array, mesh.coords, toArray2))
					: undefined,
				count: mesh.triangles.length * 3,
				indices: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, toArrayBuffer(Uint16Array, mesh.triangles, indices => indices)),
				material: material,
				normals: mesh.normals !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, toArrayBuffer(Float32Array, mesh.normals, toArray3))
					: undefined,
				points: createBuffer(gl, gl.ARRAY_BUFFER, toArrayBuffer(Float32Array, mesh.points, toArray3)),
				tangents: mesh.tangents !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, toArrayBuffer(Float32Array, mesh.tangents, toArray3))
					: undefined
			});
		}

		return meshes;
	}
}

class Shader {
	private readonly gl: WebGLRenderingContext;
	private readonly program: WebGLProgram;

	public constructor(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
		const program = gl.createProgram();

		if (program === null)
			throw Error("could not create program");

		gl.attachShader(program, Shader.compile(gl, gl.VERTEX_SHADER, vsSource));
		gl.attachShader(program, Shader.compile(gl, gl.FRAGMENT_SHADER, fsSource));
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const error = gl.getProgramInfoLog(program);

			gl.deleteProgram(program);

			throw Error(`could not link program: ${error}`);
		}

		this.gl = gl;
		this.program = program;
	}

	public declareAttribute(name: string, size: number, type: number): Attribute {
		const gl = this.gl;
		const location = gl.getAttribLocation(this.program, name);

		if (location === -1)
			throw Error(`cound not find location for attribute "${name}"`);

		return new Attribute(gl, location, size, type);
	}

	public declareMatrix<T>(name: string, method: (gl: WebGLRenderingContext) => ShaderUniformMatrix<T>): UniformValue<T> {
		const gl = this.gl;
		const location = gl.getUniformLocation(this.program, name);

		if (location === null)
			throw Error(`cound not find location for matrix uniform "${name}"`);

		const assign = method(gl);

		return new UniformValue(gl, this.program, (value: T) => assign.call(gl, location, false, value));
	}

	public declareTexture(name: string): UniformTexture {
		const gl = this.gl;
		const location = gl.getUniformLocation(this.program, name);

		if (location === null)
			throw Error(`cound not find location for texture uniform "${name}"`);

		return new UniformTexture(gl, this.program, location);
	}

	public declareValue<T>(name: string, method: (gl: WebGLRenderingContext) => ShaderUniformValue<T>): UniformValue<T> {
		const gl = this.gl;
		const location = gl.getUniformLocation(this.program, name);

		if (location === null)
			throw Error(`cound not find location for vector uniform "${name}"`);

		const assign = method(gl);

		return new UniformValue(gl, this.program, (value: T) => assign.call(gl, location, value));
	}

	public draw(binding: Binding, meshes: Mesh[], projection: math.Matrix, modelView: math.Matrix) {
		for (const mesh of meshes) {
			const material = mesh.material;

			// Bind colors vector if defined and supported
			if (binding.colors !== undefined) {
				if (mesh.colors === undefined)
					throw invalidAttributeBinding("colors");

				binding.colors.set(mesh.colors);
			}

			// Bind coords vector if defined and supported
			if (binding.coords !== undefined) {
				if (mesh.coords === undefined)
					throw invalidAttributeBinding("coords");

				binding.coords.set(mesh.coords);
			}

			// Bind face normals if defined and supported
			if (binding.normals !== undefined) {
				if (mesh.normals === undefined)
					throw invalidAttributeBinding("normals");

				binding.normals.set(mesh.normals);
			}

			// Bind face tangents if defined and supported
			if (binding.tangents !== undefined) {
				if (mesh.tangents === undefined)
					throw invalidAttributeBinding("tangents");

				binding.tangents.set(mesh.tangents);
			}

			// Bind points vector
			binding.points.set(mesh.points);

			// Bind known uniforms if supported
			let textureIndex = 0;

			if (binding.ambientColor !== undefined)
				binding.ambientColor.set(material.ambientColor);

			if (binding.ambientMap !== undefined)
				binding.ambientMap.set(material.ambientMap, textureIndex++);

			if (binding.diffuseColor !== undefined)
				binding.diffuseColor.set(material.diffuseColor);

			if (binding.diffuseMap !== undefined)
				binding.diffuseMap.set(material.diffuseMap, textureIndex++);

			if (binding.heightMap !== undefined)
				binding.heightMap.set(material.heightMap, textureIndex++);

			if (binding.normalMap !== undefined)
				binding.normalMap.set(material.normalMap, textureIndex++);

			if (binding.normalMatrix !== undefined)
				binding.normalMatrix.set(new Float32Array(modelView.getTransposedInverse3x3()));

			if (binding.reflectionMap !== undefined)
				binding.reflectionMap.set(material.reflectionMap, textureIndex++);

			if (binding.shininess !== undefined)
				binding.shininess.set(material.shininess);

			if (binding.specularColor !== undefined)
				binding.specularColor.set(material.specularColor);

			if (binding.specularMap !== undefined)
				binding.specularMap.set(material.specularMap, textureIndex++);

			binding.modelViewMatrix.set(new Float32Array(modelView.getValues()));
			binding.projectionMatrix.set(new Float32Array(projection.getValues()));

			// Perform draw call
			const gl = this.gl;

			gl.useProgram(this.program);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
			gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
		}
	}

	private static compile(gl: WebGLRenderingContext, shaderType: number, source: string) {
		const shader = gl.createShader(shaderType);

		if (shader === null)
			throw Error(`could not create shader`);

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(shader);

			gl.deleteShader(shader);

			throw Error(`could not compile shader: ${error}`);
		}

		return shader;
	}
}

class UniformTexture {
	private readonly gl: WebGLRenderingContext;
	private readonly location: WebGLUniformLocation;
	private readonly program: WebGLProgram;

	public constructor(gl: WebGLRenderingContext, program: WebGLProgram, location: WebGLUniformLocation) {
		this.gl = gl;
		this.location = location;
		this.program = program;
	}

	public set(texture: WebGLTexture, index: number) {
		const gl = this.gl;

		gl.useProgram(this.program);
		gl.activeTexture(gl.TEXTURE0 + index);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.uniform1i(this.location, index);
	}
}

class UniformValue<T> {
	private readonly assign: (value: T) => void;
	private readonly gl: WebGLRenderingContext;
	private readonly program: WebGLProgram;

	public constructor(gl: WebGLRenderingContext, program: WebGLProgram, assign: (value: T) => void) {
		this.assign = assign;
		this.gl = gl;
		this.program = program;
	}

	public set(value: T) {
		const gl = this.gl;

		gl.useProgram(this.program);

		this.assign(value);
	}
}

export { Binding, Mesh, Renderer, Shader, UniformValue }