import * as controller from "../library/controller";
import * as render from "../library/render";
import * as screen from "../library/screen";

interface State {
	context: CanvasRenderingContext2D,
	input: controller.Input,
	position: render.Point3D,
	rotation: render.Point3D,
	screen: render.Point2D,
	view: render.View
};

const state = {
	context: screen.context,
	input: new controller.Input(screen.canvas),
	position: { x: 0, y: 0, z: -10 },
	rotation: { x: 0, y: 0, z: 0 },
	screen: { x: screen.width, y: screen.height },
	view: new render.View()
};

const strokeTriangle2D = function (context: CanvasRenderingContext2D, point1: render.Point2D, point2: render.Point2D, point3: render.Point2D) {
	context.strokeStyle = 'white';
	context.beginPath();
	context.moveTo(point1.x, point1.y);
	context.lineTo(point2.x, point2.y);
	context.lineTo(point3.x, point3.y);
	context.lineTo(point1.x, point1.y);
	context.stroke();
}

const display = function (state: State) {
	const context = state.context;
	const scene = state.view;

	context.fillStyle = 'black';
	context.fillRect(0, 0, state.screen.x, state.screen.y);

	scene.enter();
	scene.translate(state.position)
	scene.rotate({ x: 1, y: 0, z: 0 }, state.rotation.x);
	scene.rotate({ x: 0, y: 1, z: 0 }, state.rotation.y);

	const vertices = [
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
		const point1 = scene.perspective(vertices[face[0]], state.screen);
		const point2 = scene.perspective(vertices[face[1]], state.screen);
		const point3 = scene.perspective(vertices[face[2]], state.screen);
		const point4 = scene.perspective(vertices[face[3]], state.screen);

		strokeTriangle2D(context, point1, point2, point3);
		strokeTriangle2D(context, point3, point4, point1);
	}

	scene.leave();
};

const refresh = function (state: State) {
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

const tick = () => {
	refresh(state);
	display(state);
};

export { tick };
