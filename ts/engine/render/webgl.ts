import * as functional from "../language/functional";
import * as matrix from "../math/matrix";
import * as model from "../graphic/model";
import * as vector from "../math/vector";

interface Geometry {
	colors: WebGLBuffer | undefined,
	coords: WebGLBuffer | undefined,
	count: number,
	indices: WebGLBuffer,
	normals: WebGLBuffer | undefined,
	points: WebGLBuffer,
	tangents: WebGLBuffer | undefined
}

interface GeometryState<TCallState> {
	call: TCallState,
	geometry: Geometry,
	material: Material,
	subject: Subject
}

enum BufferFormat {
	Depth16,
	RGBA8
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

interface MaterialState<TCallState> {
	call: TCallState,
	material: Material,
	subject: Subject
}

interface Mesh {
	geometries: Geometry[],
	material: Material
}

interface Model {
	meshes: Mesh[]
}

interface Quality {
	textureFilterLinear: boolean,
	textureMipmap: boolean,
	textureMipmapLinear: boolean
}

interface Subject {
	matrix: matrix.Matrix4,
	model: Model
}

interface SubjectState<TCallState> {
	call: TCallState,
	subject: Subject
}

const colorBlack = { x: 0, y: 0, z: 0, w: 1 };
const colorWhite = { x: 1, y: 1, z: 1, w: 1 };

const qualityBuffer = {
	textureFilterLinear: false,
	textureMipmap: false,
	textureMipmapLinear: false
};

const qualityImage = {
	textureFilterLinear: true,
	textureMipmap: true,
	textureMipmapLinear: false
};

const shininessDefault = 1;

const createBuffer = (gl: WebGLRenderingContext, target: number, values: ArrayBufferView) => {
	const buffer = gl.createBuffer();

	if (buffer === null)
		throw Error("could not create buffer");

	gl.bindBuffer(target, buffer);
	gl.bufferData(target, values, gl.STATIC_DRAW);

	return buffer;
};

const createRenderbuffer = (gl: WebGLRenderingContext, width: number, height: number, useFloat: boolean) => {
	const renderbuffer = gl.createRenderbuffer();

	if (renderbuffer === null)
		throw Error("could not create render buffer");

	gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

	if (useFloat)
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
	else
		throw Error("not implemented");

	return renderbuffer;
};

const createTexture = (gl: WebGLRenderingContext, width: number, height: number, format: BufferFormat, quality: Quality, pixels?: ArrayBufferView) => {
	const isPowerOfTwo = ((height - 1) & height) === 0 && ((width - 1) & width) === 0;

	if (!isPowerOfTwo)
		throw Error("image doesn't have power-of-2 dimensions");

	const texture = gl.createTexture();

	if (texture === null)
		throw Error("could not create texture");

	const textureFilter = quality.textureFilterLinear ? gl.LINEAR : gl.NEAREST;

	gl.bindTexture(gl.TEXTURE_2D, texture);

	let glFormat: number;
	let glType: number;

	switch (format) {
		case BufferFormat.Depth16:
			if (!gl.getExtension("WEBGL_depth_texture"))
				throw Error("depth texture WebGL extension is not available");

			glFormat = gl.DEPTH_COMPONENT;
			glType = gl.UNSIGNED_SHORT;

			break;

		case BufferFormat.RGBA8:
			glFormat = gl.RGBA;
			glType = gl.UNSIGNED_BYTE;

			break;

		default:
			throw Error(`invalid image format ${format}`);
	}

	gl.texImage2D(gl.TEXTURE_2D, 0, glFormat, width, height, 0, glFormat, glType, pixels || null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureFilter);

	if (quality.textureMipmap) {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, quality.textureFilterLinear
			? (quality.textureMipmapLinear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR)
			: (quality.textureMipmapLinear ? gl.LINEAR_MIPMAP_NEAREST : gl.NEAREST_MIPMAP_NEAREST));
		gl.generateMipmap(gl.TEXTURE_2D);
	}
	else {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureFilter);
	}

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, isPowerOfTwo ? gl.REPEAT : gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, isPowerOfTwo ? gl.REPEAT : gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return texture;
};

