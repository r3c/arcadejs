import * as graphic from "./graphic";
import * as math from "./math";

interface ShaderAttribute {
	location: number,
	size: number,
	type: number
}

type ShaderUniformMatrix<T> = (location: WebGLUniformLocation, transpose: boolean, value: T) => void;
type ShaderUniformValue<T> = (location: WebGLUniformLocation, value: T) => void;
type ShaderUniform<T> = (gl: WebGLRenderingContext, value: T) => void;

interface Binding {
	colorBase?: ShaderUniform<number[]>,
	colorMap?: ShaderUniform<number>,
	colors?: ShaderAttribute,
	coords?: ShaderAttribute,
	modelViewMatrix: ShaderUniform<number[]>,
	normalMatrix?: ShaderUniform<number[]>,
	normals?: ShaderAttribute,
	points: ShaderAttribute,
	projectionMatrix: ShaderUniform<number[]>
}

interface Material {
	colorBase: number[],
	colorMap: WebGLTexture | undefined
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
	points: WebGLBuffer
}

interface Quality {
	textureElementLinear: boolean,
	textureMipmapLinear: boolean
}

const defaultQuality = {
	textureElementLinear: true,
	textureMipmapLinear: false
};

const createBuffer = (gl: WebGLRenderingContext, target: number, values: ArrayBufferView) => {
	const buffer = gl.createBuffer();

	if (buffer === null)
		throw Error("could not create buffer");

	gl.bindBuffer(target, buffer);
	gl.bufferData(target, values, gl.STATIC_DRAW);

	return buffer;
};

const createTexture = async (gl: WebGLRenderingContext, url: string, quality: Quality) => {
	const isPowerOf2 = (value: number) => {
		return ((value - 1) & value) === 0;
	};

	return new Promise<WebGLTexture>((resolve, reject) => {
		const image = new Image();

		image.onabort = () => reject(`image load aborted: "${url}"`);
		image.onerror = () => reject(`image load failed: "${url}"`);
		image.onload = () => {
			const texture = gl.createTexture();

			if (texture === null)
				return reject(`texture creation failed: "${url}"`);

			if (!isPowerOf2(image.width) || !isPowerOf2(image.height))
				return reject(`image doesn't have power-of-2 dimensions: "${url}"`);

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, quality.textureElementLinear ? gl.LINEAR : gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, quality.textureElementLinear
				? (quality.textureMipmapLinear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR)
				: (quality.textureMipmapLinear ? gl.LINEAR_MIPMAP_NEAREST : gl.NEAREST_MIPMAP_NEAREST));
			gl.generateMipmap(gl.TEXTURE_2D);
			gl.bindTexture(gl.TEXTURE_2D, null);

			resolve(texture);
		};

		image.src = url;
	});
};

const flatMap = <T, U>(items: T[], convert: (item: T) => U[]) => {
	return new Array<U>().concat(...items.map(convert));
};

class Renderer {
	private readonly gl: WebGLRenderingContext;
	private readonly quality: Quality;

	public constructor(gl: WebGLRenderingContext, quality: Quality = defaultQuality) {
		gl.clearColor(0, 0, 0, 1);
		gl.clearDepth(1.0);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.DEPTH_TEST);

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
			if (mesh.colors !== undefined && binding.colors !== undefined)
				shader.setAttribute(binding.colors, mesh.colors);

			// Bind coords vector if defined and supported
			if (mesh.coords !== undefined && binding.coords !== undefined)
				shader.setAttribute(binding.coords, mesh.coords);

			// Bind face normals if defined and supported
			if (mesh.normals !== undefined && binding.normals !== undefined)
				shader.setAttribute(binding.normals, mesh.normals);

			// Bind color map texture if defined and supported
			if (material.colorMap !== undefined && binding.colorMap !== undefined)
				shader.setTexture(binding.colorMap, material.colorMap, 0);

			// Bind points vector
			shader.setAttribute(binding.points, mesh.points);

			// Set base color uniform
			if (binding.colorBase !== undefined)
				shader.setUniform(binding.colorBase, material.colorBase);

			// Set matrix uniforms
			if (binding.normalMatrix !== undefined)
				shader.setUniform(binding.normalMatrix, modelView.getTransposedInverse3x3());

			shader.setUniform(binding.modelViewMatrix, modelView.getValues());
			shader.setUniform(binding.projectionMatrix, projection.getValues());

			// Perform draw call
			shader.draw(mesh.indices, mesh.count);
		}
	}

	public async load(model: graphic.Model, path: string = "") {
		const definitions = model.materials || {};
		const gl = this.gl;
		const materials: MaterialMap = {};
		const meshes: Mesh[] = [];

		for (const mesh of model.meshes) {
			let material: Material;
			const name = mesh.materialName;

			if (name !== undefined && definitions[name] !== undefined) {
				if (materials[name] === undefined) {
					const definition = definitions[name];

					materials[name] = {
						colorBase: [definition.colorBase.x, definition.colorBase.y, definition.colorBase.z, definition.colorBase.w],
						colorMap: definition.colorMap !== undefined
							? await createTexture(gl, path + definition.colorMap, this.quality)
							: undefined
					}
				}

				material = materials[name];
			}
			else {
				material = {
					colorBase: [1, 1, 1, 1],
					colorMap: undefined
				};
			}

			meshes.push({
				colors: mesh.colors !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.colors, color => [color.x, color.y, color.z, color.w])))
					: undefined,
				coords: mesh.coords !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.coords, coord => [coord.x, coord.y])))
					: undefined,
				count: mesh.indices.length * 3,
				indices: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(flatMap(mesh.indices, index => [index[0], index[1], index[2]]))),
				material: material,
				normals: mesh.normals !== undefined
					? createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.normals, normal => [normal.x, normal.y, normal.z])))
					: undefined,
				points: createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.points, position => [position.x, position.y, position.z])))
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

	public setAttribute(attribute: ShaderAttribute, buffer: WebGLBuffer) {
		const gl = this.gl;

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, false, 0, 0);
		gl.enableVertexAttribArray(attribute.location);
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