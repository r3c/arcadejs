import * as math from "../library/math";
import * as render from "../library/render";
import * as shared from "./shared";

const state = {
	projection: math.Matrix.createPerspective(45, shared.screen.getRatio(), 0.1, 100),
	screen: shared.screen
};

const draw = () => {
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
	screen.context.fillRect(0, 0, screen.getWidth(), screen.getHeight());

	render.draw(screen, state.projection, math.Matrix.createIdentity(), {
		faces: faces,
		points: points.map(moveVertex)
	});
};

const moveVertex = (vertex: math.Vector3) => {
	const angle = new Date().getTime() * 0.005;
	const distance = 0.5;

	return {
		x: vertex.x + Math.cos(angle) * distance,
		y: vertex.y + Math.sin(angle) * distance,
		z: vertex.z
	};
};

const tick = (dt: number) => {
	draw();
};

export { tick };