const invalidAttributeBinding = (name: string) => Error(`cannot draw mesh with no ${name} attribute when shader expects one`);
const invalidMaterial = (name: string) => Error(`cannot use unknown material "${name}" on mesh`);
const invalidUniformBinding = (name: string) => Error(`cannot draw mesh with no ${name} uniform when shader expects one`);

const loadModel = (gl: WebGLRenderingContext, model: model.Model, quality: Quality = qualityImage): Model => {
	const definitions = model.materials || {};
	const meshes: { [name: string]: Mesh } = {};

	const toArray2 = (input: vector.Vector2) => [input.x, input.y];
	const toArray3 = (input: vector.Vector3) => [input.x, input.y, input.z];
	const toArray4 = (input: vector.Vector4) => [input.x, input.y, input.z, input.w];
	const toBuffer = <T extends ArrayBufferView, U>(constructor: { new(items: number[]): T }, converter: (input: U) => number[], target: number) => (array: U[]) => createBuffer(gl, target, new constructor(functional.flatten(array.map(converter))));
	const toColorMap = (image: ImageData) => createTexture(gl, image.width, image.height, BufferFormat.RGBA8, quality, image.data);
	const toIndices = (indices: [number, number, number]) => indices;

	for (const mesh of model.meshes) {
		const name = mesh.materialName;

		let geometries = [];

		if (name !== undefined) {
			if (definitions[name] === undefined)
				throw invalidMaterial(name);

			if (meshes[name] === undefined) {
				const definition = definitions[name];

				const ambientColor = definition.ambientColor || colorWhite;
				const ambientMap = functional.map(definition.ambientMap, toColorMap);
				const diffuseColor = definition.diffuseColor || ambientColor;
				const diffuseMap = functional.map(definition.diffuseMap, toColorMap) || ambientMap;
				const specularColor = definition.specularColor || diffuseColor;
				const specularMap = functional.map(definition.specularMap, toColorMap) || diffuseMap;

				meshes[name] = {
					geometries: [],
					material: {
						ambientColor: toArray4(ambientColor),
						ambientMap: ambientMap,
						diffuseColor: toArray4(diffuseColor),
						diffuseMap: diffuseMap,
						heightMap: functional.map(definition.heightMap, toColorMap),
						normalMap: functional.map(definition.normalMap, toColorMap),
						reflectionMap: functional.map(definition.reflectionMap, toColorMap),
						shininess: functional.coalesce(definition.shininess, shininessDefault),
						specularColor: toArray4(specularColor),
						specularMap: specularMap
					}
				}
			}

			geometries = meshes[name].geometries;
		}
		else {
			if (meshes[""] === undefined) {
				meshes[""] = {
					geometries: [],
					material: {
						ambientColor: toArray4(colorWhite),
						ambientMap: undefined,
						diffuseColor: toArray4(colorWhite),
						diffuseMap: undefined,
						heightMap: undefined,
						normalMap: undefined,
						reflectionMap: undefined,
						shininess: shininessDefault,
						specularColor: toArray4(colorWhite),
						specularMap: undefined
					}
				};
			}

			geometries = meshes[""].geometries;
		}

		geometries.push({
			colors: functional.map(mesh.colors, toBuffer(Float32Array, toArray4, gl.ARRAY_BUFFER)),
			coords: functional.map(mesh.coords, toBuffer(Float32Array, toArray2, gl.ARRAY_BUFFER)),
			count: mesh.triangles.length * 3,
			indices: toBuffer(Uint16Array, toIndices, gl.ELEMENT_ARRAY_BUFFER)(mesh.triangles),
			normals: functional.map(mesh.normals, toBuffer(Float32Array, toArray3, gl.ARRAY_BUFFER)),
			points: toBuffer(Float32Array, toArray3, gl.ARRAY_BUFFER)(mesh.points),
			tangents: functional.map(mesh.tangents, toBuffer(Float32Array, toArray3, gl.ARRAY_BUFFER))
		});
	}

	const result = [];

	for (const name in meshes)
		result.push(meshes[name]);

	return {
		meshes: result
	};
};

