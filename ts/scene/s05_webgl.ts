import * as application from "../engine/application";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as webgl from "../engine/webgl";

/*
** What changed?
** - Rendering target is now a WebGL context instead of a 2D one
*/

const state = {
	camera: {
		position: { x: 0, y: 0, z: -5 },
		rotation: { x: 0, y: 0, z: 0 }
	},
	input: application.input,
	projection: math.Matrix.createPerspective(45, application.screen2d.getRatio(), 0.1, 100),
	screen: application.screen3d
};

const render = () => {
	const screen = state.screen;

	webgl.draw(screen.context);
};

const update = (dt: number) => {
	const camera = state.camera;
	const input = state.input;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	if (input.isPressed("mouseleft")) {
		camera.position.x += movement.x / 64;
		camera.position.y += movement.y / 64;
	}

	if (input.isPressed("mouseright")) {
		camera.rotation.x += movement.y / 64;
		camera.rotation.y -= movement.x / 64;
	}

	camera.position.z += wheel;
};

const scene = {
	enable: () => application.show(application.screen3d),
	render: render,
	update: update
};

export { scene };
