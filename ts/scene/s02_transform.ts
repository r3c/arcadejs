import * as controller from "../library/controller";
import * as display from "../library/display";
import * as math from "../library/math";
import * as render from "../library/render";
import * as shared from "./shared";

interface State {
	input: controller.Input,
	position: math.Point3D,
	projection: math.Projection,
	rotation: math.Point3D,
	screen: display.Screen,
	view: math.View
};

const state = {
	input: shared.input,
	position: { x: 0, y: 0, z: -5 },
	projection: new math.Projection(),
	rotation: { x: 0, y: 0, z: 0 },
	screen: shared.screen,
	view: new math.View()
};

state.projection.setPerspective(45, 800 / 600, 0.1, 100);

const change = function (state: State, dt: number) {
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

const draw = (state: State) => {
	const screen = state.screen;
	const view = state.view;

	screen.context.fillStyle = 'black';
	screen.context.fillRect(0, 0, screen.getWidth(), state.screen.getHeight());

	view.enter();
	view.translate(state.position)
	view.rotate({ x: 1, y: 0, z: 0 }, state.rotation.x);
	view.rotate({ x: 0, y: 1, z: 0 }, state.rotation.y);

	const points: math.Point3D[] = [
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

	render.draw(screen, state.projection.get(), view.get(), {
		vertices: vertices
	});

	view.leave();
};

const tick = (dt: number) => {
	change(state, dt);
	draw(state);
};

export { tick };
