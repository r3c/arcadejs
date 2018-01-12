import * as application from "../engine/application";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as software from "../engine/software";

/*
** What changed?
** - Constant mesh data structure is now loaded from a JSON file
** - Mesh defines per-vertex color used to interpolate face colors
*/

const state = {
	camera: {
		position: { x: 0, y: 0, z: -5 },
		rotation: { x: 0, y: 0, z: 0 }
	},
	input: application.input,
	projection: math.Matrix.createPerspective(45, application.screen2d.getRatio(), 0.1, 100),
	screen: application.screen2d
};

let cube: software.Mesh[] = [];

const render = () => {
	const screen = state.screen;

	screen.context.fillStyle = 'black';
	screen.context.fillRect(0, 0, screen.getWidth(), state.screen.getHeight());

	const camera = state.camera;
	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	software.draw(screen, state.projection, view, software.DrawMode.Default, cube);
};

const update = (dt: number) => {
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

io.Stream
	.readURL(io.StringReader, "./res/mesh/cube-color.json")
	.then(reader => software.load(graphic.Loader.fromJSON(reader.data), "./res/mesh/"))
	.then(meshes => cube = meshes);

const scene = {
	enable: () => application.show(application.screen2d),
	render: render,
	update: update
};

export { scene };
