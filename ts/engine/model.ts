import * as io from "./io";
import * as json from "./model/loaders/json";
import * as math from "./math";
import * as mesh from "./model/mesh";
import * as obj from "./model/loaders/obj";

interface Model {
	materials?: { [key: string]: mesh.Material },
	meshes: mesh.Mesh[]
}

const fromJSON = async (urlOrData: any) => {
	return json.load(urlOrData);
}

const fromOBJ = async (url: string) => {
	return obj.load(url);
}

export { Model, fromJSON, fromOBJ };
