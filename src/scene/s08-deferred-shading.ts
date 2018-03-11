import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as color from "./shared/color";
import * as controller from "../engine/controller";
import * as debugTexture from "../engine/render/renderers/debug-texture";
import * as deferredShading from "../engine/render/renderers/deferred-shading";
import * as display from "../engine/display";
import * as functional from "../engine/language/functional";
import * as io from "../engine/io";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as move from "./shared/move";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
*/

interface Configuration {
	nbLights: string[],
	animate: boolean,
	lightModel: string[],
	debugMode: string[]
}

interface SceneState {
	camera: view.Camera,
	input: controller.Input,
	models: {
		cube: webgl.Model,
		debug: webgl.Model,
		ground: webgl.Model,
		light: webgl.Model
	},
	move: number,
	pointLights: webgl.PointLight[],
	projectionMatrix: matrix.Matrix4,
	renderers: {
		debug: debugTexture.Renderer,
		scene: deferredShading.Renderer[]
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: [".5", "10", "25", "100"],
	animate: true,
	lightModel: ["None", "Ambient", "Lambert", ".Phong"],
	debugMode: [".None", "Albedo", "Depth", "Normal", "Shininess", "Specular"]
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	(tweak.lightModel & 1) !== 0,
	(tweak.lightModel & 2) !== 0
];

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const debugModel = await model.fromJSON("./obj/debug.json");
	const groundModel = await model.fromJSON("./obj/ground.json");
	const lightModel = await model.fromJSON("./obj/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		input: runtime.input,
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			debug: webgl.loadModel(gl, debugModel),
			ground: webgl.loadModel(gl, groundModel),
			light: webgl.loadModel(gl, lightModel)
		},
		move: 0,
		pointLights: functional.range(100, i => ({
			diffuseColor: color.createBright(i),
			position: { x: 0, y: 0, z: 0 },
			radius: 4,
			specularColor: color.createBright(i)
		})),
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderers: {
			debug: new debugTexture.Renderer(gl),
			scene: bitfield.enumerate(getOptions(tweak)).map(flags => new deferredShading.Renderer(gl, {
				lightModel: (flags[0] ? 1 : 0) + (flags[1] ? 2 : 0),
				useHeightMap: true,
				useNormalMap: true
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
	const target = state.target;
	const tweak = state.tweak;

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Pick active lights
	const lights = state.pointLights.slice(0, [5, 10, 25, 100][tweak.nbLights] || 0);

	// Draw scene
	const deferredRenderer = renderers.scene[bitfield.index(getOptions(tweak))];
	const deferredScene = {
		pointLights: lights,
		subjects: [{
			matrix: matrix.Matrix4.createIdentity(),
			model: models.cube
		}, {
			matrix: matrix.Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
			model: models.ground
		}].concat(lights.map(light => ({
			matrix: matrix.Matrix4.createIdentity().translate(light.position),
			model: models.light
		})))
	};

	target.clear();

	deferredRenderer.render(target, deferredScene, {
		projectionMatrix: state.projectionMatrix,
		viewMatrix: cameraView
	});

	// Draw debug
	if (tweak.debugMode !== 0) {
		const configurations = [
			{ source: deferredRenderer.albedoAndShininessBuffer, select: debugTexture.Select.RedGreenBlue, format: debugTexture.Format.Colorful },
			{ source: deferredRenderer.depthBuffer, select: debugTexture.Select.Red, format: debugTexture.Format.Monochrome },
			{ source: deferredRenderer.normalAndReflectionBuffer, select: debugTexture.Select.RedGreen, format: debugTexture.Format.Spheremap },
			{ source: deferredRenderer.albedoAndShininessBuffer, select: debugTexture.Select.Alpha, format: debugTexture.Format.Monochrome },
			{ source: deferredRenderer.normalAndReflectionBuffer, select: debugTexture.Select.Alpha, format: debugTexture.Format.Monochrome }
		];

		const debugRenderer = renderers.debug;
		const debugScene = {
			subjects: [{
				matrix: matrix.Matrix4.createIdentity().translate({ x: 3, y: -2, z: -8 }),
				model: models.debug
			}]
		};

		debugRenderer.render(target, debugScene, {
			format: configurations[tweak.debugMode - 1].format,
			projectionMatrix: state.projectionMatrix,
			select: configurations[tweak.debugMode - 1].select,
			source: configurations[tweak.debugMode - 1].source,
			viewMatrix: matrix.Matrix4.createIdentity()
		});
	}
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0002;

	for (let i = 0; i < state.pointLights.length; ++i)
		state.pointLights[i].position = move.rotate(i, state.move, 4);

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
