import * as functional from "../type/functional";
import * as math from "../math";
import * as model from "../model";

interface ShaderAttribute {
	location: number,
	size: number,
	type: number
}

type ShaderUniformMatrix<T> = (location: WebGLUniformLocation, transpose: boolean, value: T) => void;
type ShaderUniformValue<T> = (location: WebGLUniformLocation, value: T) => void;
type ShaderUniform<T> = (gl: WebGLRenderingContext, value: T) => void;

interface Binding {
	ambientColor?: ShaderUniform<number[]>,
	ambientMap?: ShaderUniform<number>,
	colors?: ShaderAttribute,
	coords?: ShaderAttribute,
	diffuseColor?: ShaderUniform<number[]>,
	diffuseMap?: ShaderUniform<number>,
	heightMap?: ShaderUniform<number>,
	modelViewMatrix: ShaderUniform<Float32Array>,
	normalMap?: ShaderUniform<number>,
	normalMatrix?: ShaderUniform<Float32Array>,
	normals?: ShaderAttribute,
	points: ShaderAttribute,
	projectionMatrix: ShaderUniform<Float32Array>,
	reflectionMap?: ShaderUniform<number>,
	shininess?: ShaderUniform<number>,
	specularColor?: ShaderUniform<number[]>,
	specularMap?: ShaderUniform<number>,
	tangents?: ShaderAttribute
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

const createTexture = (gl: WebGLRenderingContext, image: ImageData, quality: Quality) => {
	const isPowerOf2 = (value: number) => {
		return ((value - 1) & value) === 0;
	};

	const texture = gl.createTexture();

	if (texture === null)
		throw Error("texture creation failed");

	if (!isPowerOf2(image.width) || !isPowerOf2(image.height))
		throw Error("image doesn't have power-of-2 dimensions");

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

		this.defaultMap = createTexture(gl, blankImage, quality);
		this.gl = gl;
		this.quality = quality;
	}

	public clear() {
		const gl = this.gl;

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	};

	public draw(shader: Shader, binding: Binding, meshes: Mesh[], projection: math.Matrix, modelView: math.Matrix) {
		for (const mesh of meshes) {
			const material = mesh.material;

			// Bind colors vector if defined and supported
			if (binding.colors !== undefined) {
				if (mesh.colors === undefined)
					throw invalidAttributeBinding("colors");

				shader.setAttribute(binding.colors, mesh.colors);
			}

			// Bind coords vector if defined and supported
			if (binding.coords !== undefined) {
				if (mesh.coords === undefined)
					throw invalidAttributeBinding("coords");

				shader.setAttribute(binding.coords, mesh.coords);
			}

			// Bind face normals if defined and supported
			if (binding.normals !== undefined) {
				if (mesh.normals === undefined)
					throw invalidAttributeBinding("normals");

				shader.setAttribute(binding.normals, mesh.normals);
			}

			// Bind face tangents if defined and supported
			if (binding.tangents !== undefined) {
				if (mesh.tangents === undefined)
					throw invalidAttributeBinding("tangents");

				shader.setAttribute(binding.tangents, mesh.tangents);
			}

			// Bind points vector
			shader.setAttribute(binding.points, mesh.points);

			// Bind known uniforms if supported
			let textureIndex = 0;

			if (binding.ambientColor !== undefined)
				shader.setUniform(binding.ambientColor, material.ambientColor);

			if (binding.ambientMap !== undefined)
				shader.setTexture(binding.ambientMap, material.ambientMap, textureIndex++);

			if (binding.diffuseColor !== undefined)
				shader.setUniform(binding.diffuseColor, material.diffuseColor);

			if (binding.diffuseMap !== undefined)
				shader.setTexture(binding.diffuseMap, material.diffuseMap, textureIndex++);

			if (binding.heightMap !== undefined)
				shader.setTexture(binding.heightMap, material.heightMap, textureIndex++);

			if (binding.normalMap !== undefined)
				shader.setTexture(binding.normalMap, material.normalMap, textureIndex++);

			if (binding.normalMatrix !== undefined)
				shader.setUniform(binding.normalMatrix, new Float32Array(modelView.getTransposedInverse3x3()));

			if (binding.reflectionMap !== undefined)
				shader.setTexture(binding.reflectionMap, material.reflectionMap, textureIndex++);

			if (binding.shininess !== undefined)
				shader.setUniform(binding.shininess, material.shininess);

			if (binding.specularColor !== undefined)
				shader.setUniform(binding.specularColor, material.specularColor);

			if (binding.specularMap !== undefined)
				shader.setTexture(binding.specularMap, material.specularMap, textureIndex++);

			shader.setUniform(binding.modelViewMatrix, new Float32Array(modelView.getValues()));
			shader.setUniform(binding.projectionMatrix, new Float32Array(projection.getValues()));

			// Perform draw call
			shader.draw(mesh.indices, mesh.count);
		}
	}

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
						? createTexture(gl, definition.ambientMap, this.quality)
						: this.defaultMap;
					const diffuseColor = definition.diffuseColor || ambientColor;
					const diffuseMap = definition.diffuseMap !== undefined
						? createTexture(gl, definition.diffuseMap, this.quality)
						: ambientMap;
					const specularColor = definition.specularColor || diffuseColor;
					const specularMap = definition.specularMap !== undefined
						? createTexture(gl, definition.specularMap, this.quality)
						: diffuseMap;

