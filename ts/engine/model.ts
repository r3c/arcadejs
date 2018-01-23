import * as io from "./io";
import * as json from "./model/loaders/json";
import * as math from "./math";
import * as mesh from "./model/mesh";
import * as obj from "./model/loaders/obj";
import * as tds from "./model/loaders/3ds";

interface Model {
	materials?: { [key: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

const from3DS = async (url: string) => {
	return tds.load(url);
};

const fromJSON = async (urlOrData: any) => {
	return json.load(urlOrData);
};

const fromOBJ = async (url: string) => {
	return obj.load(url);
};

export { Model, from3DS, fromJSON, fromOBJ };
