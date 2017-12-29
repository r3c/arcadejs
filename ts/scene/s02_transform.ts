import * as controller from "../library/controller";
import * as display from "../library/display";
import * as render from "../library/render";

interface State {
	context: CanvasRenderingContext2D,
	input: controller.Input,
	position: render.Point3D,
	rotation: render.Point3D,
	screen: render.Point2D,
	view: render.View
};

const state = {
	context: display.context,
	input: new controller.Input(display.canvas),
	position: { x: 0, y: 0, z: -6 },
	rotation: { x: 0, y: 0, z: 0 },
	screen: { x: display.width, y: display.height },
	view: new render.View()
};

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

const drawTriangle = (context: CanvasRenderingContext2D, p1: render.Point2D, p2: render.Point2D, p3: render.Point2D) => {
	context.strokeStyle = 'white';
	context.beginPath();
	context.moveTo(p1.x, p1.y);
	context.lineTo(p2.x, p2.y);
	context.lineTo(p3.x, p3.y);
	context.lineTo(p1.x, p1.y);
	context.stroke();
};

const draw = (state: State) => {
	const context = state.context;
	const view = state.view;

	context.fillStyle = 'black';
	context.fillRect(0, 0, state.screen.x, state.screen.y);

	view.enter();
	view.translate(state.position)
	view.rotate({ x: 1, y: 0, z: 0 }, state.rotation.x);
	view.rotate({ x: 0, y: 1, z: 0 }, state.rotation.y);

	const points: render.Point3D[] = [
		{ x: -2, y: 2, z: -2 },
		{ x: 2, y: 2, z: -2 },
		{ x: 2, y: -2, z: -2 },
		{ x: -2, y: -2, z: -2 },
		{ x: -2, y: 2, z: 2 },
		{ x: 2, y: 2, z: 2 },
		{ x: 2, y: -2, z: 2 },
		{ x: -2, y: -2, z: 2 }
	];

	const faces = [
		[0, 1, 2, 3],
		[4, 5, 6, 7],
		[0, 3, 7, 4],
		[1, 2, 6, 5],
		[0, 1, 5, 4],
		[2, 3, 7, 6]
	];

	for (const face of faces) {
		const vertices = face.map(i => points[i]);
		const dots = vertices.map(v => view.perspective(v, state.screen));

		drawTriangle(context, dots[0], dots[1], dots[2]);
		drawTriangle(context, dots[2], dots[3], dots[0]);
	}

	view.leave();
};

const tick = (dt: number) => {
	change(state, dt);
	draw(state);
};

export { tick };
