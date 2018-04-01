import * as functional from "../language/functional";
import * as matrix from "../math/matrix";
import * as mesh from "./mesh";
import * as model from "../graphic/model";
import * as vector from "../math/vector";

interface Attachment {
	renderbuffer: AttachmentRenderbuffer | undefined,
	textures: AttachmentTexture[]
}

interface AttachmentRenderbuffer {
	format: Format,
	handle: WebGLRenderbuffer
}

interface AttachmentTexture {
	format: Format,
	handle: WebGLTexture
}

interface AttributeBinding<T> {
	getter: (source: T) => WebGLBuffer | undefined,
	location: number,
	name: string,
	size: number,
	type: number
}

interface DirectionalLight {
	color: vector.Vector3,
	direction: vector.Vector3,
	shadow: boolean
}

interface Directive {
	name: string,
	value: number
}

const enum Format {
	Depth16,
	RGBA8
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
	albedoColor: number[],
	albedoMap: WebGLTexture | undefined,
	emissiveMap: WebGLTexture | undefined,
	emissiveStrength: number,
	glossColor: number[],
	glossMap: WebGLTexture | undefined,
	heightMap: WebGLTexture | undefined,
	metalnessMap: WebGLTexture | undefined,
	normalMap: WebGLTexture | undefined,
	occlusionMap: WebGLTexture | undefined,
	occlusionStrength: number,
	parallaxBias: number,
	parallaxScale: number,
	roughnessMap: WebGLTexture | undefined,
	shininess: number
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

interface Pipeline {
	process(target: Target, transform: Transform, scene: Scene): void,
	resize(width: number, height: number): void
}

interface PointLight {
	color: vector.Vector3,
	position: vector.Vector3,
	radius: number
}

interface Quality {
	textureFilterLinear: boolean,
	textureMipmap: boolean,
	textureMipmapLinear: boolean
}

interface Scene {
	ambientLightColor?: vector.Vector3,
	directionalLights?: DirectionalLight[],
	pointLights?: PointLight[],
	subjects: Subject[]
}

interface Subject {
	matrix: matrix.Matrix4,
	model: Model,
	shadow?: boolean
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

interface Transform {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
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

const configureRenderbuffer = (gl: WebGLRenderingContext, renderbuffer: WebGLRenderbuffer | null, width: number, height: number, format: Format, samples: number) => {
	if (renderbuffer === null)
		throw Error("could not create render buffer");

	gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

	let glInternal: number;

	switch (format) {
		case Format.Depth16:
			glInternal = gl.DEPTH_COMPONENT16;

			break;

		case Format.RGBA8:
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

const configureTexture = (gl: WebGLRenderingContext, texture: WebGLTexture | null, width: number, height: number, format: Format, quality: Quality, pixels?: Uint8ClampedArray) => {
	const isPowerOfTwo = ((height - 1) & height) === 0 && ((width - 1) & width) === 0;

	if (texture === null)
		throw Error("could not create texture");

	if (quality.textureMipmap && !isPowerOfTwo)
		throw Error("cannot generate mipmaps for non-power-of-2 image");

	const textureFilter = quality.textureFilterLinear ? gl.LINEAR : gl.NEAREST;

	gl.bindTexture(gl.TEXTURE_2D, texture);

	let glFormat: number;
	let glInternal: number;
	let glType: number;

	switch (format) {
		case Format.Depth16:
			if (gl.VERSION < 2 && !gl.getExtension("WEBGL_depth_texture"))
				throw Error("depth texture WebGL extension is not available");

			glFormat = gl.DEPTH_COMPONENT;
			glInternal = gl.DEPTH_COMPONENT16;
			glType = gl.UNSIGNED_SHORT;

			break;

		case Format.RGBA8:
			glFormat = gl.RGBA;
			glInternal = (<any>gl).RGBA8; // FIXME: incomplete @type for WebGL2
			glType = gl.UNSIGNED_BYTE;

			break;

		default:
			throw Error(`invalid texture format ${format}`);
	}

	// TODO: remove unwanted wrapping of "pixels" array when https://github.com/KhronosGroup/WebGL/issues/1533 is fixed
	gl.texImage2D(gl.TEXTURE_2D, 0, glInternal, width, height, 0, glFormat, glType, pixels !== undefined ? new Uint8Array(pixels) : null);
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

const createBuffer = (gl: WebGLRenderingContext, target: number, values: Float32Array | Uint16Array) => {
	const buffer = gl.createBuffer();

	if (buffer === null)
		throw Error("could not create buffer");

	gl.bindBuffer(target, buffer);
	gl.bufferData(target, values, gl.STATIC_DRAW);

	return buffer;
};

const invalidAttributeBinding = (name: string) => Error(`cannot draw mesh with no ${name} attribute when shader expects one`);
const invalidMaterial = (name: string) => Error(`cannot use unknown material "${name}" on mesh`);
const invalidUniformBinding = (name: string) => Error(`cannot draw mesh with no ${name} uniform when shader expects one`);

const loadMaterial = (gl: WebGLRenderingContext, material: mesh.Material, quality: Quality) => {
	const toColorMap = (image: ImageData) => configureTexture(gl, gl.createTexture(), image.width, image.height, Format.RGBA8, quality, image.data);

	return {
		albedoColor: vector.Vector4.toArray(material.albedoColor || colorWhite),
		albedoMap: functional.map(material.albedoMap, toColorMap),
		emissiveMap: functional.map(material.emissiveMap, toColorMap),
		emissiveStrength: functional.coalesce(material.emissiveStrength, 1),
		glossColor: vector.Vector4.toArray(material.glossColor || material.albedoColor || colorWhite),
		glossMap: functional.map(material.glossMap, toColorMap),
		heightMap: functional.map(material.heightMap, toColorMap),
		metalnessMap: functional.map(material.metalnessMap, toColorMap),
		normalMap: functional.map(material.normalMap, toColorMap),
		occlusionMap: functional.map(material.occlusionMap, toColorMap),
		occlusionStrength: functional.coalesce(material.occlusionStrength, 1),
		parallaxBias: functional.coalesce(material.parallaxBias, 0),
		parallaxScale: functional.coalesce(material.parallaxScale, 0),
		roughnessMap: functional.map(material.roughnessMap, toColorMap),
		shininess: functional.coalesce(material.shininess, 1)
	};
};

const loadModel = (gl: WebGLRenderingContext, model: model.Model, quality: Quality = qualityImage): Model => {
	const definitions = model.materials || {};
	const meshes: { [name: string]: Mesh } = {};

	const toArrayBuffer = <T>(constructor: { new(items: number[]): Float32Array | Uint16Array }, converter: (input: T) => number[], target: number) => (array: T[]) => createBuffer(gl, target, new constructor(functional.flatten(array.map(converter))));
	const toIndices = (indices: [number, number, number]) => indices;

	for (const mesh of model.meshes) {
		const materialName = mesh.materialName;

		let geometries: Geometry[];

		if (materialName !== undefined) {
			if (definitions[materialName] === undefined)
				throw invalidMaterial(materialName);

			if (meshes[materialName] === undefined) {
				meshes[materialName] = {
					geometries: [],
					material: loadMaterial(gl, definitions[materialName], quality)
				}
			}

			geometries = meshes[materialName].geometries;
		}
		else {
			const defaultMaterialName = "";

			if (meshes[defaultMaterialName] === undefined) {
				meshes[defaultMaterialName] = {
					geometries: [],
					material: loadMaterial(gl, {}, quality)
				};
			}

			geometries = meshes[defaultMaterialName].geometries;
		}

		geometries.push({
			colors: functional.map(mesh.colors, toArrayBuffer(Float32Array, vector.Vector4.toArray, gl.ARRAY_BUFFER)),
			coords: functional.map(mesh.coords, toArrayBuffer(Float32Array, vector.Vector2.toArray, gl.ARRAY_BUFFER)),
			count: mesh.triangles.length * 3,
			indices: toArrayBuffer(Uint16Array, toIndices, gl.ELEMENT_ARRAY_BUFFER)(mesh.triangles),
			normals: functional.map(mesh.normals, toArrayBuffer(Float32Array, vector.Vector3.toArray, gl.ARRAY_BUFFER)),
			points: toArrayBuffer(Float32Array, vector.Vector3.toArray, gl.ARRAY_BUFFER)(mesh.points),
			tangents: functional.map(mesh.tangents, toArrayBuffer(Float32Array, vector.Vector3.toArray, gl.ARRAY_BUFFER))
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

	private colorAttachment: Attachment;
	private colorClear: vector.Vector4;
	private depthAttachment: Attachment;
	private depthClear: number;
	private framebuffer: WebGLFramebuffer | null;
	private viewHeight: number;
	private viewWidth: number;

	public constructor(gl: WebGLRenderingContext, width: number, height: number) {
		this.colorAttachment = { renderbuffer: undefined, textures: [] };
		this.colorClear = colorBlack;
		this.depthAttachment = { renderbuffer: undefined, textures: [] };
		this.depthClear = 1;
		this.framebuffer = null;
		this.gl = gl;
		this.viewHeight = height;
		this.viewWidth = width;
	}

	public clear() {
		const gl = this.gl;

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

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.viewWidth, this.viewHeight);

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

	public resize(width: number, height: number) {
		const gl = this.gl;

		for (const attachment of [this.colorAttachment, this.depthAttachment]) {
			// Resize existing renderbuffer attachment if any
			if (attachment.renderbuffer !== undefined)
				configureRenderbuffer(gl, attachment.renderbuffer.handle, width, height, attachment.renderbuffer.format, 1);

			// Resize previously existing texture attachments if any
			for (const texture of attachment.textures)
				configureTexture(gl, texture.handle, width, height, texture.format, qualityBuffer);
		}

		this.viewHeight = height;
		this.viewWidth = width;
	}

	public setClearColor(r: number, g: number, b: number, a: number) {
		this.colorClear = { x: r, y: g, z: b, w: a };
	}

	public setClearDepth(depth: number) {
		this.depthClear = depth;
	}

	public setupColorRenderbuffer(format: Format) {
		return this.attachRenderbuffer(this.colorAttachment, format, this.gl.COLOR_ATTACHMENT0);
	}

	public setupColorTexture(format: Format) {
		const gl = this.gl;
		const texture = this.attachTexture(this.colorAttachment, format, gl.COLOR_ATTACHMENT0);

		// Configure draw buffers
		if (this.colorAttachment.textures !== undefined) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

			// FIXME: this seems to cause a "operation requires zeroing texture data" in Firefox
			// FIXME: incomplete @type for WebGL2
			(<any>gl).drawBuffers(functional.range(this.colorAttachment.textures.length, i => gl.COLOR_ATTACHMENT0 + i));

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}

		return texture;
	}

	public setupDepthRenderbuffer(format: Format) {
		return this.attachRenderbuffer(this.depthAttachment, format, this.gl.DEPTH_ATTACHMENT);
	}

	public setupDepthTexture(format: Format) {
		return this.attachTexture(this.depthAttachment, format, this.gl.DEPTH_ATTACHMENT);
	}

	private static clearRenderbufferAttachments(gl: WebGLRenderingContext, attachment: Attachment) {
		if (attachment.renderbuffer !== undefined) {
			gl.deleteRenderbuffer(attachment.renderbuffer.handle);

			attachment.renderbuffer = undefined;
		}
	}

	private static clearTextureAttachments(gl: WebGLRenderingContext, attachment: Attachment) {
		if (attachment.textures !== undefined) {
			for (const texture of attachment.textures)
				gl.deleteTexture(texture.handle);

			attachment.textures = [];
		}
	}

	private static checkFramebuffer(gl: WebGLRenderingContext) {
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
			throw Error("invalid framebuffer operation");
	}

	private attachFramebuffer() {
		if (this.framebuffer !== null)
			return this.framebuffer;

		const framebuffer = this.gl.createFramebuffer();

		if (framebuffer === null)
			throw Error("could not create framebuffer");

		this.framebuffer = framebuffer;

		return framebuffer;
	}

	private attachRenderbuffer(attachment: Attachment, format: Format, target: number) {
		const framebuffer = this.attachFramebuffer();
		const gl = this.gl;

		// Clear renderbuffer and texture attachments if any
		Target.clearRenderbufferAttachments(gl, attachment);
		Target.clearTextureAttachments(gl, attachment);

		// Create renderbuffer attachment
		const renderbuffer = configureRenderbuffer(gl, gl.createRenderbuffer(), this.viewWidth, this.viewHeight, format, 1);

		attachment.renderbuffer = {
			format: format,
			handle: renderbuffer
		};

		// Bind attachment to framebuffer
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, target, gl.RENDERBUFFER, renderbuffer)

		Target.checkFramebuffer(gl);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return renderbuffer;
	}

	private attachTexture(attachment: Attachment, format: Format, target: number) {
		const framebuffer = this.attachFramebuffer();
		const gl = this.gl;

		// Reset renderbuffer attachment if any
		Target.clearRenderbufferAttachments(gl, attachment);

		// Create and append new texture attachment
		const texture = configureTexture(gl, gl.createTexture(), this.viewWidth, this.viewHeight, format, qualityBuffer);
		const offset = attachment.textures.push({
			format: format,
			handle: texture
		});

		// Bind attachment to framebuffer
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, target + offset - 1, gl.TEXTURE_2D, texture, 0);

		Target.checkFramebuffer(gl);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return texture;
	}
}

export { DirectionalLight, Directive, Format, Geometry, Mesh, Model, PointLight, Pipeline, Scene, Shader, Subject, Target, Transform, loadModel }