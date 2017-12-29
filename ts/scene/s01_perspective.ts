import * as controller from "../library/controller";
import * as display from "../library/display";
import * as render from "../library/render";

interface State {
	context: CanvasRenderingContext2D,
	screen: render.Point2D,
	view: render.View
};

const state = {
	context: display.context,
	screen: { x: display.width, y: display.height },
	view: new render.View()
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

	const points: render.Point3D[] = [
		{ x: -2, y: 2, z: -8 },
		{ x: 2, y: 2, z: -8 },
		{ x: 2, y: -2, z: -8 },
		{ x: -2, y: -2, z: -8 },
		{ x: -2, y: 2, z: -4 },
		{ x: 2, y: 2, z: -4 },
		{ x: 2, y: -2, z: -4 },
		{ x: -2, y: -2, z: -4 }
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
		const dots = vertices.map(v => view.perspective(moveVertex(v), state.screen));

		drawTriangle(context, dots[0], dots[1], dots[2]);
		drawTriangle(context, dots[2], dots[3], dots[0]);
	}

	view.leave();
};

const moveVertex = (vertex: render.Point3D): render.Point3D => {
	const now = new Date().getTime();

	return {
		x: vertex.x + Math.cos(now * 0.005),
		y: vertex.y + Math.sin(now * 0.005),
		z: vertex.z
	};
};

const tick = (dt: number) => {
	draw(state);
};

export { tick };
