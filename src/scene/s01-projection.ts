import * as application from "../engine/application";
import * as display from "../engine/display";
import * as matrix from "../engine/math/matrix";
import * as mesh from "./shared/mesh";
import * as software from "../engine/graphic/software";

interface State {
	projection: matrix.Matrix4,
	renderer: software.Renderer
}

const prepare = () => application.runtime(display.Context2DScreen, undefined, async (screen, input) => ({
	projection: matrix.Matrix4.createIdentity(),
	renderer: new software.Renderer(screen)
}));

const render = (state: State) => {
	const distance = -5;

	const points = [
		-1, 1, distance - 1,
		1, 1, distance - 1,
		1, -1, distance - 1,
		-1, -1, distance - 1,
		-1, 1, distance + 1,
		1, 1, distance + 1,
		1, -1, distance + 1,
		-1, -1, distance + 1
	];

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

const process = application.declare({
	prepare: prepare,
	render: render,
	resize: resize
});

export { process };
