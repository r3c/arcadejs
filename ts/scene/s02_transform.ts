import * as math from "../library/math";
import * as render from "../library/render";
import * as shared from "./shared";

const state = {
	camera : {
		position: { x: 0, y: 0, z: 5 },
		rotation: { x: 0, y: 0, z: 0 }
	},
	input: shared.input,
	projection: math.Matrix.createPerspective(45, shared.screen.getRatio(), 0.1, 100),
	screen: shared.screen
};

const change = function (dt: number) {
	const camera = state.camera;
	const input = state.input;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	if (input.isPressed("mouseleft")) {
		camera.position.x -= movement.x / 64;
		camera.position.y -= movement.y / 64;
	}

	if (input.isPressed("mouseright")) {
		camera.rotation.x += movement.y / 64;
		camera.rotation.y -= movement.x / 64;
	}

	camera.position.z -= wheel;
};

const draw = () => {
	const positions = [
		{ x: -1, y: 1, z: -1 },
		{ x: 1, y: 1, z: -1 },
		{ x: 1, y: -1, z: -1 },
		{ x: -1, y: -1, z: -1 },
		{ x: -1, y: 1, z: 1 },
		{ x: 1, y: 1, z: 1 },
		{ x: 1, y: -1, z: 1 },
		{ x: -1, y: -1, z: 1 }
	];

	const faces: [number, number, number][] = [
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
	];

	const screen = state.screen;

	screen.context.fillStyle = 'black';
	screen.context.fillRect(0, 0, screen.getWidth(), state.screen.getHeight());

	const camera = state.camera;
	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	render.draw(screen, state.projection, view, {
		colors: Array.apply(null, Array(positions.length)).map((v: undefined, i: number) => ({ x: (i / 2 * 37) % 128 + 128, y: (i * 61) % 128 + 128, z: (i * 89) % 128 + 128, w: 255 })),
		positions: positions,
		faces: faces
	});
};

const tick = (dt: number) => {
	change(dt);
	draw();
};

export { tick };
