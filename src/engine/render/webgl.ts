import * as functional from "../language/functional";
import * as matrix from "../math/matrix";
import * as model from "../graphic/model";
import * as vector from "../math/vector";

interface Attachment {
	renderbuffer: WebGLRenderbuffer | null,
	textures: (WebGLTexture | undefined)[] | null
}

interface AttributeBinding<T> {
	getter: (source: T) => WebGLBuffer | undefined,
	location: number,
	name: string,
	size: number,
	type: number
}

interface Directive {
	name: string,
	value: number
}

interface Geometry {
	colors: WebGLBuffer | undefined,
	coords: WebGLBuffer | undefined,
	count: number,
	indices: WebGLBuffer,
	normals: WebGLBuffer | undefined,
	points: WebGLBuffer,
	tangents: WebGLBuffer | undefined
}

interface GeometryState<State> {
	geometry: Geometry,
	material: Material,
	subject: Subject,
	target: State
}

interface Material {
	ambientColor: number[],
	ambientMap: WebGLTexture | undefined,
	diffuseColor: number[],
	diffuseMap: WebGLTexture | undefined,
	heightMap: WebGLTexture | undefined,
	normalMap: WebGLTexture | undefined,
	shininess: number,
	specularColor: number[],
	specularMap: WebGLTexture | undefined
}

interface MaterialState<State> {
	material: Material,
	subject: Subject,
	target: State
}

interface Mesh {
	geometries: Geometry[],
	material: Material
}

interface Model {
	meshes: Mesh[]
}

interface PointLight {
	diffuseColor: vector.Vector3,
	position: vector.Vector3,
	radius: number,
	specularColor: vector.Vector3
}

interface Quality {
	textureFilterLinear: boolean,
	textureMipmap: boolean,
	textureMipmapLinear: boolean
}

interface Renderer<State> {
	render(target: Target, scene: Scene, state: State): void
}

interface Scene {
	pointLights?: PointLight[],
	subjects: Subject[]
}

enum Storage {
	Depth16,
	RGBA8
}

interface Subject {
	matrix: matrix.Matrix4,
	model: Model
}

interface SubjectState<State> {
	subject: Subject
	target: State,
}

interface TextureBinding<T> {
	getter: (source: T) => WebGLTexture | undefined,
	location: WebGLUniformLocation,
	name: string
}

type UniformBinding<T> = (gl: WebGLRenderingContext, source: T) => void;
type UniformMatrixSetter<T> = (location: WebGLUniformLocation, transpose: boolean, value: T) => void;
type UniformValueSetter<T> = (location: WebGLUniformLocation, value: T) => void;

class Shader<CallState> {
	public readonly program: WebGLProgram;
	
	private readonly attributePerGeometryBindings: AttributeBinding<GeometryState<CallState>>[];
	private readonly gl: WebGLRenderingContext;
	private readonly propertyPerMaterialBindings: UniformBinding<MaterialState<CallState>>[];
	private readonly propertyPerModelBindings: UniformBinding<SubjectState<CallState>>[];
	private readonly propertyPerTargetBindings: UniformBinding<CallState>[];
	private readonly texturePerMaterialBindings: TextureBinding<MaterialState<CallState>>[];
	private readonly texturePerTargetBindings: TextureBinding<CallState>[];

	public constructor(gl: WebGLRenderingContext, vsSource: string, fsSource: string, directives: Directive[] = []) {
		const program = gl.createProgram();

		if (program === null)
			throw Error("could not create program");

		const header =
			"#version 300 es\n" +
			"#ifdef GL_ES\n" +
			"precision highp float;\n" +
			"#endif\n" +
			directives.map(directive => `#define ${directive.name} ${directive.value}\n`).join("");

		gl.attachShader(program, Shader.compile(gl, gl.VERTEX_SHADER, header + vsSource));
		gl.attachShader(program, Shader.compile(gl, gl.FRAGMENT_SHADER, header + fsSource));
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const error = gl.getProgramInfoLog(program);

			gl.deleteProgram(program);

			throw Error(`could not link program: ${error}`);
		}

