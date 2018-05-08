import * as functional from "../language/functional";
import * as matrix from "../math/matrix";
import * as model from "./model";
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

interface Attribute {
	buffer: WebGLBuffer,
	size: number,
	stride: number,
	type: number
}

type AttributeBinding<TSource> = (gl: WebGLRenderingContext, source: TSource) => void;

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
	colors: Attribute | undefined,
	coords: Attribute | undefined,
	count: number,
	indexBuffer: WebGLBuffer,
	indexType: number,
	normals: Attribute | undefined,
	points: Attribute,
	tangents: Attribute | undefined
}

interface Material {
	albedoFactor: number[],
	albedoMap: WebGLTexture | undefined,
	emissiveFactor: number[],
	emissiveMap: WebGLTexture | undefined,
	glossFactor: number[],
	glossMap: WebGLTexture | undefined,
	heightMap: WebGLTexture | undefined,
	heightParallaxBias: number,
	heightParallaxScale: number,
	id: string,
	metalnessMap: WebGLTexture | undefined,
	metalnessStrength: number,
	normalMap: WebGLTexture | undefined,
	occlusionMap: WebGLTexture | undefined,
	occlusionStrength: number,
	roughnessMap: WebGLTexture | undefined,
	roughnessStrength: number,
	shininess: number
}

interface Mesh {
	nodes: Node[]
}

interface Node {
	children: Node[],
	primitives: Primitive[],
	transform: matrix.Matrix4
}

interface NodeState {
	normalMatrix: Iterable<number>, // FIXME: inconsistent type
	transform: matrix.Matrix4
}

interface Painter<T> {
	paint(subjects: Iterable<Subject>, view: matrix.Matrix4, state: T): void
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

interface Primitive {
	geometry: Geometry,
	material: Material
}

type PropertyBinding<T> = (gl: WebGLRenderingContext, source: T) => void;

interface Scene {
	ambientLightColor?: vector.Vector3,
	directionalLights?: DirectionalLight[],
	pointLights?: PointLight[],
	subjects: Subject[]
}

interface Subject {
	matrix: matrix.Matrix4,
	mesh: Mesh,
	noShadow?: boolean
}

type TextureBinding<T> = (gl: WebGLRenderingContext, source: T, textureIndex: number) => number;

interface Transform {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

type UniformMatrixSetter<T> = (location: WebGLUniformLocation, transpose: boolean, value: T) => void;
type UniformValueSetter<T> = (location: WebGLUniformLocation, value: T) => void;

const colorBlack = { x: 0, y: 0, z: 0, w: 0 };
const colorWhite = { x: 1, y: 1, z: 1, w: 1 };

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

const configureTexture = (gl: WebGLRenderingContext, texture: WebGLTexture | null, width: number, height: number, format: Format, source: model.Texture | undefined) => {
	const isPowerOfTwo = ((height - 1) & height) === 0 && ((width - 1) & width) === 0;

	if (texture === null)
		throw Error("could not create texture");

	gl.bindTexture(gl.TEXTURE_2D, texture);

	// Define texture format
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

	// Define texture filtering
	const glMagnifierFilter = functional.coalesce(functional.map(source, t => t.magnifier), model.Interpolation.Nearest) === model.Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
	const glMinifierFilter = functional.coalesce(functional.map(source, t => t.minifier), model.Interpolation.Nearest) === model.Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
	const glMipmapFilter = functional.coalesce(functional.map(source, t => t.minifier), model.Interpolation.Nearest) === model.Interpolation.Linear ? gl.NEAREST_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST;

	// Define texture wrapping
	let glWrap: number;

	switch (functional.coalesce(functional.map(source, t => t.wrap), model.Wrap.Clamp)) {
		case model.Wrap.Mirror:
			glWrap = gl.MIRRORED_REPEAT;

			break;

		case model.Wrap.Repeat:
			glWrap = gl.REPEAT;

			break;

		default:
			glWrap = gl.CLAMP_TO_EDGE;

			break;
	}

	// TODO: remove unwanted wrapping of "pixels" array when https://github.com/KhronosGroup/WebGL/issues/1533 is fixed
	gl.texImage2D(gl.TEXTURE_2D, 0, glInternal, width, height, 0, glFormat, glType, source !== undefined ? new Uint8Array(source.image.data) : null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glMagnifierFilter);

	if (source !== undefined && source.mipmap && isPowerOfTwo) {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glMipmapFilter);
		gl.generateMipmap(gl.TEXTURE_2D);
	}
	else {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glMinifierFilter);
	}

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return texture;
};

