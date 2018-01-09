import * as application from "../engine/application";
import * as math from "../engine/math";
import * as software from "../engine/software";

/*
** What changed?
** - New "camera" property in state to hold current camera position/rotation
** - New "input" instance referenced to read mouse position and button presses
** - Manually modified cube positions replaced by constant structure
** - Model loading is done only once instead of once per draw iteration
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

	software.draw(screen, state.projection, view, software.DrawMode.Wire, cube);
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

software
	.load({
		meshes: [{
			positions: [
				{ x: -1, y: 1, z: -1 },
				{ x: 1, y: 1, z: -1 },
				{ x: 1, y: -1, z: -1 },
				{ x: -1, y: -1, z: -1 },
				{ x: -1, y: 1, z: 1 },
				{ x: 1, y: 1, z: 1 },
				{ x: 1, y: -1, z: 1 },
				{ x: -1, y: -1, z: 1 }
			],
			faces: [
				[0, 1, 2],
				[2, 3, 0],
				[4, 5, 6],
				[6, 7, 4],
				[0, 3, 7],
				[7, 4, 0],
				[1, 2, 6],
				[6, 5, 1],
				[0, 1, 5],
				[5, 4, 0],
				[2, 3, 7],
				[7, 6, 2]
			]
		}]
	})
	.then(meshes => cube = meshes);

const scene = {
	enable: () => application.show(application.screen2d),
	render: render,
	update: update
};

export { scene };