		this.attributePerGeometryBindings = [];
		this.gl = gl;
		this.propertyPerMaterialBindings = [];
		this.propertyPerModelBindings = [];
		this.propertyPerTargetBindings = [];
		this.texturePerMaterialBindings = [];
		this.texturePerTargetBindings = [];
		this.program = program;
	}

	public bindAttributePerGeometry(name: string, size: number, type: number, getter: (state: GeometryState<CallState>) => WebGLBuffer | undefined) {
		const location = this.findAttribute(name);

		this.attributePerGeometryBindings.push({
			getter: getter,
			location: location,
			name: name,
			size: size,
			type: type
		});
	}

	public bindMatrixPerModel(name: string, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>, getter: (state: SubjectState<CallState>) => Iterable<number>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		this.propertyPerModelBindings.push((gl: WebGLRenderingContext, state: SubjectState<CallState>) => method.call(gl, location, false, new Float32Array(getter(state))));
	}

	public bindMatrixPerTarget(name: string, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>, getter: (state: CallState) => Iterable<number>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		this.propertyPerTargetBindings.push((gl: WebGLRenderingContext, state: CallState) => method.call(gl, location, false, new Float32Array(getter(state))));
	}

	public bindPropertyPerMaterial<TValue>(name: string, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>, getter: (state: MaterialState<CallState>) => TValue) {
		this.propertyPerMaterialBindings.push(this.declareUniform(name, assign, getter));
	}

	public bindPropertyPerTarget<TValue>(name: string, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>, getter: (state: CallState) => TValue) {
		this.propertyPerTargetBindings.push(this.declareUniform(name, assign, getter));
	}

	public bindTexturePerMaterial(name: string, getter: (state: MaterialState<CallState>) => WebGLTexture | undefined) {
		const location = this.findUniform(name);

		this.texturePerMaterialBindings.push({
			getter: getter,
			location: location,
			name: name
		});
	}

	public bindTexturePerTarget(name: string, getter: (state: CallState) => WebGLTexture | undefined) {
		const location = this.findUniform(name);

		this.texturePerTargetBindings.push({
			getter: getter,
			location: location,
			name: name
		});
	}

	public getAttributePerGeometryBindings(): Iterable<AttributeBinding<GeometryState<CallState>>> {
		return this.attributePerGeometryBindings;
	}

	public getPropertyPerMaterialBindings(): Iterable<UniformBinding<MaterialState<CallState>>> {
		return this.propertyPerMaterialBindings;
	}

	public getPropertyPerModelBindings(): Iterable<UniformBinding<SubjectState<CallState>>> {
		return this.propertyPerModelBindings;
	}

	public getPropertyPerTargetBindings(): Iterable<UniformBinding<CallState>> {
		return this.propertyPerTargetBindings;
	}

	public getTexturePerMaterialBindings(): Iterable<TextureBinding<MaterialState<CallState>>> {
		return this.texturePerMaterialBindings;
	}

	public getTexturePerTargetBindings(): Iterable<TextureBinding<CallState>> {
		return this.texturePerTargetBindings;
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

			throw Error(`could not compile ${name} shader: ${error}\n${source}`);
		}

		return shader;
	}
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

const createRenderbuffer = (gl: WebGLRenderingContext, width: number, height: number, format: Storage, samples: number) => {
	const renderbuffer = gl.createRenderbuffer();

	if (renderbuffer === null)
		throw Error("could not create render buffer");

	gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

	let glInternal: number;

	switch (format) {
		case Storage.Depth16:
			glInternal = gl.DEPTH_COMPONENT16;

			break;

		case Storage.RGBA8:
			glInternal = gl.RGBA;

			break;

		default:
			throw Error(`invalid renderbuffer format ${format}`);
	}

	if (samples > 1)
		(<any>gl).renderbufferStorageMultisample(gl.RENDERBUFFER, samples, glInternal, width, height); // FIXME: incomplete @type for WebGL2
	else
		gl.renderbufferStorage(gl.RENDERBUFFER, glInternal, width, height);

	gl.bindRenderbuffer(gl.RENDERBUFFER, null);

	return renderbuffer;
};

const createTexture = (gl: WebGLRenderingContext, width: number, height: number, storage: Storage, quality: Quality, pixels?: ArrayBufferView) => {
	const isPowerOfTwo = ((height - 1) & height) === 0 && ((width - 1) & width) === 0;

	if (quality.textureMipmap && !isPowerOfTwo)
		throw Error("cannot generate mipmaps for non-power-of-2 image");

	const texture = gl.createTexture();

	if (texture === null)
		throw Error("could not create texture");

	const textureFilter = quality.textureFilterLinear ? gl.LINEAR : gl.NEAREST;

	gl.bindTexture(gl.TEXTURE_2D, texture);

	let glFormat: number;
	let glInternal: number;
	let glType: number;

	switch (storage) {
		case Storage.Depth16:
			if (gl.VERSION < 2 && !gl.getExtension("WEBGL_depth_texture"))
				throw Error("depth texture WebGL extension is not available");

			glFormat = gl.DEPTH_COMPONENT;
			glInternal = gl.DEPTH_COMPONENT16;
			glType = gl.UNSIGNED_SHORT;

			break;

		case Storage.RGBA8:
			glFormat = gl.RGBA;
			glInternal = (<any>gl).RGBA8; // FIXME: incomplete @type for WebGL2
			glType = gl.UNSIGNED_BYTE;

			break;

		default:
			throw Error(`invalid texture format ${storage}`);
	}

	gl.texImage2D(gl.TEXTURE_2D, 0, glInternal, width, height, 0, glFormat, glType, pixels || null);
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

	const toBuffer = <T extends ArrayBufferView, U>(constructor: { new(items: number[]): T }, converter: (input: U) => number[], target: number) => (array: U[]) => createBuffer(gl, target, new constructor(functional.flatten(array.map(converter))));
	const toColorMap = (image: ImageData) => createTexture(gl, image.width, image.height, Storage.RGBA8, quality, image.data);
	const toIndices = (indices: [number, number, number]) => indices;

	for (const mesh of model.meshes) {
		const materialName = mesh.materialName;

		let geometries: Geometry[];

		if (materialName !== undefined) {
			if (definitions[materialName] === undefined)
				throw invalidMaterial(materialName);

			if (meshes[materialName] === undefined) {
				const definition = definitions[materialName];

				const ambientColor = definition.ambientColor || colorWhite;
				const ambientMap = functional.map(definition.ambientMap, toColorMap);
				const diffuseColor = definition.diffuseColor || ambientColor;
				const diffuseMap = functional.map(definition.diffuseMap, toColorMap);
				const specularColor = definition.specularColor || diffuseColor;
				const specularMap = functional.map(definition.specularMap, toColorMap);

				meshes[materialName] = {
					geometries: [],
					material: {
						ambientColor: vector.Vector4.toArray(ambientColor),
						ambientMap: ambientMap || diffuseMap,
						diffuseColor: vector.Vector4.toArray(diffuseColor),
						diffuseMap: diffuseMap || ambientMap,
						heightMap: functional.map(definition.heightMap, toColorMap),
						normalMap: functional.map(definition.normalMap, toColorMap),
						shininess: functional.coalesce(definition.shininess, shininessDefault),
						specularColor: vector.Vector4.toArray(specularColor),
						specularMap: specularMap || diffuseMap || ambientMap
					}
				}
			}

			geometries = meshes[materialName].geometries;
		}
		else {
			const defaultMaterialName = "";

			if (meshes[defaultMaterialName] === undefined) {
				meshes[defaultMaterialName] = {
					geometries: [],
					material: {
						ambientColor: vector.Vector4.toArray(colorWhite),
						ambientMap: undefined,
						diffuseColor: vector.Vector4.toArray(colorWhite),
						diffuseMap: undefined,
						heightMap: undefined,
						normalMap: undefined,
						shininess: shininessDefault,
						specularColor: vector.Vector4.toArray(colorWhite),
						specularMap: undefined
					}
				};
			}

			geometries = meshes[defaultMaterialName].geometries;
		}

		geometries.push({
			colors: functional.map(mesh.colors, toBuffer(Float32Array, vector.Vector4.toArray, gl.ARRAY_BUFFER)),
			coords: functional.map(mesh.coords, toBuffer(Float32Array, vector.Vector2.toArray, gl.ARRAY_BUFFER)),
			count: mesh.triangles.length * 3,
			indices: toBuffer(Uint16Array, toIndices, gl.ELEMENT_ARRAY_BUFFER)(mesh.triangles),
			normals: functional.map(mesh.normals, toBuffer(Float32Array, vector.Vector3.toArray, gl.ARRAY_BUFFER)),
			points: toBuffer(Float32Array, vector.Vector3.toArray, gl.ARRAY_BUFFER)(mesh.points),
			tangents: functional.map(mesh.tangents, toBuffer(Float32Array, vector.Vector3.toArray, gl.ARRAY_BUFFER))
		});
	}

	const result = [];

	for (const name in meshes)
		result.push(meshes[name]);

	return {
		meshes: result
	};
};