interface AttributeBinding<T> {
	getter: (source: T) => WebGLBuffer | undefined,
	location: number,
	name: string,
	size: number,
	type: number
}

interface TextureBinding<T> {
	getter: (source: T) => WebGLTexture | undefined,
	location: WebGLUniformLocation,
	name: string
}

type UniformBinding<T> = (gl: WebGLRenderingContext, source: T) => void;
type UniformMatrixSetter<T> = (location: WebGLUniformLocation, transpose: boolean, value: T) => void;
type UniformValueSetter<T> = (location: WebGLUniformLocation, value: T) => void;

class Shader<TCallState> {
	public readonly program: WebGLProgram;

	private readonly gl: WebGLRenderingContext;
	private readonly perCallPropertyBindings: UniformBinding<TCallState>[];
	private readonly perCallTextureBindings: TextureBinding<TCallState>[];
	private readonly perMaterialTextureBindings: TextureBinding<MaterialState<TCallState>>[];
	private readonly perMaterialPropertyBindings: UniformBinding<MaterialState<TCallState>>[];
	private readonly perGeometryAttributeBindings: AttributeBinding<GeometryState<TCallState>>[];
	private readonly perModelPropertyBindings: UniformBinding<SubjectState<TCallState>>[];

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
		this.perCallPropertyBindings = [];
		this.perCallTextureBindings = [];
		this.perMaterialPropertyBindings = [];
		this.perMaterialTextureBindings = [];
		this.perGeometryAttributeBindings = [];
		this.perModelPropertyBindings = [];
		this.program = program;
	}

	public bindPerCallMatrix(name: string, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>, getter: (state: TCallState) => Iterable<number>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		this.perCallPropertyBindings.push((gl: WebGLRenderingContext, state: TCallState) => method.call(gl, location, false, new Float32Array(getter(state))));
	}

	public bindPerCallProperty<TValue>(name: string, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>, getter: (state: TCallState) => TValue) {
		this.perCallPropertyBindings.push(this.declareUniform(name, assign, getter));
	}

	public bindPerCallTexture(name: string, getter: (state: TCallState) => WebGLTexture | undefined) {
		const location = this.findUniform(name);

		this.perCallTextureBindings.push({
			getter: getter,
			location: location,
			name: name
		});
	}

	public bindPerGeometryAttribute(name: string, size: number, type: number, getter: (state: GeometryState<TCallState>) => WebGLBuffer | undefined) {
		const location = this.findAttribute(name);

		this.perGeometryAttributeBindings.push({
			getter: getter,
			location: location,
			name: name,
			size: size,
			type: type
		});
	}

	public bindPerMaterialProperty<TValue>(name: string, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>, getter: (state: MaterialState<TCallState>) => TValue) {
		this.perMaterialPropertyBindings.push(this.declareUniform(name, assign, getter));
	}

	public bindPerMaterialTexture(name: string, getter: (state: MaterialState<TCallState>) => WebGLTexture | undefined) {
		const location = this.findUniform(name);

		this.perMaterialTextureBindings.push({
			getter: getter,
			location: location,
			name: name
		});
	}

	public bindPerModelMatrix(name: string, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>, getter: (state: SubjectState<TCallState>) => Iterable<number>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		this.perModelPropertyBindings.push((gl: WebGLRenderingContext, state: SubjectState<TCallState>) => method.call(gl, location, false, new Float32Array(getter(state))));
	}

	public getPerCallPropertyBindings(): Iterable<UniformBinding<TCallState>> {
		return this.perCallPropertyBindings;
	}

	public getPerCallTextureBindings(): Iterable<TextureBinding<TCallState>> {
		return this.perCallTextureBindings;
	}

	public getPerGeometryAttributeBindings(): Iterable<AttributeBinding<GeometryState<TCallState>>> {
		return this.perGeometryAttributeBindings;
	}

	public getPerMaterialPropertyBindings(): Iterable<UniformBinding<MaterialState<TCallState>>> {
		return this.perMaterialPropertyBindings;
	}

	public getPerMaterialTextureBindings(): Iterable<TextureBinding<MaterialState<TCallState>>> {
		return this.perMaterialTextureBindings;
	}

	public getPerModelPropertyBindings(): Iterable<UniformBinding<SubjectState<TCallState>>> {
		return this.perModelPropertyBindings;
	}

	private declareUniform<TSource, TValue>(name: string, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>, getter: (source: TSource) => TValue) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		return (gl: WebGLRenderingContext, source: TSource) => method.call(gl, location, getter(source));
	}

	private findAttribute(name: string) {
		const location = this.gl.getAttribLocation(this.program, name);

		if (location === -1)
			throw Error(`cound not find location of attribute "${name}"`);

		return location;
	}

	private findUniform(name: string) {
		const location = this.gl.getUniformLocation(this.program, name);

		if (location === null)
			throw Error(`cound not find location of uniform "${name}"`);

		return location;
	}

	private static compile(gl: WebGLRenderingContext, shaderType: number, source: string) {
		const shader = gl.createShader(shaderType);

		if (shader === null)
			throw Error(`could not create shader`);

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(shader);
			const name = shaderType === gl.FRAGMENT_SHADER ? 'fragment' : (shaderType === gl.VERTEX_SHADER ? 'vertex' : 'unknown');

			gl.deleteShader(shader);

			throw Error(`could not compile ${name} shader: ${error}`);
		}

		return shader;
	}
}