					materials[name] = {
						ambientColor: toArray4(ambientColor),
						ambientMap: ambientMap,
						diffuseColor: toArray4(diffuseColor),
						diffuseMap: diffuseMap,
						heightMap: definition.heightMap !== undefined
							? createTexture(gl, definition.heightMap, this.quality)
							: this.defaultMap,
						normalMap: definition.normalMap !== undefined
							? createTexture(gl, definition.normalMap, this.quality)
							: this.defaultMap,
						reflectionMap: definition.reflectionMap !== undefined
							? createTexture(gl, definition.reflectionMap, this.quality)
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

	public activate() {
		this.gl.useProgram(this.program);
	}

	public declareAttribute(name: string, size: number, type: number): ShaderAttribute {
		const location = this.gl.getAttribLocation(this.program, name);

		if (location === -1)
			throw Error(`cound not find location for attribute "${name}"`);

		return {
			location: location,
			size: size,
			type: type
		};
	}

	public declareUniformMatrix<T>(name: string, method: (gl: WebGLRenderingContext) => ShaderUniformMatrix<T>): ShaderUniform<T> {
		const location = this.gl.getUniformLocation(this.program, name);

		if (location === null)
			throw Error(`cound not find location for matrix uniform "${name}"`);

		const assign = method(this.gl);

		return (gl, value) => assign.call(gl, location, false, value);
	}

	public declareUniformValue<T>(name: string, method: (gl: WebGLRenderingContext) => ShaderUniformValue<T>): ShaderUniform<T> {
		const location = this.gl.getUniformLocation(this.program, name);

		if (location === null)
			throw Error(`cound not find location for vector uniform "${name}"`);

		const assign = method(this.gl);

		return (gl, value) => assign.call(gl, location, value);
	}

	public draw(indices: WebGLBuffer, count: number) {
		const gl = this.gl;

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
		gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
	}

	public setAttribute(attribute: ShaderAttribute, buffer?: WebGLBuffer) {
		const gl = this.gl;

		if (buffer !== undefined) {
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, false, 0, 0);
			gl.enableVertexAttribArray(attribute.location);
		}
		else
			gl.disableVertexAttribArray(attribute.location);
	}

	public setTexture(uniform: ShaderUniform<number>, texture: WebGLTexture, index: number) {
		const gl = this.gl;

		gl.activeTexture(gl.TEXTURE0 + index);
		gl.bindTexture(gl.TEXTURE_2D, texture);

		uniform(gl, index);
	}

	public setUniform<T>(uniform: ShaderUniform<T>, value: T) {
		uniform(this.gl, value);
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

export { Binding, Mesh, Renderer, Shader, ShaderUniform }