class Target {
	private readonly gl: WebGLRenderingContext;
	private readonly viewHeight: number;
	private readonly viewWidth: number;

	private colorAttachment: Attachment;
	private colorClear: vector.Vector4;
	private depthAttachment: Attachment;
	private depthClear: number;
	private framebuffer: WebGLFramebuffer | null;

	public constructor(gl: WebGLRenderingContext, width: number, height: number) {
		this.colorClear = colorBlack;
		this.depthClear = 1;
		this.framebuffer = null;
		this.gl = gl;
		this.viewHeight = height;
		this.viewWidth = width;

		this.colorAttachment = {
			renderbuffer: null,
			textures: null
		};

		this.depthAttachment = {
			renderbuffer: null,
			textures: null
		};
	}

	public clear() {
		const gl = this.gl;

		// FIXME: binding framebuffer here (and only here) introduces an implicit shared state between "clear" and "draw" calls
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.viewWidth, this.viewHeight);

		gl.clearColor(this.colorClear.x, this.colorClear.y, this.colorClear.z, this.colorClear.z);
		gl.clearDepth(this.depthClear);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	public dispose() {
		const gl = this.gl;

		Target.clearRenderbufferAttachments(gl, this.colorAttachment);
		Target.clearTextureAttachments(gl, this.depthAttachment);
	}

