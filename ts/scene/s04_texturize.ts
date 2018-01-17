import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as software from "../engine/software";

/*
** What changed?
** - Cube mesh now defines material with ambient map
*/

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	cube: software.Mesh[],
	input: controller.Input,
	projection: math.Matrix,
	renderer: software.Renderer
}

const prepare = async () => {
	const runtime = application.runtime(display.Context2DScreen);
	const renderer = new software.Renderer(runtime.screen);

	const cube = await io.Stream
		.readURL(io.StringReader, "./res/mesh/cube-ambient.json")
		.then(reader => renderer.load(graphic.Loader.fromJSON(reader.data), "./res/mesh/"));

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		cube: cube,
		input: runtime.input,
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: renderer
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

	renderer.clear();
	renderer.draw(state.cube, state.projection, view, software.DrawMode.Default);
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
};;

const scenario = {
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };