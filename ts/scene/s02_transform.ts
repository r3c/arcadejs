import * as math from "../library/math";
import * as render from "../library/render";
import * as shared from "./shared";

const state = {
	input: shared.input,
	position: { x: 0, y: 0, z: -5 },
	projection: math.Matrix.createPerspective(45, 800 / 600, 0.1, 100),
	rotation: { x: 0, y: 0, z: 0 },
	screen: shared.screen
};

const change = function (dt: number) {
	const movement = state.input.fetchMovement();
	const wheel = state.input.fetchWheel();

	if (state.input.isPressed("mouseleft")) {
		state.position.x += movement.x / 64;
		state.position.y -= movement.y / 64;
	}

	if (state.input.isPressed("mouseright")) {
		state.rotation.x -= movement.y / 64;
		state.rotation.y -= movement.x / 64;
	}

	state.position.z += wheel;
};

const draw = () => {
	const points = [
		{ x: -1, y: 1, z: -1 },
		{ x: 1, y: 1, z: -1 },
		{ x: 1, y: -1, z: -1 },
		{ x: -1, y: -1, z: -1 },
		{ x: -1, y: 1, z: 1 },
		{ x: 1, y: 1, z: 1 },
		{ x: 1, y: -1, z: 1 },
		{ x: -1, y: -1, z: 1 }
	];

	const faces = [
		[0, 1, 2, 3],
		[4, 5, 6, 7],
		[0, 3, 7, 4],
		[1, 2, 6, 5],
		[0, 1, 5, 4],
		[2, 3, 7, 6]
	];

	const vertices = faces
		.map(face => face.map(i => points[i]))
		.map(face => [face[0], face[1], face[2], face[2], face[3], face[0]])
		.reduce((current, value) => current = current.concat(value), []);

	const screen = state.screen;

	screen.context.fillStyle = 'black';
	screen.context.fillRect(0, 0, screen.getWidth(), state.screen.getHeight());

	const view = math.Matrix
		.createIdentity()
		.translate(state.position)
		.rotate({ x: 1, y: 0, z: 0 }, state.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, state.rotation.y);

	render.draw(screen, state.projection, view, {
		vertices: vertices
	});
};

const tick = (dt: number) => {
	change(dt);
	draw();
};

export { tick };
