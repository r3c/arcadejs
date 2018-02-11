import * as functional from "../language/functional";
import * as math from "../math";
import * as model from "../model";

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
	model: Model
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

interface MeshState<TCallState> {
	call: TCallState,
	material: Material,
	mesh: Mesh,
	model: Model
}

interface Model {
	matrix: math.Matrix,
	meshes: Mesh[]
}

interface ModelState<TCallState> {
	call: TCallState,
	model: Model
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

const createTexture = (gl: WebGLRenderingContext) => {
	const texture = gl.createTexture();

	if (texture === null)
		throw Error("could not create texture");

	return texture;
};

const createTextureBlank = (gl: WebGLRenderingContext, width: number, height: number, useFloat: boolean) => {
	const texture = createTexture(gl);

	gl.bindTexture(gl.TEXTURE_2D, texture);

	if (useFloat) {
		if (!gl.getExtension("WEBGL_depth_texture"))
			throw Error("depth texture WebGL extension is not available");

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
	}
	else
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return texture;
};

const createTextureImage = (gl: WebGLRenderingContext, image: ImageData, quality: Quality) => {
	if (((image.height - 1) & image.height) !== 0 || ((image.width - 1) & image.width) !== 0)
		throw Error("image doesn't have power-of-2 dimensions");

	const texture = createTexture(gl);

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

const loadModel = (gl: WebGLRenderingContext, model: model.Model, quality: Quality = defaultQuality) => {
	const definitions = model.materials || {};
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
	private readonly perMeshAttributeBindings: AttributeBinding<MeshState<TCallState>>[];
	private readonly perModelPropertyBindings: UniformBinding<ModelState<TCallState>>[];

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
		this.perMeshAttributeBindings = [];
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

	public bindPerMeshAttribute(name: string, size: number, type: number, getter: (state: MeshState<TCallState>) => WebGLBuffer | undefined) {
		const location = this.findAttribute(name);

		this.perMeshAttributeBindings.push({
			getter: getter,
			location: location,
			name: name,
			size: size,
			type: type
		});
	}

	public bindPerModelMatrix(name: string, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>, getter: (state: ModelState<TCallState>) => Iterable<number>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		this.perModelPropertyBindings.push((gl: WebGLRenderingContext, state: ModelState<TCallState>) => method.call(gl, location, false, new Float32Array(getter(state))));
	}

	public getPerCallPropertyBindings(): Iterable<UniformBinding<TCallState>> {
		return this.perCallPropertyBindings;
	}

	public getPerCallTextureBindings(): Iterable<TextureBinding<TCallState>> {
		return this.perCallTextureBindings;
	}

	public getPerMaterialPropertyBindings(): Iterable<UniformBinding<MaterialState<TCallState>>> {
		return this.perMaterialPropertyBindings;
	}

	public getPerMaterialTextureBindings(): Iterable<TextureBinding<MaterialState<TCallState>>> {
		return this.perMaterialTextureBindings;
	}

	public getPerMeshAttributeBindings(): Iterable<AttributeBinding<MeshState<TCallState>>> {
		return this.perMeshAttributeBindings;
	}

	public getPerModelPropertyBindings(): Iterable<UniformBinding<MeshState<TCallState>>> {
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

			gl.deleteShader(shader);

			throw Error(`could not compile shader: ${error}`);
		}

		return shader;
	}
}

abstract class Target {
	protected readonly gl: WebGLRenderingContext;

	private clearColor: math.Vector4;
	private clearDepth: number;
	private viewHeight: number;
	private viewWidth: number;

	public static createBuffer(gl: WebGLRenderingContext, width: number, height: number) {
		const framebuffer = gl.createFramebuffer();

		if (framebuffer === null)
			throw Error("could not create framebuffer");

		return new BufferTarget(gl, framebuffer, width, height);
	}

	public static createScreen(gl: WebGLRenderingContext, width: number, height: number) {
		return new ScreenTarget(gl, width, height);
	}

	protected constructor(gl: WebGLRenderingContext, width: number, height: number) {
		this.clearColor = { x: 0, y: 0, z: 0, w: 1 };
		this.clearDepth = 1;
		this.gl = gl;
	}

	public clear() {
		const gl = this.gl;

		// FIXME: this introduces an implicit state between "clear" and "draw" calls
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.getFramebuffer());
		gl.viewport(0, 0, this.viewWidth, this.viewHeight);

		gl.clearColor(this.clearColor.x, this.clearColor.y, this.clearColor.z, this.clearColor.z);
		gl.clearDepth(this.clearDepth);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	public draw<T>(shader: Shader<T>, models: Model[], callState: T) {
		const gl = this.gl;

		// Enable shader program
		gl.useProgram(shader.program);

		// Assign per-call uniforms
		const state = {
			call: callState,
			material: <Material><any>undefined,
			mesh: <Mesh><any>undefined,
			model: <Model><any>undefined
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

		for (const model of models) {
			state.model = model;

			for (const binding of shader.getPerModelPropertyBindings())
				binding(gl, state);

			for (const mesh of model.meshes) {
				let materialTextureIndex = callTextureIndex;

				state.material = mesh.material;
				state.mesh = mesh;

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

				// Assign per-mesh attributes
				for (const binding of shader.getPerMeshAttributeBindings()) {
					const buffer = binding.getter(state);

					if (buffer === undefined)
						throw invalidAttributeBinding(binding.name);

					gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
					gl.vertexAttribPointer(binding.location, binding.size, binding.type, false, 0, 0);
					gl.enableVertexAttribArray(binding.location);
				}

				// Perform draw call
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
				gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
			}
		}
	}

	public setClearColor(r: number, g: number, b: number, a: number) {
		this.clearColor = { x: r, y: g, z: b, w: a };
	}

	public setClearDepth(depth: number) {
		this.clearDepth = depth;
	}

	public setSize(width: number, height: number) {
		this.viewHeight = height;
		this.viewWidth = width;
	}

	protected abstract getFramebuffer(): WebGLFramebuffer | null;
}

class BufferTarget extends Target {
	private readonly framebuffer: WebGLFramebuffer;

	private renderColor: WebGLTexture;
	private renderDepth: WebGLTexture;

	public constructor(gl: WebGLRenderingContext, framebuffer: WebGLFramebuffer, width: number, height: number) {
		super(gl, width, height);

		this.framebuffer = framebuffer;

		this.setSize(width, height);
	}

	public getColor() {
		return this.renderColor;
	}

	public getDepth() {
		return this.renderDepth;
	}

	public setSize(width: number, height: number) {
		const gl = this.gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

		// Color buffer
		const renderColor = createTextureBlank(gl, width, height, false);

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderColor, 0);

		// Depth buffer
		//const renderDepth = createRenderbuffer(gl, width, height, true);
		const renderDepth = createTextureBlank(gl, width, height, true);

		//gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderDepth)
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, renderDepth, 0);

		// Save configuration
		if (this.renderColor !== undefined)
			gl.deleteTexture(this.renderColor);

		if (this.renderDepth !== undefined)
			gl.deleteRenderbuffer(this.renderDepth);

		this.renderColor = renderColor;
		this.renderDepth = renderDepth;

		super.setSize(width, height);
	}

	protected getFramebuffer() {
		return this.framebuffer;
	}
}

class ScreenTarget extends Target {
	public constructor(gl: WebGLRenderingContext, width: number, height: number) {
		super(gl, width, height);

		this.setSize(width, height);
	}

	protected getFramebuffer() {
		return null;
	}
}

export { BufferTarget, Mesh, ScreenTarget, Shader, Model, Target, loadModel }