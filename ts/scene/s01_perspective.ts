import * as display from "../library/display";
import * as math from "../library/math";
import * as render from "../library/render";
import * as shared from "./shared";

interface State {
	projection: math.Matrix,
	screen: display.Screen
};

const state = {
	projection: math.Matrix.createPerspective(45, shared.screen.getWidth() / shared.screen.getHeight(), 0.1, 100),
	screen: shared.screen
};

const draw = (state: State) => {
	const screen = state.screen;

	screen.context.fillStyle = 'black';
	screen.context.fillRect(0, 0, screen.getWidth(), screen.getHeight());

	const points = [
		{ x: -1, y: 1, z: -5 },
		{ x: 1, y: 1, z: -5 },
		{ x: 1, y: -1, z: -5 },
		{ x: -1, y: -1, z: -5 },
		{ x: -1, y: 1, z: -4 },
		{ x: 1, y: 1, z: -4 },
		{ x: 1, y: -1, z: -4 },
		{ x: -1, y: -1, z: -4 }
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

	render.draw(screen, state.projection, math.Matrix.createIdentity(), {
		vertices: vertices.map(moveVertex)
	});
};

const moveVertex = (vertex: math.Point3D): math.Point3D => {
	const now = new Date().getTime();

	return {
		x: vertex.x + Math.cos(now * 0.005) * 0.5,
		y: vertex.y + Math.sin(now * 0.005) * 0.5,
		z: vertex.z
	};
};

const tick = (dt: number) => {
	draw(state);
};

export { tick };
