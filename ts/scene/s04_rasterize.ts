import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as model from "../engine/model";
import * as software from "../engine/render/software";

/*
** What changed?
** - Constant mesh data structure is now loaded from a JSON file
** - Mesh #1 defines per-vertex color used to interpolate face colors
** - Mesh #2 defines ambient map used to interpolate face texture
*/

interface Configuration {
	useTexture: boolean
}

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	cubeWithColor: software.Mesh[],
	cubeWithTexture: software.Mesh[],
	input: controller.Input,
	projection: math.Matrix,
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
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		cubeWithColor: renderer.load(await model.fromJSON("./res/model/cube-color.json")),
		cubeWithTexture: renderer.load(await model.fromJSON("./res/model/cube.json")),
		input: runtime.input,
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: renderer,
		tweak: tweak
	};
};

const render = (state: State) => {
	const camera = state.camera;
	const renderer = state.renderer;
	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const model = state.tweak.useTexture ? state.cubeWithTexture : state.cubeWithColor;

	renderer.clear();
	renderer.draw(model, state.projection, view, software.DrawMode.Default);
};

const update = (state: State, dt: number) => {
	const camera = state.camera;
	const input = state.input;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	if (input.isPressed("mouseleft")) {
		camera.position.x += movement.x / 64;
		camera.position.y -= movement.y / 64;
	}

	if (input.isPressed("mouseright")) {
		camera.rotation.x -= movement.y / 64;
		camera.rotation.y -= movement.x / 64;
	}

	camera.position.z += wheel;
};

const scenario = {
	configuration: configuration,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
