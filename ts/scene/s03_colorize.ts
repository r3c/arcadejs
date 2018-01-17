import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as software from "../engine/software";

/*
** What changed?
** - Constant mesh data structure is now loaded from a JSON file
** - Mesh defines per-vertex color used to interpolate face colors
*/

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	cube: software.Mesh[],
	input: controller.Input,
	projection: math.Matrix,
	screen: display.Context2DScreen
}

const prepare = async () => {
	const cube = await io.Stream
		.readURL(io.StringReader, "./res/mesh/cube-color.json")
		.then(reader => software.load(graphic.Loader.fromJSON(reader.data), "./res/mesh/"));

	const runtime = application.runtime(display.Context2DScreen);

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		cube: cube,
		input: runtime.input,
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		screen: runtime.screen
	};
};

const render = (state: State) => {
	const screen = state.screen;

	screen.context.fillStyle = 'black';
	screen.context.fillRect(0, 0, screen.getWidth(), state.screen.getHeight());

	const camera = state.camera;
	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	software.draw(screen, state.projection, view, software.DrawMode.Default, state.cube);
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
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
