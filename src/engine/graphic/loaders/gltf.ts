import * as encoding from "../../text/encoding";
import * as functional from "../../language/functional";
import * as matrix from "../../math/matrix";
import * as model from "../model";
import * as path from "../../fs/path";
import * as stream from "../../io/stream";
import * as vector from "../../math/vector";

/*
** Implementation based on:
** https://github.com/KhronosGroup/glTF/tree/master/specification/2.0
*/

interface Accessor {
	arrayBuffer: ArrayBuffer,
	arrayConstructor: ArrayConstructor,
	componentsPerElement: number,
	elements: number,
	offset: number,
	stride: number | undefined,
}

interface ArrayConstructor {
	BYTES_PER_ELEMENT: number;

	new(buffer: ArrayBuffer, offset: number, length: number): model.Array;
}

interface Buffer {
	buffer: ArrayBuffer,
	length: number,
}

interface BufferView {
	buffer: ArrayBuffer,
	length: number,
	offset: number,
	stride: number | undefined
}

const enum ComponentType {
	Byte = 5120,
	Float = 5126,
	Short = 5122,
	UnsignedByte = 5121,
	UnsignedShort = 5123,
	UnsignedInt = 5125
}

interface Material {
	baseColorFactor: vector.Vector4 | undefined,
	baseColorTexture: Texture | undefined,
	emissiveFactor: vector.Vector4 | undefined,
	emissiveTexture: Texture | undefined,
	metallicFactor: number,
	metallicRoughnessTexture: Texture | undefined,
	roughnessFactor: number,
	name: string,
	normalFactor: vector.Vector4 | undefined,
	normalTexture: Texture | undefined,
	occlusionFactor: vector.Vector4 | undefined,
	occlusionTexture: Texture | undefined
}

interface Mesh {
	primitives: Primitive[]
}

interface Node {
	children: Node[],
	mesh: Mesh | undefined,
	transform: matrix.Matrix4
}

interface Primitive {
	colors: Accessor | undefined,
	coords: Accessor | undefined,
	indices: Accessor,
	normals: Accessor | undefined,
	points: Accessor,
	materialName: string | undefined,
	tangents: Accessor | undefined
}

interface Sampler {
	magnifier: model.Interpolation,
	minifier: model.Interpolation,
	mipmap: boolean,
	wrap: model.Wrap
}

interface Scene {
	nodes: Node[]
}

interface Texture {
	image: ImageData,
	sampler: Sampler
}

enum Type {
	MAT2,
	MAT3,
	MAT4,
	SCALAR,
	VEC2,
	VEC3,
	VEC4
}

const convertArrayOf = <T>(url: string, source: string, array: any, converter: (value: any, index: number) => T) => {
	if (array === undefined)
		throw invalidData(url, `${source} is not a value array`);

	return (<any[]>array).map(converter);
};

const convertReferenceTo = <T>(url: string, source: string, reference: any, pool: T[]) => {
	if (typeof reference !== "number")
		throw invalidData(url, `${source} is not a valid reference`);

	if (reference < 0 || reference >= pool.length)
		throw invalidData(url, `${source} references out-of-bound entry #${reference}`);

	return pool[reference];
};

const expandAccessor = (url: string, accessor: Accessor): model.Attribute => {
	const stride = accessor.stride !== undefined
		? accessor.stride / accessor.arrayConstructor.BYTES_PER_ELEMENT
		: accessor.componentsPerElement;

	const buffer = new accessor.arrayConstructor(accessor.arrayBuffer, accessor.offset, accessor.elements * stride);

	return {
		buffer: buffer,
		componentCount: stride
	};
};

const expandMaterial = (material: Material): model.Material => {
	const toMap = (textureOrUndefined: Texture | undefined) =>
		functional.map(textureOrUndefined, texture => ({
			image: texture.image,
			magnifier: texture.sampler.magnifier,
			minifier: texture.sampler.minifier,
			mipmap: texture.sampler.mipmap,
			wrap: texture.sampler.wrap
		}));

	return {
		albedoFactor: material.baseColorFactor,
		albedoMap: toMap(material.baseColorTexture),
		emissiveFactor: material.emissiveFactor,
		emissiveMap: toMap(material.emissiveTexture),
		metalnessMap: toMap(material.metallicRoughnessTexture), // FIXME: only 1 component
		metalnessStrength: material.metallicFactor,
		//normalFactor: material.normalFactor, // FIXME: normalFactor is not supported yet
		normalMap: toMap(material.normalTexture),
		occlusionMap: toMap(material.occlusionTexture),
		occlusionStrength: functional.map(material.occlusionFactor, factor => Math.max(factor.x, factor.y, factor.z, factor.w)),
		roughnessMap: toMap(material.metallicRoughnessTexture), // FIXME: only 1 component
		roughnessStrength: material.roughnessFactor,
	};
};

