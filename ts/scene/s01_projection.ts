import * as application from "../engine/application";
import * as display from "../engine/display";
import * as math from "../engine/math";
import * as software from "../engine/render/software";

interface State {
	projection: math.Matrix,
	renderer: software.Renderer
}

const prepare = async () => {
	const runtime = application.runtime(display.Context2DScreen);

	return {
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
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
	renderer.draw(meshes, state.projection, math.Matrix.createIdentity(), software.DrawMode.Wire);
};

const update = (state: State, dt: number) => {
};

const scenario = {
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
