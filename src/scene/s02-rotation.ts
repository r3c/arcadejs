import * as application from "../engine/application";
import * as display from "../engine/display";
import * as matrix from "../engine/math/matrix";
import * as mesh from "./shared/mesh";
import * as software from "../engine/graphic/software";

/*
** What changed?
** - Numeric "rotation" angle is used to recompute cube coordinates on each frame
*/

interface State {
	projection: matrix.Matrix4,
	renderer: software.Renderer,
	rotation: number
}

const prepare = () => application.runtime(display.Context2DScreen, undefined, async (screen, input) => ({
	projection: matrix.Matrix4.createIdentity(),
	renderer: new software.Renderer(screen),
	rotation: 0
}));

const render = (state: State) => {
	const distance = -5;
	const orbitate = state.rotation;
	const pi = Math.PI;
	const range = 1;
	const rotate = state.rotation * 2;
	const size = Math.sqrt(2) / 2;

	const points = [
		Math.cos(rotate + pi * 0), -size, distance + Math.sin(rotate + pi * 0),
		Math.cos(rotate + pi * 0.5), -size, distance + Math.sin(rotate + pi * 0.5),
		Math.cos(rotate + pi * 1), -size, distance + Math.sin(rotate + pi * 1),
		Math.cos(rotate + pi * 1.5), -size, distance + Math.sin(rotate + pi * 1.5),
		Math.cos(rotate + pi * 0), size, distance + Math.sin(rotate + pi * 0),
		Math.cos(rotate + pi * 0.5), size, distance + Math.sin(rotate + pi * 0.5),
		Math.cos(rotate + pi * 1), size, distance + Math.sin(rotate + pi * 1),
		Math.cos(rotate + pi * 1.5), size, distance + Math.sin(rotate + pi * 1.5)
	];

	for (let i = 0; i + 2 < points.length; i += 3) {
		points[i + 0] = points[i + 0] + Math.cos(orbitate) * range;
		points[i + 1] = points[i + 1] + Math.sin(orbitate) * range;
	}

	const indices = [
		0, 1, 2,
		2, 3, 0,
		4, 5, 6,
		6, 7, 4,
		0, 3, 7,
		7, 4, 0,
		1, 2, 6,
		6, 5, 1,
		0, 1, 5,
		5, 4, 0,
		2, 3, 7,
		7, 6, 2
	];

	const renderer = state.renderer;
	const meshes = mesh.convert({
		indices: indices,
		points: points
	});

	renderer.clear();
	renderer.draw(meshes, state.projection, matrix.Matrix4.createIdentity(), software.DrawMode.Wire);
};

const resize = (state: State, screen: display.Context2DScreen) => {
	state.projection = matrix.Matrix4.createPerspective(45, screen.getRatio(), 0.1, 100);
};

const update = (state: State, dt: number) => {
	state.rotation -= dt * 0.001;
};

const process = application.declare({
	prepare: prepare,
	render: render,
	resize: resize,
	update: update
});

export { process };