const expandMesh = (url: string, mesh: Mesh): model.Geometry[] => {
	return mesh.primitives.map(primitive => {
		const indices = expandAccessor(url, primitive.indices);

		return {
			colors: functional.map(primitive.colors, colors => expandAccessor(url, colors)),
			coords: functional.map(primitive.coords, coords => expandAccessor(url, coords)),
			indices: indices.buffer,
			materialName: primitive.materialName,
			normals: functional.map(primitive.normals, normals => expandAccessor(url, normals)),
			points: expandAccessor(url, primitive.points),
			tangents: functional.map(primitive.tangents, tangents => expandAccessor(url, tangents))
		};
	})
};

const expandNode = (url: string, node: Node): model.Node => ({
	children: node.children.map(child => expandNode(url, child)),
	geometries: functional.coalesce(functional.map(node.mesh, mesh => expandMesh(url, mesh)), []),
	transform: node.transform
});

const invalidData = (url: string, description: string) => Error(`invalid glTF data in file ${url}: ${description}`);

const loadAccessor = (url: string, bufferViews: BufferView[], accessor: any, index: number): Accessor => {
	const source = `accessor[${index}]`;
	const byteOffset = functional.coalesce(<number | undefined>accessor.byteOffset, 0);
	const bufferView = convertReferenceTo(url, source + ".bufferView", accessor.bufferView, bufferViews);
	const componentType = functional.coalesce(<number | undefined>accessor.componentType, 0);
	const count = functional.coalesce(<number | undefined>accessor.count, 0);
	const typeName = functional.coalesce(<string | undefined>accessor.type, "undefined");

	if (accessor.sparse !== undefined)
		throw invalidData(url, source + " has unsupported sparse attribute");

	let arrayConstructor: ArrayConstructor;

	switch (componentType) {
		case ComponentType.Byte:
			arrayConstructor = Int8Array;

			break;

		case ComponentType.Float:
			arrayConstructor = Float32Array;

			break;

		case ComponentType.Short:
			arrayConstructor = Int16Array;

			break;

		case ComponentType.UnsignedByte:
			arrayConstructor = Uint8Array;

			break;

		case ComponentType.UnsignedInt:
			arrayConstructor = Uint32Array;

			break;

		case ComponentType.UnsignedShort:
			arrayConstructor = Uint16Array;

			break;

		default:
			throw invalidData(url, source + ` has unsupported component type ${componentType}`);
	}

	let componentsPerElement: number;

	switch (<Type | undefined>(<any>Type)[typeName]) {
		case Type.SCALAR:
			componentsPerElement = 1;

			break;

		case Type.VEC2:
			componentsPerElement = 2;

			break;

		case Type.VEC3:
			componentsPerElement = 3;

			break;

		case Type.VEC4:
			componentsPerElement = 4;

			break;

		default:
			throw invalidData(url, source + ` has unknown type ${typeName}`);
	}

	const stop = byteOffset + count * componentsPerElement * arrayConstructor.BYTES_PER_ELEMENT;

	if (bufferView.length < stop)
		throw invalidData(url, source + ` overflows underlying buffer view #${accessor.bufferView} by ${stop - bufferView.length} byte(s)`);

	return {
		arrayBuffer: bufferView.buffer,
		arrayConstructor: arrayConstructor,
		componentsPerElement: componentsPerElement,
		elements: count,
		offset: bufferView.offset + byteOffset,
		stride: bufferView.stride
	};
};