const convertBuffer = (gl: WebGLRenderingContext, target: number, values: model.Array) => {
	const buffer = gl.createBuffer();

	if (buffer === null)
		throw Error("could not create buffer");

	gl.bindBuffer(target, buffer);
	gl.bufferData(target, values, gl.STATIC_DRAW);

	return buffer;
};

/*
** Find OpenGL type from associated array type.
** See: https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/vertexAttribPointer
*/
const convertType = (gl: WebGLRenderingContext, array: model.Array) => {
	if (array instanceof Float32Array)
		return gl.FLOAT;
	else if (array instanceof Int32Array)
		return gl.INT;
	else if (array instanceof Uint32Array)
		return gl.UNSIGNED_INT;
	else if (array instanceof Int16Array)
		return gl.SHORT;
	else if (array instanceof Uint16Array)
		return gl.UNSIGNED_SHORT;
	else if (array instanceof Int8Array)
		return gl.BYTE;
	else if (array instanceof Uint8Array)
		return gl.UNSIGNED_BYTE;

	throw Error(`unsupported array type for indices`);
};

const invalidAttributeBinding = (name: string) => Error(`cannot draw mesh with no ${name} attribute when shader expects one`);
const invalidMaterial = (name: string) => Error(`cannot use unknown material "${name}" on mesh`);
const invalidUniformBinding = (name: string) => Error(`cannot draw mesh with no ${name} uniform when shader expects one`);

const loadGeometry = (gl: WebGLRenderingContext, geometry: model.Geometry, materials: { [name: string]: Material }, defaultMaterial: Material): Primitive => {
	const indicesType = geometry.indices.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

	return {
		geometry: {
			colors: functional.map(geometry.colors, colors => ({
				buffer: convertBuffer(gl, gl.ARRAY_BUFFER, colors.buffer),
				size: colors.stride,
				stride: colors.stride * colors.buffer.BYTES_PER_ELEMENT,
				type: convertType(gl, colors.buffer)
			})),
			coords: functional.map(geometry.coords, coords => ({
				buffer: convertBuffer(gl, gl.ARRAY_BUFFER, coords.buffer),
				size: coords.stride,
				stride: coords.stride * coords.buffer.BYTES_PER_ELEMENT,
				type: convertType(gl, coords.buffer)
			})),
			count: geometry.indices.length,
			indexBuffer: convertBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.indices),
			indexType: convertType(gl, geometry.indices),
			normals: functional.map(geometry.normals, normals => ({
				buffer: convertBuffer(gl, gl.ARRAY_BUFFER, normals.buffer),
				size: normals.stride,
				stride: normals.stride * normals.buffer.BYTES_PER_ELEMENT,
				type: convertType(gl, normals.buffer)
			})),
			points: {
				buffer: convertBuffer(gl, gl.ARRAY_BUFFER, geometry.points.buffer),
				size: geometry.points.stride,
				stride: geometry.points.stride * geometry.points.buffer.BYTES_PER_ELEMENT,
				type: convertType(gl, geometry.points.buffer)
			},
			tangents: functional.map(geometry.tangents, tangents => ({
				buffer: convertBuffer(gl, gl.ARRAY_BUFFER, tangents.buffer),
				size: tangents.stride,
				stride: tangents.stride * tangents.buffer.BYTES_PER_ELEMENT,
				type: convertType(gl, tangents.buffer)
			}))
		},
		material: geometry.materialName !== undefined
			? materials[geometry.materialName] || defaultMaterial
			: defaultMaterial
	};
};

