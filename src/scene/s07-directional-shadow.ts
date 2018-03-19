import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/controller";
import * as debugTexture from "../engine/render/renderers/debug-texture";
import * as display from "../engine/display";
import * as forwardLighting from "../engine/render/renderers/forward-lighting";
import * as io from "../engine/io";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Scene is first rendered from light's point of view to a shadow map
** - Then rendered a second time from camera's point of view, using this map for shadowing
*/

interface Configuration {
	animate: boolean,
	enableShadow: boolean,
	showDebug: boolean
}

interface SceneState {
	camera: view.Camera,
	input: controller.Input,
	models: {
		cube: webgl.Model,
		debug: webgl.Model,
		ground: webgl.Model
	},
	move: number,
	projectionMatrix: matrix.Matrix4,
	renderers: {
		debug: debugTexture.Renderer,
		lights: forwardLighting.Renderer[]
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	animate: true,
	enableShadow: true,
	showDebug: false
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	tweak.enableShadow !== 0
];

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube/model.json");
	const debugModel = await model.fromJSON("./obj/debug.json");
	const groundModel = await model.fromJSON("./obj/ground/model.json");

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		input: runtime.input,
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			debug: webgl.loadModel(gl, debugModel),
			ground: webgl.loadModel(gl, groundModel)
		},
		move: 0,
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderers: {
			debug: new debugTexture.Renderer(gl, { zNear: 0.1, zFar: 100 }),
			lights: bitfield.enumerate(getOptions(tweak)).map(flags => new forwardLighting.Renderer(gl, {
				lightModel: forwardLighting.LightModel.Phong,
				maxDirectionalLights: 1,
				useEmissiveMap: false,
				useGlossMap: true,
				useHeightMap: true,
				useNormalMap: true,
				useOcclusionMap: false,
				useShadowMap: flags[0]
			}))
		},
		target: new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight()),
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const models = state.models;
	const renderers = state.renderers;
	const target = state.target;;

	// Setup view matrices
	const cameraViewMatrix = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const shadowViewMatrix = matrix.Matrix4
		.createIdentity()
		.translate({ x: 0, y: 0, z: -10 })
		.rotate({ x: 1, y: 0, z: 0 }, -Math.PI * 1 / 6)
		.rotate({ x: 0, y: 1, z: 0 }, state.move * 7);

	// Draw scene
	const lightRenderer = renderers.lights[bitfield.index(getOptions(state.tweak))];
	const lightScene = {
		ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
		directionalLights: [{
			color: { x: 0.8, y: 0.8, z: 0.8 },
			direction: { x: shadowViewMatrix.getValue(2), y: shadowViewMatrix.getValue(6), z: shadowViewMatrix.getValue(10) }, // FIXME: remove shadowViewMatrix and define this instead
			shadow: true
		}],
		subjects: [{
			matrix: matrix.Matrix4
				.createIdentity()
				.rotate({ x: 0, y: 1, z: 0 }, state.move * 5),
			model: models.cube
		}, {
			matrix: matrix.Matrix4
				.createIdentity()
				.translate({ x: 0, y: -1.5, z: 0 }),
			model: models.ground
		}]
	}

	target.clear();

	lightRenderer.render(target, lightScene, {
		projectionMatrix: state.projectionMatrix,
		shadowViewMatrix: shadowViewMatrix, // FIXME: remove
		viewMatrix: cameraViewMatrix
	});

	// Draw texture debug
	if (state.tweak.showDebug) {
		const debugRenderer = renderers.debug;
		const debugScene = {
			subjects: [{
				matrix: matrix.Matrix4.createIdentity().translate({ x: 3, y: -2, z: -8 }),
				model: models.debug
			}]
		};

		debugRenderer.render(target, debugScene, {
			format: debugTexture.Format.Monochrome,
			projectionMatrix: state.projectionMatrix,
			select: debugTexture.Select.Red,
			source: lightRenderer.shadowBuffers[0],
			viewMatrix: matrix.Matrix4.createIdentity()
		});
	}
};

const update = (state: SceneState, dt: number) => {
	// Update animation state
	if (state.tweak.animate)
		state.move += dt * 0.00003;

	// Move camera
	state.camera.move(state.input);
};

const scenario = {
	configuration: configuration,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
