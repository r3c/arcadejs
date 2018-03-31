import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as matrix from "../engine/math/matrix";
import * as software from "../engine/graphic/software";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";

/*
** What changed?
** - New "camera" property in state to hold current camera position/rotation
** - New "input" instance referenced to read mouse position and button presses
** - Method "update" change camera properties depending on input
** - Manually modified cube positions replaced by constant structure
** - Model loading is done only once instead of once per draw iteration
*/

interface State {
	camera: view.Camera,
	cube: software.Mesh[],
	input: controller.Input,
	projection: matrix.Matrix4,
	renderer: software.Renderer
}

const prepare = () => application.runtime(display.Context2DScreen, undefined, async (screen, input) => {
	const renderer = new software.Renderer(screen);

	const cube = renderer.load({
		meshes: [{
			points: [
				{ x: -1, y: 1, z: -1 },
				{ x: 1, y: 1, z: -1 },
				{ x: 1, y: -1, z: -1 },
				{ x: -1, y: -1, z: -1 },
				{ x: -1, y: 1, z: 1 },
				{ x: 1, y: 1, z: 1 },
				{ x: 1, y: -1, z: 1 },
				{ x: -1, y: -1, z: 1 }
			],
			triangles: [
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
			]
		}]
	});

	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
		cube: cube,
		input: input,
		projection: matrix.Matrix4.createIdentity(),
		renderer: renderer
	};
});

const render = (state: State) => {
	const camera = state.camera;
	const renderer = state.renderer;
	const view = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	renderer.clear();
	renderer.draw(state.cube, state.projection, view, software.DrawMode.Wire);
};

const resize = (state: State, screen: display.Context2DScreen) => {
	state.projection = matrix.Matrix4.createPerspective(45, screen.getRatio(), 0.1, 100);
};

const update = (state: State, dt: number) => {
	state.camera.move(state.input);
};

const process = application.declare({
	prepare: prepare,
	render: render,
	resize: resize,
	update: update
});

export { process };