class Target {
	private readonly gl: WebGLRenderingContext;
	private readonly viewHeight: number;
	private readonly viewWidth: number;

	private clearColor: vector.Vector4;
	private clearDepth: number;
	private framebuffer: WebGLFramebuffer | null;
	private renderColorTexture: WebGLTexture | null;
	private renderColorRenderbuffer: WebGLRenderbuffer | null;
	private renderDepthTexture: WebGLTexture | null;
	private renderDepthRenderbuffer: WebGLRenderbuffer | null;

	public constructor(gl: WebGLRenderingContext, width: number, height: number) {
		this.clearColor = colorBlack;
		this.clearDepth = 1;
		this.framebuffer = null;
		this.gl = gl;
		this.renderColorTexture = null;
		this.renderColorRenderbuffer = null;
		this.renderDepthTexture = null;
		this.renderDepthRenderbuffer = null;
		this.viewHeight = height;
		this.viewWidth = width;
	}

	public clear() {
		const gl = this.gl;

		// FIXME: this introduces an implicit shared state between "clear" and "draw" calls
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.viewWidth, this.viewHeight);

		gl.clearColor(this.clearColor.x, this.clearColor.y, this.clearColor.z, this.clearColor.z);
		gl.clearDepth(this.clearDepth);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	public draw<T>(shader: Shader<T>, subjects: Subject[], callState: T) {
		const gl = this.gl;

		// Enable shader program
		gl.useProgram(shader.program);

		// Assign per-call uniforms
		const state: GeometryState<T> = {
			call: callState,
			geometry: <Geometry><any>undefined,
			material: <Material><any>undefined,
			subject: <Subject><any>undefined
		};

		let callTextureIndex = 0;

		for (const binding of shader.getPerCallPropertyBindings())
			binding(gl, callState);

		for (const binding of shader.getPerCallTextureBindings()) {
			const texture = binding.getter(callState);

			if (texture === undefined)
				throw invalidUniformBinding(binding.name);

			gl.activeTexture(gl.TEXTURE0 + callTextureIndex);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(binding.location, callTextureIndex);

			++callTextureIndex;
		}

		for (const subject of subjects) {
			state.subject = subject;

			for (const binding of shader.getPerModelPropertyBindings())
				binding(gl, state);

			for (const mesh of subject.model.meshes) {
				let materialTextureIndex = callTextureIndex;

				state.material = mesh.material;

				// Assign per-material uniforms
				for (const binding of shader.getPerMaterialTextureBindings()) {
					const texture = binding.getter(state);

					if (texture === undefined)
						throw invalidUniformBinding(binding.name);

					gl.activeTexture(gl.TEXTURE0 + materialTextureIndex);
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.uniform1i(binding.location, materialTextureIndex);

					++materialTextureIndex;
				}

				for (const binding of shader.getPerMaterialPropertyBindings())
					binding(gl, state);

				for (const geometry of mesh.geometries) {
					state.geometry = geometry;

					// Assign per-geometry attributes
					for (const binding of shader.getPerGeometryAttributeBindings()) {
						const buffer = binding.getter(state);

						if (buffer === undefined)
							throw invalidAttributeBinding(binding.name);

						gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
						gl.vertexAttribPointer(binding.location, binding.size, binding.type, false, 0, 0);
						gl.enableVertexAttribArray(binding.location);
					}

					// Perform draw call
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indices);
					gl.drawElements(gl.TRIANGLES, geometry.count, gl.UNSIGNED_SHORT, 0);
				}
			}
		}
	}

	public setClearColor(r: number, g: number, b: number, a: number) {
		this.clearColor = { x: r, y: g, z: b, w: a };
	}

	public setClearDepth(depth: number) {
		this.clearDepth = depth;
	}

	public setupColorRenderbuffer() {
		this.clearColorAttachment();
		this.renderColorRenderbuffer = this.setupRenderbuffer(this.gl.COLOR_ATTACHMENT0, false);

		return this.renderColorRenderbuffer;
	}

	public setupColorTexture() {
		this.clearColorAttachment();
		this.renderColorTexture = this.setupTexture(this.gl.COLOR_ATTACHMENT0, BufferFormat.RGBA8);

		return this.renderColorTexture;
	}

	public setupDepthRenderbuffer() {
		this.clearDepthAttachment();
		this.renderDepthRenderbuffer = this.setupRenderbuffer(this.gl.DEPTH_ATTACHMENT, true);

		return this.renderDepthRenderbuffer;
	}

	public setupDepthTexture() {
		this.clearDepthAttachment();
		this.renderDepthTexture = this.setupTexture(this.gl.DEPTH_ATTACHMENT, BufferFormat.Depth16);

		return this.renderDepthTexture;
	}

	private clearColorAttachment() {
		const gl = this.gl;

		if (this.renderColorRenderbuffer !== null) {
			gl.deleteRenderbuffer(this.renderColorRenderbuffer);

			this.renderColorRenderbuffer = null;
		}

		if (this.renderColorTexture !== null) {
			gl.deleteTexture(this.renderColorTexture);

			this.renderColorTexture = null;
		}
	}

	private clearDepthAttachment() {
		const gl = this.gl;

		if (this.renderDepthRenderbuffer !== null) {
			gl.deleteRenderbuffer(this.renderDepthRenderbuffer);

			this.renderDepthRenderbuffer = null;
		}

		if (this.renderDepthTexture !== null) {
			gl.deleteTexture(this.renderDepthTexture);

			this.renderDepthTexture = null;
		}
	}

	private checkFramebuffer() {
		const gl = this.gl;

		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
			throw Error("invalid framebuffer operation");
	}

	private setupFramebuffer() {
		if (this.framebuffer !== null)
			return this.framebuffer;

		const framebuffer = this.gl.createFramebuffer();

		if (framebuffer === null)
			throw Error("could not create framebuffer");

		this.framebuffer = framebuffer;

		return framebuffer;
	}

	private setupRenderbuffer(attachment: number, useFloat: boolean) {
		const framebuffer = this.setupFramebuffer();
		const gl = this.gl;
		const renderbuffer = createRenderbuffer(gl, this.viewHeight, this.viewHeight, useFloat);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, renderbuffer)

		this.checkFramebuffer();

		return renderbuffer;
	}

	private setupTexture(attachment: number, format: BufferFormat) {
		const framebuffer = this.setupFramebuffer();
		const gl = this.gl;
		const texture = createTexture(gl, this.viewWidth, this.viewHeight, format, qualityBuffer);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);

		this.checkFramebuffer();

		return texture;
	}
}

export { Geometry, Mesh, Model, Shader, Subject, Target, loadModel }