const loadMaterial = (gl: WebGLRenderingContext, id: string, material: model.Material) => {
	const toColorMap = (texture: model.Texture) => configureTexture(gl, gl.createTexture(), texture.image.width, texture.image.height, Format.RGBA8, texture);

	return {
		albedoFactor: vector.Vector4.toArray(material.albedoFactor || colorWhite),
		albedoMap: functional.map(material.albedoMap, toColorMap),
		emissiveFactor: vector.Vector4.toArray(material.emissiveFactor || colorBlack),
		emissiveMap: functional.map(material.emissiveMap, toColorMap),
		glossFactor: vector.Vector4.toArray(material.glossFactor || material.albedoFactor || colorWhite),
		glossMap: functional.map(material.glossMap, toColorMap),
		heightMap: functional.map(material.heightMap, toColorMap),
		heightParallaxBias: functional.coalesce(material.heightParallaxBias, 0),
		heightParallaxScale: functional.coalesce(material.heightParallaxScale, 0),
		id: id,
		metalnessMap: functional.map(material.metalnessMap, toColorMap),
		metalnessStrength: functional.coalesce(material.metalnessStrength, 1),
		normalMap: functional.map(material.normalMap, toColorMap),
		occlusionMap: functional.map(material.occlusionMap, toColorMap),
		occlusionStrength: functional.coalesce(material.occlusionStrength, 1),
		roughnessMap: functional.map(material.roughnessMap, toColorMap),
		roughnessStrength: functional.coalesce(material.roughnessStrength, 1),
		shininess: functional.coalesce(material.shininess, 30)
	};
};

const loadMesh = (gl: WebGLRenderingContext, mesh: model.Mesh): Mesh => {
	// Create pseudo-unique identifier
	// See: https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
	const guid = () => {
		const s4 = () => Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);

		return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
	};

	const defaultMaterial = loadMaterial(gl, guid(), {});
	const materials: { [name: string]: Material } = {};
	const nodes: Node[] = [];

	for (const name in mesh.materials)
		materials[name] = loadMaterial(gl, guid(), mesh.materials[name]);

	for (const node of mesh.nodes)
		nodes.push(loadNode(gl, node, materials, defaultMaterial));

	return {
		nodes: nodes
	};
};

const loadNode = (gl: WebGLRenderingContext, node: model.Node, materials: { [name: string]: Material }, defaultMaterial: Material): Node => ({
	children: node.children.map(child => loadNode(gl, child, materials, defaultMaterial)),
	primitives: node.geometries.map(geometry => loadGeometry(gl, geometry, materials, defaultMaterial)),
	transform: node.transform
});

class Shader<State> {
	public readonly program: WebGLProgram;

