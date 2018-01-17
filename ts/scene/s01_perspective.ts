import * as application from "../engine/application";
import * as display from "../engine/display";
import * as math from "../engine/math";
import * as software from "../engine/software";

interface State {
	projection: math.Matrix,
	rotation: number,
	screen: display.Context2DScreen
}

const prepare = async () => {
	const runtime = application.runtime(display.Context2DScreen);

	return {
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		rotation: 0,
		screen: runtime.screen
	};
};

const render = (state: State) => {
	const distance = -8;
	const orbitate = state.rotation;
	const pi = Math.PI;
	const range = 2;
	const rotate = state.rotation * 2;
	const size = Math.sqrt(2) / 2;

	const points = [
		{ x: Math.cos(rotate + pi * 0), y: -size, z: distance + Math.sin(rotate + pi * 0) },
		{ x: Math.cos(rotate + pi * 0.5), y: -size, z: distance + Math.sin(rotate + pi * 0.5) },
		{ x: Math.cos(rotate + pi * 1), y: -size, z: distance + Math.sin(rotate + pi * 1) },
		{ x: Math.cos(rotate + pi * 1.5), y: -size, z: distance + Math.sin(rotate + pi * 1.5) },
		{ x: Math.cos(rotate + pi * 0), y: size, z: distance + Math.sin(rotate + pi * 0) },
		{ x: Math.cos(rotate + pi * 0.5), y: size, z: distance + Math.sin(rotate + pi * 0.5) },
		{ x: Math.cos(rotate + pi * 1), y: size, z: distance + Math.sin(rotate + pi * 1) },
		{ x: Math.cos(rotate + pi * 1.5), y: size, z: distance + Math.sin(rotate + pi * 1.5) }
	];

	for (const point of points) {
		point.x = point.x + Math.cos(orbitate) * range;
		point.y = point.y + Math.sin(orbitate) * range;
	}

	const indices: [number, number, number][] = [
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

	const model = {
		meshes: [{
			indices: indices,
			points: points
		}]
	};

	software
		.load(model)
		.then((meshes => software.draw(screen, state.projection, math.Matrix.createIdentity(), software.DrawMode.Wire, meshes)));
};

const update = (state: State, dt: number) => {
	state.rotation -= dt * 0.001;
};

const scenario = {
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