const loadBuffer = async (url: string, embedded: ArrayBuffer | undefined, buffer: any, index: number): Promise<Buffer> => {
	let arrayBuffer: ArrayBuffer;

	if (buffer.uri !== undefined)
		arrayBuffer = await stream.readURL(stream.BinaryFormat, path.combine(path.directory(url), buffer.uri));
	else if (embedded !== undefined)
		arrayBuffer = embedded;
	else
		throw invalidData(url, `buffer #${index} references missing embedded data`);

	return {
		buffer: arrayBuffer,
		length: buffer.byteLength,
	};
};

const loadBufferView = (url: string, buffers: Buffer[], bufferView: any, index: number): BufferView => {
	const source = `bufferView[${index}]`;
	const buffer = convertReferenceTo(url, source + ".buffer", bufferView.buffer, buffers);
	const byteLength = functional.coalesce(<number | undefined>bufferView.byteLength, 0);
	const byteOffset = functional.coalesce(<number | undefined>bufferView.byteOffset, 0);
	const stop = byteOffset + byteLength;

	if (buffer.length < stop)
		throw invalidData(url, source + ` overflows underlying buffer ${bufferView.buffer} by ${stop - buffer.length} byte(s)`);

	return {
		buffer: buffer.buffer,
		offset: byteOffset,
		length: byteLength,
		stride: <number | undefined>bufferView.stride
	};
};

const loadImage = async (url: string, bufferViews: BufferView[], image: any, index: number): Promise<ImageData> => {
	if (image.uri !== undefined)
		return await model.loadImage(path.combine(path.directory(url), image.uri));

	const source = `image[${index}]`;

	if (image.bufferView !== undefined && image.mimeType !== undefined) {
		const bufferView = convertReferenceTo(url, source + ".bufferView", image.bufferView, bufferViews);
		const blob = new Blob([bufferView.buffer], { type: image.mimeType });
		const uri = window.URL.createObjectURL(blob);

		console.log(uri); // FIXME

		return model.loadImage(uri);
	}

	throw invalidData(url, source + " specifies no URI nor buffer data");
};

const loadMaterial = (url: string, textures: Texture[], material: any, index: number): Material => {
	const pbr = material.pbrMetallicRoughness || {};
	const source = `material[${index}]`;

	const toFactor = (property: any, name: string) =>
		functional.map(property, factor => ({ x: factor[0], y: factor[1], z: factor[2], w: factor[3] }));

	const toTexture = (property: any, name: string) =>
		functional.map(property, texture => convertReferenceTo(url, source + "." + name, texture.index, textures));

	return {
		baseColorFactor: toFactor(pbr.baseColorFactor, "baseColorFactor"),
		baseColorTexture: toTexture(pbr.baseColorTexture, "baseColorTexture"),
		emissiveFactor: toFactor(material.emissiveFactor, "emissiveFactor"),
		emissiveTexture: toTexture(material.emissiveTexture, "emissiveTexture"),
		metallicFactor: functional.coalesce(pbr.metallicFactor, 0.0),
		metallicRoughnessTexture: toTexture(pbr.metallicRoughnessTexture, "metallicRoughnessTexture"),
		name: material.name || `_${index}`,
		normalFactor: toFactor(material.normalFactor, "normalFactor"),
		normalTexture: toTexture(material.normalTexture, "normalTexture"),
		occlusionFactor: toFactor(material.occlusionFactor, "occlusionFactor"),
		occlusionTexture: toTexture(material.occlusionTexture, "occlusionTexture"),
		roughnessFactor: functional.coalesce(pbr.roughnessFactor, 0.0)
	};
};

const loadMesh = (url: string, accessors: Accessor[], materials: Material[], mesh: any, index: number): Mesh => ({
	primitives: convertArrayOf(url, `mesh[${index}].primitives`, mesh.primitives, (value, index) => loadPrimitive(url, accessors, materials, value, index))
});

