import * as matrix from "../../math/matrix";
import * as model from "../model";
import * as path from "../../fs/path";
import * as stream from "../../io/stream";
import * as vector from "../../math/vector";

/*
** Implementation based on:
** http://www.martinreddy.net/gfx/3d/3DS.spec
** http://www.martinreddy.net/gfx/3d/MLI.spec
*/

interface Context {
	directory: string,
	file: string,
	reader: stream.BinaryReader
}

interface RawMesh {
	coords: number[],
	indices: number[],
	materialName: string | undefined,
	points: number[]
}

const invalidChunk = (file: string, chunk: number, description: string) => {
	return Error(`invalid chunk ${chunk} in file ${file}: ${description}`);
};

const load = async (url: string) => {
	const context = {
		directory: path.directory(url),
		file: url,
		reader: new stream.BinaryReader(await stream.readURL(stream.BinaryFormat, url), stream.Endian.Little)
	};

	return scan(context, context.reader.getLength(), readRoot, {
		materials: {},
		nodes: []
	});
};

const readColor = async (context: Context, end: number, chunk: number, state: vector.Vector4) => {
	switch (chunk) {
		case 0x0010: // COL_RGB
		case 0x0013: // COL_UNK
			return {
				x: context.reader.readFloat32(),
				y: context.reader.readFloat32(),
				z: context.reader.readFloat32(),
				w: 1.0
			};

		case 0x0011: // RGB1
		case 0x0012: // RGB2
			return {
				x: context.reader.readInt8u() / 255,
				y: context.reader.readInt8u() / 255,
				z: context.reader.readInt8u() / 255,
				w: 1.0
			};
	}

	return state;
};

const readEdit = async (context: Context, end: number, chunk: number, state: model.Mesh) => {
	switch (chunk) {
		case 0x4000: // DIT_OBJECT
			context.reader.readStringZero(); // Skip object name

			const meshes = await scan(context, end, readObject, []);

			state.nodes.push({
				children: [],
				geometries: meshes.map(mesh => ({
					coords: mesh.coords.length > 0 ? { buffer: new Float32Array(mesh.coords), stride: 2 } : undefined,
					indices: new Uint32Array(mesh.indices),
					materialName: mesh.materialName,
					points: { buffer: new Float32Array(mesh.points), stride: 3 }
				})),
				transform: matrix.Matrix4.createIdentity()
			});

			return state;

		case 0xafff: // DIT_MATERIAL
			const { material, name } = await scan(context, end, readMaterial, {
				material: {},
				name: ""
			});

			state.materials[name] = material;

			return state;
	}

	return state;
};

const readMain = async (context: Context, end: number, chunk: number, state: model.Mesh) => {
	switch (chunk) {
		case 0x3d3d: // EDIT3DS
			return scan(context, end, readEdit, state);
	}

	return state;
};

const readMaterial = async (context: Context, end: number, chunk: number, state: { material: model.Material, name: string }) => {
	switch (chunk) {
		case 0xa000: // Material name
			state.name = context.reader.readStringZero();

			break;

		case 0xa020: // Albedo color
			state.material.albedoColor = await scan(context, end, readColor, model.defaultColor);

			break;

		case 0xa030: // Specular color
			state.material.glossColor = await scan(context, end, readColor, model.defaultColor);

			break;

		case 0xa040: // Shininess
			state.material.shininess = context.reader.readInt16u();

			break;

		case 0xa200: // Texture 1
			state.material.albedoMap = await scan(context, end, readMaterialMap, undefined);

			break;

		case 0xa204: // Gloss map
			state.material.glossMap = await scan(context, end, readMaterialMap, undefined);

			break;

		case 0xa230: // Bump map
			state.material.heightMap = await scan(context, end, readMaterialMap, undefined);

			break;
	}

	return state;
};

const readMaterialMap = async (context: Context, end: number, chunk: number, state: ImageData | undefined) => {
	switch (chunk) {
		case 0xa300:
			return model.loadImage(path.combine(context.directory, context.reader.readStringZero()));
	}

	return state;
};

const readObject = async (context: Context, end: number, chunk: number, state: RawMesh[]) => {
	switch (chunk) {
		case 0x4100: // OBJ_TRIMESH
			const mesh = await scan(context, end, readPolygon, {
				coords: [],
				indices: [],
				materialName: undefined,
				points: []
			});

			state.push(mesh);

			return state;
	}

	return state;
};

const readPercent = async (context: Context, end: number, chunk: number, state: number) => {
	switch (chunk) {
		case 0x0030:
			return context.reader.readInt16u() * 0.01;

		case 0x0031:
			return context.reader.readFloat32();
	}

	return state;
};

const readPolygon = async (context: Context, end: number, chunk: number, state: RawMesh) => {
	switch (chunk) {
		case 0x4110: // TRI_VERTEXL
			for (let count = context.reader.readInt16u(); count > 0; --count) {
				state.points.push(context.reader.readFloat32());
				state.points.push(context.reader.readFloat32());
				state.points.push(context.reader.readFloat32());
			}

			return state;

		case 0x4120: // TRI_FACEL1
			for (let count = context.reader.readInt16u(); count > 0; --count) {
				state.indices.push(context.reader.readInt16u());
				state.indices.push(context.reader.readInt16u());
				state.indices.push(context.reader.readInt16u());

				context.reader.readInt16u(); // Face info
			}

			state.materialName = await scan(context, end, readPolygonMaterial, "");

			return state;

		case 0x4140: // TRI_MAPPINGCOORS
			for (let count = context.reader.readInt16u(); count > 0; --count) {
				state.coords.push(context.reader.readFloat32());
				state.coords.push(1.0 - context.reader.readFloat32());
			}

			return state;
	}

	return state;
};

const readPolygonMaterial = async (context: Context, end: number, chunk: number, state: string) => {
	switch (chunk) {
		case 0x4130: // TRI_MATERIAL
			const name = context.reader.readStringZero();

			context.reader.readInt16u(); // Number of faces using material

			return name;
	}

	return state;
};

const readRoot = async (context: Context, end: number, chunk: number, state: model.Mesh) => {
	switch (chunk) {
		case 0x4d4d: // MAIN3DS
			return scan(context, end, readMain, state);

		default:
			throw invalidChunk(context.file, chunk, "only main chunk 0x4d4d is accepted at top-level");
	}
};

/*
** Read chunks from given binary reader until offset limit is reached and use
** given callback to process their contents.
*/
const scan = async <T>(context: Context, end: number, recurse: (context: Context, end: number, section: number, state: T) => Promise<T>, state: T) => {
	while (context.reader.getOffset() < end) {
		const begin = context.reader.getOffset();
		const chunk = context.reader.readInt16u();
		const size = context.reader.readInt32u();

		state = await recurse(context, Math.min(begin + size, end), chunk, state);

		context.reader.skip(size + begin - context.reader.getOffset());
	}

	return state;
};

export { load }
