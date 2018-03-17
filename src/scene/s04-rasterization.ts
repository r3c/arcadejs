import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as software from "../engine/render/software";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";

/*
** What changed?
** - Constant mesh data structure is now loaded from a JSON file
** - Mesh #1 defines per-vertex color used to interpolate face colors
** - Mesh #2 defines ambient map used to interpolate face texture
** - Method update simplified and uses shared camera code
*/

interface Configuration {
	useTexture: boolean
}

interface State {
	camera: view.Camera,
	cubeWithColor: software.Mesh[],
	cubeWithTexture: software.Mesh[],
	input: controller.Input,
	projection: matrix.Matrix4,
	renderer: software.Renderer,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	useTexture: false
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.Context2DScreen);
	const renderer = new software.Renderer(runtime.screen);

	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		cubeWithColor: renderer.load(await model.fromJSON("./obj/cube-color.json")),
		cubeWithTexture: renderer.load(await model.fromJSON("./obj/cube/model.json")),
		input: runtime.input,
		projection: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: renderer,
		tweak: tweak
	};
};

const render = (state: State) => {
	const camera = state.camera;
	const renderer = state.renderer;
	const view = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const model = state.tweak.useTexture ? state.cubeWithTexture : state.cubeWithColor;

	renderer.clear();
	renderer.draw(model, state.projection, view, software.DrawMode.Default);
};

const update = (state: State, dt: number) => {
	state.camera.move(state.input);
};

const scenario = {
	configuration: configuration,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };