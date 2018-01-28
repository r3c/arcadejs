import * as io from "../../io";
import * as math from "../../math";
import * as mesh from "../mesh";
import * as path from "../../fs/path";

/*
** Implementation based on:
** http://www.martinreddy.net/gfx/3d/3DS.spec
** http://www.martinreddy.net/gfx/3d/MLI.spec
*/

interface Context {
	directory: string,
	file: string,
	reader: io.BinaryReader
}

interface Model {
	materials: { [name: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

const invalidChunk = (file: string, chunk: number, description: string) => {
	return Error(`invalid chunk ${chunk} in file ${file}: ${description}`);
};

const load = async (url: string) => {
	const context = {
		directory: path.directory(url),
		file: url,
		reader: new io.BinaryReader(await io.readURL(io.BinaryFormat, url), io.Endian.Little)
	};

	return scan(context, context.reader.getLength(), readRoot, {
		materials: {},
		meshes: []
	});
};

const readColor = async (context: Context, end: number, chunk: number, state: math.Vector4) => {
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

const readEdit = async (context: Context, end: number, chunk: number, state: Model) => {
	switch (chunk) {
		case 0x4000: // DIT_OBJECT
			context.reader.readStringZero(); // Skip object name

			const meshes = await scan(context, end, readObject, []);

			for (const mesh of meshes)
				state.meshes.push(mesh);

			return state;

		case 0xafff: // DIT_MATERIAL
			const { material, name } = await scan(context, end, readMaterial, {
				material: {
					colorBase: mesh.defaultColor,
					colorMap: mesh.defaultMap
				},
				name: ""
			});

			state.materials[name] = material;

			return state;
	}

	return state;
};

const readMain = async (context: Context, end: number, chunk: number, state: Model) => {
	switch (chunk) {
		case 0x3d3d: // EDIT3DS
			return scan(context, end, readEdit, state);
	}

	return state;
};

const readMaterial = async (context: Context, end: number, chunk: number, state: { material: mesh.Material, name: string }) => {
	switch (chunk) {
		case 0xa000: // Material name
			state.name = context.reader.readStringZero();

			break;

		case 0xa010: // Ambient color
			state.material.colorBase = await scan(context, end, readColor, mesh.defaultColor);

			break;

		case 0xa020: // Diffuse color
			break;

		case 0xa030: // Specular color
			break;

		case 0xa040: // Shininess
			break;

		case 0xa041: // Shininess strength
			break;

		case 0xa200: // Texture 1
			state.material.colorMap = await scan(context, end, readMaterialMap, mesh.defaultMap);

			break;

		case 0xa204: // Specular map
			break;

		case 0xa230: // Bump map
			break;

		case 0xa33c: // Gloss map
			break;
	}

	return state;
};

const readMaterialMap = async (context: Context, end: number, chunk: number, state: ImageData) => {
	switch (chunk) {
		case 0xa300:
			return mesh.loadImage(path.combine(context.directory, context.reader.readStringZero()));
	}

	return state;
};

const readObject = async (context: Context, end: number, chunk: number, state: mesh.Mesh[]) => {
	switch (chunk) {
		case 0x4100: // OBJ_TRIMESH
			const mesh = await scan(context, end, readPolygon, {
				points: [],
				triangles: []
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

const readPolygon = async (context: Context, end: number, chunk: number, state: mesh.Mesh) => {
	switch (chunk) {
		case 0x4110: // TRI_VERTEXL
			for (let count = context.reader.readInt16u(); count > 0; --count) {
				state.points.push({
					x: context.reader.readFloat32(),
					y: context.reader.readFloat32(),
					z: context.reader.readFloat32()
				});
			}

			return state;

		case 0x4120: // TRI_FACEL1
			for (let count = context.reader.readInt16u(); count > 0; --count) {
				state.triangles.push([
					context.reader.readInt16u(),
					context.reader.readInt16u(),
					context.reader.readInt16u()
				]);

				context.reader.readInt16u(); // Face info
			}

			state.materialName = await scan(context, end, readPolygonMaterial, "");

			return state;

		case 0x4140: // TRI_MAPPINGCOORS
			if (state.coords === undefined)
				state.coords = [];

			for (let count = context.reader.readInt16u(); count > 0; --count) {
				state.coords.push({
					x: context.reader.readFloat32(),
					y: 1.0 - context.reader.readFloat32()
				});
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

const readRoot = async (context: Context, end: number, chunk: number, state: Model) => {
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
