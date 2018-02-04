import * as functional from "../language/functional";
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
	ambientMap: WebGLTexture | undefined,
	diffuseColor: number[],
	diffuseMap: WebGLTexture | undefined,
	heightMap: WebGLTexture | undefined,
	normalMap: WebGLTexture | undefined,
	reflectionMap: WebGLTexture | undefined,
	shininess: number,
	specularColor: number[],
	specularMap: WebGLTexture | undefined
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

interface Stride {
	modelView: math.Matrix,
	subject: Subject
}

interface Subject {
	shader: Shader,
	binding: Binding,
	meshes: Mesh[]
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

const createTextureBlank = (gl: WebGLRenderingContext, width: number, height: number) => {
	const texture = gl.createTexture();

	if (texture === null)
		throw Error("texture creation failed");

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return texture;
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

const invalidAttributeBinding = (name: string) => Error(`cannot draw mesh with no ${name} attribute when shader expects one`);
const invalidUniformBinding = (name: string) => Error(`cannot draw mesh with no ${name} uniform when shader expects one`);

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
	private readonly gl: WebGLRenderingContext;

	public constructor(gl: WebGLRenderingContext) {
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		this.gl = gl;
	}

	public load(model: model.Model, quality: Quality = defaultQuality) {
		const definitions = model.materials || {};
		const gl = this.gl;
		const materials: { [name: string]: Material } = {};
		const meshes: Mesh[] = [];

		const toArray2 = (input: math.Vector2) => [input.x, input.y];
		const toArray3 = (input: math.Vector3) => [input.x, input.y, input.z];
		const toArray4 = (input: math.Vector4) => [input.x, input.y, input.z, input.w];
		const toBuffer = <T extends ArrayBufferView, U>(constructor: { new(items: number[]): T }, converter: (input: U) => number[], target: number) => (array: U[]) => createBuffer(gl, target, new constructor(functional.flatten(array.map(converter))));
		const toColorMap = (image: ImageData) => createTextureImage(gl, image, quality);
		const toIndices = (indices: [number, number, number]) => indices;

		for (const mesh of model.meshes) {
			const name = mesh.materialName;

			let material: Material;

			if (name !== undefined && definitions[name] !== undefined) {
				if (materials[name] === undefined) {
					const definition = definitions[name];

					const ambientColor = definition.ambientColor || defaultColor;
					const ambientMap = functional.map(definition.ambientMap, toColorMap);
					const diffuseColor = definition.diffuseColor || ambientColor;
					const diffuseMap = functional.map(definition.diffuseMap, toColorMap) || ambientMap;
					const specularColor = definition.specularColor || diffuseColor;
					const specularMap = functional.map(definition.specularMap, toColorMap) || diffuseMap;

					materials[name] = {
						ambientColor: toArray4(ambientColor),
						ambientMap: ambientMap,
						diffuseColor: toArray4(diffuseColor),
						diffuseMap: diffuseMap,
						heightMap: functional.map(definition.heightMap, toColorMap),
						normalMap: functional.map(definition.normalMap, toColorMap),
						reflectionMap: functional.map(definition.reflectionMap, toColorMap),
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
					ambientMap: undefined,
					diffuseColor: toArray4(defaultColor),
					diffuseMap: undefined,
					heightMap: undefined,
					normalMap: undefined,
					reflectionMap: undefined,
					shininess: defaultShininess,
					specularColor: toArray4(defaultColor),
					specularMap: undefined
				};
			}

			meshes.push({
				colors: functional.map(mesh.colors, toBuffer(Float32Array, toArray4, gl.ARRAY_BUFFER)),
				coords: functional.map(mesh.coords, toBuffer(Float32Array, toArray2, gl.ARRAY_BUFFER)),
				count: mesh.triangles.length * 3,
				indices: toBuffer(Uint16Array, toIndices, gl.ELEMENT_ARRAY_BUFFER)(mesh.triangles),
				material: material,
				normals: functional.map(mesh.normals, toBuffer(Float32Array, toArray3, gl.ARRAY_BUFFER)),
				points: toBuffer(Float32Array, toArray3, gl.ARRAY_BUFFER)(mesh.points),
				tangents: functional.map(mesh.tangents, toBuffer(Float32Array, toArray3, gl.ARRAY_BUFFER))
			});
		}

		return meshes;
	}
}

class Shader {
	public readonly program: WebGLProgram;

	private readonly gl: WebGLRenderingContext;

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

class Target {
	private readonly framebuffer: WebGLFramebuffer | null;
	private readonly gl: WebGLRenderingContext;

	private clearColor: math.Vector4;
	private clearDepth: number;
	private projection: math.Matrix;
	private renderColor: WebGLTexture | undefined;
	private renderDepth: WebGLRenderbuffer | undefined;
	private viewHeight: number;
	private viewWidth: number;

	public static createBuffer(gl: WebGLRenderingContext, width: number, height: number) {
		const framebuffer = gl.createFramebuffer();

		if (framebuffer === null)
			throw Error("could not create framebuffer");

		return new this(gl, framebuffer, width, height);
	}

	public static createScreen(gl: WebGLRenderingContext, width: number, height: number) {
		return new this(gl, null, width, height);
	}

	private constructor(gl: WebGLRenderingContext, framebuffer: WebGLFramebuffer | null, width: number, height: number) {
		this.clearColor = { x: 0, y: 0, z: 0, w: 1 };
		this.clearDepth = 1;
		this.framebuffer = framebuffer;
		this.gl = gl;

		this.setSize(width, height);
	}

	public draw(strides: Stride[]) {
		const gl = this.gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.viewWidth, this.viewHeight);

		gl.clearColor(this.clearColor.x, this.clearColor.y, this.clearColor.z, this.clearColor.z);
		gl.clearDepth(this.clearDepth);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		for (const stride of strides) {
			const subject = stride.subject;

			gl.useProgram(subject.shader.program);

			for (const mesh of subject.meshes) {
				const binding = subject.binding;
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

				// Bind known and supported uniforms
				let textureIndex = 0;

				if (binding.ambientColor !== undefined)
					binding.ambientColor.set(material.ambientColor);

				if (binding.ambientMap !== undefined) {
					if (material.ambientMap === undefined)
						throw invalidUniformBinding("ambientMap");

					binding.ambientMap.set(material.ambientMap, textureIndex++);
				}

				if (binding.diffuseColor !== undefined)
					binding.diffuseColor.set(material.diffuseColor);

				if (binding.diffuseMap !== undefined) {
					if (material.diffuseMap === undefined)
						throw invalidUniformBinding("diffuseMap");

					binding.diffuseMap.set(material.diffuseMap, textureIndex++);
				}

				if (binding.heightMap !== undefined) {
					if (material.heightMap === undefined)
						throw invalidUniformBinding("heightMap");

					binding.heightMap.set(material.heightMap, textureIndex++);
				}

				if (binding.normalMap !== undefined) {
					if (material.normalMap === undefined)
						throw invalidUniformBinding("normalMap");

					binding.normalMap.set(material.normalMap, textureIndex++);
				}

				if (binding.normalMatrix !== undefined)
					binding.normalMatrix.set(new Float32Array(stride.modelView.getTransposedInverse3x3()));

				if (binding.reflectionMap !== undefined) {
					if (material.reflectionMap === undefined)
						throw invalidUniformBinding("reflectionMap");

					binding.reflectionMap.set(material.reflectionMap, textureIndex++);
				}

				if (binding.shininess !== undefined)
					binding.shininess.set(material.shininess);

				if (binding.specularColor !== undefined)
					binding.specularColor.set(material.specularColor);

				if (binding.specularMap !== undefined) {
					if (material.specularMap === undefined)
						throw invalidUniformBinding("specularMap");

					binding.specularMap.set(material.specularMap, textureIndex++);
				}

				binding.modelViewMatrix.set(new Float32Array(stride.modelView.getValues()));
				binding.projectionMatrix.set(new Float32Array(this.projection.getValues()));

				// Perform draw call
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
				gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
			}
		}
	}

	public getColor() {
		if (this.renderColor === undefined)
			throw Error("cannot get color buffer on non-buffered target");

		return this.renderColor;
	}

	public getDepth() {
		if (this.renderDepth === undefined)
			throw Error("cannot get depth buffer on non-buffered target");

		return this.renderDepth;
	}

	public setClearColor(r: number, g: number, b: number, a: number) {
		this.clearColor = { x: r, y: g, z: b, w: a };
	}

	public setClearDepth(depth: number) {
		this.clearDepth = depth;
	}

	public setSize(width: number, height: number) {
		const gl = this.gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

		let renderColor: WebGLTexture | null;
		let renderDepth: WebGLRenderbuffer | null;

		if (this.framebuffer !== null) {
			// Color buffer
			renderColor = createTextureBlank(gl, width, height);

			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderColor, 0);

			// Depth buffer
			renderDepth = gl.createRenderbuffer();

			if (renderDepth === null)
				throw Error("cannot create render buffer");

			gl.bindRenderbuffer(gl.RENDERBUFFER, renderDepth);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderDepth)
		}
		else {
			renderColor = null;
			renderDepth = null;
		}

		// Save configuration
		if (this.renderColor !== undefined)
			gl.deleteTexture(this.renderColor);

		if (this.renderDepth !== undefined)
			gl.deleteRenderbuffer(this.renderDepth);

		this.projection = math.Matrix.createPerspective(45, width / height, 0.1, 100);
		this.renderColor = renderColor || undefined;
		this.renderDepth = renderDepth || undefined;
		this.viewHeight = height;
		this.viewWidth = width;
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

export { Binding, Mesh, Renderer, Shader, Subject, Target, UniformValue }