const loadNode = (url: string, meshes: Mesh[], nodes: Node[], siblings: any, node: any, index: number): Node => {
	if (nodes[index] === undefined) {
		const source = `node[${index}]`;

		let transform: matrix.Matrix4;

		if (node.matrix !== undefined) {
			transform = matrix.Matrix4.create(convertArrayOf(url, source + ".matrix", node.matrix, value => parseFloat(value)));
		}
		else if (node.rotation !== undefined && node.scale !== undefined && node.translation !== undefined) {
			transform = matrix.Matrix4
				.createIdentity()
				.translate({ x: node.translation[0], y: node.translation[1], z: node.translation[2] })
				.rotate({ x: node.rotation[0], y: node.rotation[1], z: node.rotation[2] }, node.rotation[3])
				.scale({ x: node.scale[0], y: node.scale[1], z: node.scale[2] });
		}
		else
			transform = matrix.Matrix4.createIdentity();

		const childrenIndices = convertArrayOf(url, source + ".children", node.children || [], value => parseInt(value));
		const children = [];

		for (const childIndex of childrenIndices) {
			if (siblings[childIndex] === undefined)
				throw invalidData(url, `invalid reference to child node ${childIndex} from node ${index}`);

			children.push(loadNode(url, meshes, nodes, siblings, siblings[childIndex], childIndex));
		}

		nodes[index] = {
			children: children,
			mesh: functional.map(node.mesh, mesh => convertReferenceTo(url, source + ".mesh", mesh, meshes)),
			transform: transform
		};
	}

	return nodes[index];
};

const loadPrimitive = (url: string, accessors: Accessor[], materials: Material[], primitive: any, index: number): Primitive => {
	const attributes = primitive.attributes;
	const material = <number | undefined>primitive.material;
	const source = `primitive #${index}`;

	if (attributes === undefined)
		throw invalidData(url, `${source} has no attributes defined`);

	return {
		colors: attributes.COLOR_0 !== undefined ? convertReferenceTo(url, source + ".attributes.COLOR_0", parseInt(attributes.COLOR_0), accessors) : undefined,
		coords: attributes.TEXCOORD_0 !== undefined ? convertReferenceTo(url, source + ".attributes.TEXCOORD_0", parseInt(attributes.TEXCOORD_0), accessors) : undefined,
		indices: convertReferenceTo(url, source + ".indices", parseInt(primitive.indices), accessors),
		normals: attributes.NORMAL !== undefined ? convertReferenceTo(url, source + ".attributes.NORMAL", parseInt(attributes.NORMAL), accessors) : undefined,
		materialName: material !== undefined ? convertReferenceTo(url, source + ".material", material, materials).name : undefined,
		points: convertReferenceTo(url, source + ".attributes.POSITION", parseInt(attributes.POSITION), accessors),
		tangents: attributes.TANGENT !== undefined ? convertReferenceTo(url, source + ".attributes.TANGENT", parseInt(attributes.TANGENT), accessors) : undefined
	};
};

const loadRoot = async (url: string, structure: any, embedded: ArrayBuffer | undefined) => {
	const defaultScene = <number | undefined>structure.scene;
	const version: string = functional.coalesce(functional.map(structure.asset, asset => asset.version), "unknown");

	if (defaultScene === undefined)
		throw invalidData(url, "no default scene is defined");

	if (version !== "2.0")
		throw invalidData(url, `version ${version} is not supported`);

	// Accessors
	const buffers: Buffer[] = await Promise.all(convertArrayOf(url, "buffers", structure.buffers || [], (value, index) => loadBuffer(url, embedded, value, index)));
	const bufferViews: BufferView[] = convertArrayOf(url, "bufferViews", structure.bufferViews || [], (value, index) => loadBufferView(url, buffers, value, index));
	const accessors: Accessor[] = convertArrayOf(url, "accessors", structure.accessors || [], (value, index) => loadAccessor(url, bufferViews, value, index));

	// Materials
	const images: ImageData[] = await Promise.all(convertArrayOf(url, "images", structure.images || [], (value, index) => loadImage(url, bufferViews, value, index)));
	const samplers: Sampler[] = convertArrayOf(url, "samplers", structure.samplers || [], (value, index) => loadSampler(url, value, index));
	const textures: Texture[] = convertArrayOf(url, "textures", structure.textures || [], (value, index) => loadTexture(url, images, samplers, value, index));
	const materials: Material[] = convertArrayOf(url, "materials", structure.materials || [], (value, index) => loadMaterial(url, textures, value, index));

	// Meshes
	const meshes: Mesh[] = convertArrayOf(url, "meshes", structure.meshes || [], (value, index) => loadMesh(url, accessors, materials, value, index));

	// Scenes
	const nodesCache: Node[] = [];
	const nodesRaw = structure.nodes || [];
	const nodes: Node[] = convertArrayOf(url, "nodes", nodesRaw, (value, index) => loadNode(url, meshes, nodesCache, nodesRaw, value, index));
	const scenes: Scene[] = convertArrayOf(url, "scenes", structure.scenes || [], (value, index) => loadScene(url, nodes, value, index));

	if (scenes[defaultScene] === undefined)
		throw invalidData(url, `default scene #${defaultScene} doesn't exist`);

	const materialMap: { [name: string]: model.Material } = {};

	for (const material of materials)
		materialMap[material.name] = expandMaterial(material);

	return {
		materials: materialMap,
		nodes: scenes[defaultScene].nodes.map(node => expandNode(url, node))
	};
};

