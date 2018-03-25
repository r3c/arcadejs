import * as application from "../engine/application";
import * as display from "../engine/display";
import * as matrix from "../engine/math/matrix";
import * as software from "../engine/render/software";

interface State {
	projection: matrix.Matrix4,
	renderer: software.Renderer
}

const prepare = async () => {
	const runtime = application.runtime(display.Context2DScreen);

	return {
		projection: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: new software.Renderer(runtime.screen)
	};
};

const render = (state: State) => {
	const distance = -5;

	const points = [
		{ x: -1, y: 1, z: distance - 1 },
		{ x: 1, y: 1, z: distance - 1 },
		{ x: 1, y: -1, z: distance - 1 },
		{ x: -1, y: -1, z: distance - 1 },
		{ x: -1, y: 1, z: distance + 1 },
		{ x: 1, y: 1, z: distance + 1 },
		{ x: 1, y: -1, z: distance + 1 },
		{ x: -1, y: -1, z: distance + 1 }
	];

	const triangles: [number, number, number][] = [
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

	const renderer = state.renderer;
	const meshes = renderer.load({
		meshes: [{
			points: points,
			triangles: triangles
		}]
	});

	renderer.clear();
	renderer.draw(meshes, state.projection, matrix.Matrix4.createIdentity(), software.DrawMode.Wire);
};

const update = (state: State, dt: number) => {
};

const process = application.declare({
	prepare: prepare,
	render: render,
	update: update
});

export { process };