	private readonly attributePerGeometryBindings: AttributeBinding<Geometry>[];
	private readonly gl: WebGLRenderingContext;
	private readonly propertyPerMaterialBindings: PropertyBinding<Material>[];
	private readonly propertyPerNodeBindings: PropertyBinding<NodeState>[];
	private readonly propertyPerTargetBindings: PropertyBinding<State>[];
	private readonly texturePerMaterialBindings: TextureBinding<Material>[];
	private readonly texturePerTargetBindings: TextureBinding<State>[];

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
		this.propertyPerNodeBindings = [];
		this.propertyPerTargetBindings = [];
		this.texturePerMaterialBindings = [];
		this.texturePerTargetBindings = [];
		this.program = program;
	}

	public clearAttributePerGeometry(name: string) {
		const location = this.findAttribute(name);

		this.attributePerGeometryBindings.push((gl: WebGLRenderingContext, geometry: Geometry) => {
			gl.disableVertexAttribArray(location);
		});
	}

	public setupAttributePerGeometry(name: string, getter: (state: Geometry) => Attribute | undefined) {
		const location = this.findAttribute(name);

		this.attributePerGeometryBindings.push((gl: WebGLRenderingContext, geometry: Geometry) => {
			const attribute = getter(geometry);

			if (attribute === undefined)
				throw Error(`undefined geometry attribute "${name}"`);

			gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
			gl.vertexAttribPointer(location, attribute.size, attribute.type, false, attribute.stride, 0);
			gl.enableVertexAttribArray(location);
		});
	}

	public setupMatrixPerNode(name: string, getter: (state: NodeState) => Iterable<number>, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>) {
		this.propertyPerNodeBindings.push(this.declareMatrix(name, getter, assign));
	}

	public setupMatrixPerTarget(name: string, getter: (state: State) => Iterable<number>, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>) {
		this.propertyPerTargetBindings.push(this.declareMatrix(name, getter, assign));
	}

	public setupPropertyPerMaterial<TValue>(name: string, getter: (state: Material) => TValue, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>) {
		this.propertyPerMaterialBindings.push(this.declareProperty(name, getter, assign));
	}

	public setupPropertyPerTarget<TValue>(name: string, getter: (state: State) => TValue, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>) {
		this.propertyPerTargetBindings.push(this.declareProperty(name, getter, assign));
	}

	/*
	** Declare sampler on shader and bind it to texture on current material. An
	** optional second boolean uniform can be specified to allow texture to be
	** left undefined on some materials. In that case this second uniform will
	** be set to "true" or "false" depending on whether texture is defined or
	** not. If second uniform is undefined, texture is assumed to be always
	** defined.
	*/
	public setupTexturePerMaterial(samplerName: string, enabledName: string | undefined, getter: (state: Material) => WebGLTexture | undefined) {
		this.texturePerMaterialBindings.push(this.declareTexture(samplerName, enabledName, getter));
	}

	/*
	** Declare sampler on shader and bind it to texture on current target. See
	** method "bindTexturePerMaterial" for details about the optional second
	** uniform.
	*/
	public setupTexturePerTarget(samplerName: string, enabledName: string | undefined, getter: (state: State) => WebGLTexture | undefined) {
		this.texturePerTargetBindings.push(this.declareTexture(samplerName, enabledName, getter));
	}

	public getAttributePerGeometryBindings(): Iterable<AttributeBinding<Geometry>> {
		return this.attributePerGeometryBindings;
	}

	public getPropertyPerMaterialBindings(): Iterable<PropertyBinding<Material>> {
		return this.propertyPerMaterialBindings;
	}

	public getPropertyPerNodeBindings(): Iterable<PropertyBinding<NodeState>> {
		return this.propertyPerNodeBindings;
	}

	public getPropertyPerTargetBindings(): Iterable<PropertyBinding<State>> {
		return this.propertyPerTargetBindings;
	}

	public getTexturePerMaterialBindings(): Iterable<TextureBinding<Material>> {
		return this.texturePerMaterialBindings;
	}

	public getTexturePerTargetBindings(): Iterable<TextureBinding<State>> {
		return this.texturePerTargetBindings;
	}

	private declareMatrix<TSource>(name: string, getter: (state: TSource) => Iterable<number>, assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		return (gl: WebGLRenderingContext, state: TSource) => method.call(gl, location, false, new Float32Array(getter(state)));
	}

	private declareProperty<TSource, TValue>(name: string, getter: (source: TSource) => TValue, assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>) {
		const location = this.findUniform(name);
		const method = assign(this.gl);

		return (gl: WebGLRenderingContext, source: TSource) => method.call(gl, location, getter(source));
	}

	private declareTexture<TSource>(samplerName: string, enabledName: string | undefined, getter: (source: TSource) => WebGLTexture | undefined) {
		const enabledLocation = functional.map(enabledName, name => this.findUniform(name));
		const samplerLocation = this.findUniform(samplerName);

		if (enabledLocation !== undefined) {
			return (gl: WebGLRenderingContext, source: TSource, textureIndex: number) => {
				const texture = getter(source);

				if (texture === undefined) {
					gl.uniform1i(enabledLocation, 0);

					return 0;
				}

				gl.activeTexture(gl.TEXTURE0 + textureIndex);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.uniform1i(enabledLocation, 1);
				gl.uniform1i(samplerLocation, textureIndex);

				return 1;
			}
		}
		else {
			return (gl: WebGLRenderingContext, source: TSource, textureIndex: number) => {
				const texture = getter(source);

				if (texture === undefined)
					throw Error(`missing mandatory texture uniform "${samplerName}"`);

				gl.activeTexture(gl.TEXTURE0 + textureIndex);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.uniform1i(samplerLocation, textureIndex);

				return 1;
			}
		}
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

	public draw<T>(batcher: Painter<T>, subjects: Subject[], view: matrix.Matrix4, state: T) {
		const gl = this.gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.viewWidth, this.viewHeight);

		batcher.paint(subjects, view, state);
	}

	public resize(width: number, height: number) {
		const gl = this.gl;

		for (const attachment of [this.colorAttachment, this.depthAttachment]) {
			// Resize existing renderbuffer attachment if any
			if (attachment.renderbuffer !== undefined)
				configureRenderbuffer(gl, attachment.renderbuffer.handle, width, height, attachment.renderbuffer.format, 1);

			// Resize previously existing texture attachments if any
			for (const texture of attachment.textures)
				configureTexture(gl, texture.handle, width, height, texture.format, undefined);
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
		const texture = configureTexture(gl, gl.createTexture(), this.viewWidth, this.viewHeight, format, undefined);
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

export { Attribute, Painter, DirectionalLight, Directive, Format, Geometry, Material, Mesh, Node, PointLight, Pipeline, Scene, Shader, Subject, Target, Transform, loadMesh }