const loadSampler = (url: string, sampler: any, index: number): Sampler => {
	const magFilter = parseInt(sampler.magFilter);
	const minFilter = parseInt(sampler.minFilter);
	const wrap = Math.min(parseInt(sampler.wrapS), parseInt(sampler.wrapT));

	return {
		magnifier: magFilter === 9729 /* LINEAR */
			? model.Interpolation.Linear
			: model.Interpolation.Nearest,
		minifier: minFilter === 9729 /* LINEAR */ || minFilter === 9986 /* NEAREST_MIPMAP_LINEAR */ || minFilter === 9987 /* LINEAR_MIPMAP_LINEAR */
			? model.Interpolation.Linear
			: model.Interpolation.Nearest,
		mipmap: minFilter === 9984 /* NEAREST_MIPMAP_NEAREST */ || minFilter === 9985 /* LINEAR_MIPMAP_NEAREST */ || minFilter === 9986 /* NEAREST_MIPMAP_LINEAR */ || minFilter === 9987/* LINEAR_MIPMAP_LINEAR */,
		wrap: wrap === 10497 /* REPEAT */
			? model.Wrap.Repeat
			: (wrap === 33648 /* MIRRORED_REPEAT */
				? model.Wrap.Mirror
				: model.Wrap.Clamp)
	};
};

const loadScene = (url: string, nodes: Node[], scene: any, index: number): Scene => {
	const nodeIndices = <any[]>(scene.nodes || []);

	return {
		nodes: nodeIndices.map((node, i) => convertReferenceTo(url, `scene[${index}].nodes[${i}]`, node, nodes))
	};
};

const loadTexture = (url: string, images: ImageData[], samplers: Sampler[], texture: any, index: number): Texture => {
	const source = `texture[${index}]`;

	return {
		image: convertReferenceTo(url, source + ".source", texture.source, images),
		sampler: convertReferenceTo(url, source + ".sampler", texture.sampler, samplers)
	};
};

const load = async (url: string) => {
	const buffer = await stream.readURL(stream.BinaryFormat, url);
	const codec = new encoding.ASCIICodec();
	const reader = new stream.BinaryReader(buffer, stream.Endian.Little);
	const first = String.fromCharCode(reader.readInt8u());

	let structure: any;
	let embedded: ArrayBuffer | undefined;

	// Looks like a JSON glTF file
	if (first === "{") {
		structure = JSON.parse(first + codec.decode(reader.readBuffer(reader.getLength() - reader.getOffset())));
	}

	// Looks like a binary glTF file
	else if (first + codec.decode(reader.readBuffer(3)) === "glTF") {
		const version = reader.readInt32u();

		if (version !== 2)
			throw invalidData(url, `version ${version} is not supported`);

		const fileLength = reader.readInt32u(); // Read length

		// First chunk: structure as a JSON string
		const jsonLength = reader.readInt32u();
		const jsonType = reader.readInt32u();

		if (jsonType !== 0x4E4F534A)
			throw invalidData(url, "first chunk is expected to be JSON");

		structure = JSON.parse(codec.decode(reader.readBuffer(jsonLength)));

		// Second chunk: binary
		if (reader.getOffset() < fileLength) {
			const binaryLength = reader.readInt32u();
			const binaryType = reader.readInt32u();

			if (binaryType !== 0x004E4942)
				throw invalidData(url, "second chunk is expected to be binary");

			embedded = buffer.slice(reader.getOffset());
		}
		else
			embedded = undefined;
	}
	else {
		throw invalidData(url, "format is not recognized");
	}

	return loadRoot(url, structure, embedded);
};

export { load }