	public draw<T>(shader: Shader<T>, subjects: Subject[], state: T) {
		const gl = this.gl;

		// Enable shader program
		gl.useProgram(shader.program);

		// Assign per-call uniforms
		const globalState: GeometryState<T> = {
			geometry: <Geometry><any>undefined,
			material: <Material><any>undefined,
			subject: <Subject><any>undefined,
			target: state
		};

		let callTextureIndex = 0;

		for (const binding of shader.getPropertyPerTargetBindings())
			binding(gl, state);

		for (const binding of shader.getTexturePerTargetBindings()) {
			const texture = binding.getter(state);

			if (texture === undefined)
				throw invalidUniformBinding(binding.name);

			gl.activeTexture(gl.TEXTURE0 + callTextureIndex);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(binding.location, callTextureIndex);

			++callTextureIndex;
		}

		for (const subject of subjects) {
			globalState.subject = subject;

			for (const binding of shader.getPropertyPerModelBindings())
				binding(gl, globalState);

			for (const mesh of subject.model.meshes) {
				let materialTextureIndex = callTextureIndex;

				globalState.material = mesh.material;

				// Assign per-material uniforms
				for (const binding of shader.getTexturePerMaterialBindings()) {
					const texture = binding.getter(globalState);

					if (texture === undefined)
						throw invalidUniformBinding(binding.name);

					gl.activeTexture(gl.TEXTURE0 + materialTextureIndex);
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.uniform1i(binding.location, materialTextureIndex);

					++materialTextureIndex;
				}

				for (const binding of shader.getPropertyPerMaterialBindings())
					binding(gl, globalState);

				for (const geometry of mesh.geometries) {
					globalState.geometry = geometry;

					// Assign per-geometry attributes
					for (const binding of shader.getAttributePerGeometryBindings()) {
						const buffer = binding.getter(globalState);

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
		this.colorClear = { x: r, y: g, z: b, w: a };
	}

	public setClearDepth(depth: number) {
		this.depthClear = depth;
	}

	public setupColorRenderbuffer(storage: Storage) {
		const gl = this.gl;

		return this.setupRenderbuffer(this.colorAttachment, gl.COLOR_ATTACHMENT0, storage, 1);
	}

	public setupColorTexture(storage: Storage, layer: number) {
		const gl = this.gl;
		const texture = this.setupTexture(this.colorAttachment, gl.COLOR_ATTACHMENT0, storage, layer);

		// Configure draw buffers
		if (this.colorAttachment.textures !== null) {
			const buffers = this.colorAttachment.textures.map((texture, index) => texture !== undefined ? gl.COLOR_ATTACHMENT0 + index : gl.NONE);

			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

			// FIXME: this seems to cause a "operation requires zeroing texture data" in Firefox
			// FIXME: incomplete @type for WebGL2
			(<any>gl).drawBuffers(buffers);

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}

		return texture;
	}

	public setupDepthRenderbuffer(storage: Storage) {
		const gl = this.gl;

		return this.setupRenderbuffer(this.depthAttachment, gl.DEPTH_ATTACHMENT, storage, 1);
	}

	public setupDepthTexture(storage: Storage) {
		const gl = this.gl;

		return this.setupTexture(this.depthAttachment, gl.DEPTH_ATTACHMENT, storage, 0);
	}

	private static clearRenderbufferAttachments(gl: WebGLRenderingContext, attachment: Attachment) {
		if (attachment.renderbuffer !== null) {
			gl.deleteRenderbuffer(attachment.renderbuffer);

			attachment.renderbuffer = null;
		}
	}

	private static clearTextureAttachments(gl: WebGLRenderingContext, attachment: Attachment) {
		if (attachment.textures !== null) {
			for (const texture of attachment.textures) {
				if (texture !== undefined)
					gl.deleteTexture(texture);
			}

			attachment.textures = null;
		}
	}

	private static checkFramebuffer(gl: WebGLRenderingContext) {
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

	private setupRenderbuffer(attachment: Attachment, target: number, storage: Storage, samples: number) {
		const framebuffer = this.setupFramebuffer();
		const gl = this.gl;

		// Clear renderbuffer and all texture attachments (if any)
		Target.clearRenderbufferAttachments(gl, attachment);
		Target.clearTextureAttachments(gl, attachment);

		// Create and register renderbuffer attachment
		const renderbuffer = createRenderbuffer(gl, this.viewWidth, this.viewHeight, storage, samples);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, target, gl.RENDERBUFFER, renderbuffer)

		attachment.renderbuffer = renderbuffer;

		Target.checkFramebuffer(gl);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return renderbuffer;
	}

	private setupTexture(attachment: Attachment, target: number, storage: Storage, layer: number) {
		const framebuffer = this.setupFramebuffer();
		const gl = this.gl;

		// Clear renderbuffer and concurrent texture attachments (if any)
		Target.clearRenderbufferAttachments(gl, attachment);

		if (attachment.textures !== null) {
			const texture = attachment.textures[layer];

			if (texture !== undefined)
				gl.deleteTexture(texture);
		}

		// Create and register texture attachment
		const texture = createTexture(gl, this.viewWidth, this.viewHeight, storage, qualityBuffer);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, target + layer, gl.TEXTURE_2D, texture, 0);

		if (attachment.textures === null)
			attachment.textures = [];

		attachment.textures[layer] = texture;

		Target.checkFramebuffer(gl);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return texture;
	}
}

export { Directive, Geometry, Mesh, Model, PointLight, Renderer, Scene, Shader, Storage, Subject, Target, loadModel }