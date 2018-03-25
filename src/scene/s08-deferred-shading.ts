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
	nbDirectionals: string[],
	nbPoints: string[],
	animate: boolean,
	ambient: boolean,
	diffuse: boolean,
	specular: boolean,
	debugMode: string[]
}

interface SceneState {
	camera: view.Camera,
	directionalLights: webgl.DirectionalLight[],
	input: controller.Input,
	models: {
		cube: webgl.Model,
		debug: webgl.Model,
		directionalLight: webgl.Model,
		ground: webgl.Model,
		pointLight: webgl.Model
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
	nbDirectionals: [".0", "1", "2", "5"],
	nbPoints: ["0", ".50", "100", "250", "500"],
	animate: true,
	ambient: true,
	diffuse: true,
	specular: true,
	debugMode: [".None", "Depth", "Albedo", "Normal", "Shininess", "Gloss"]
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	tweak.ambient !== 0,
	tweak.diffuse !== 0,
	tweak.specular !== 0
];

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube/model.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.4, y: 0.4, z: 0.4 }) });
	const debugModel = await model.fromJSON("./obj/debug.json", { transform: matrix.Matrix4.createIdentity().scale({ x: gl.canvas.clientWidth / gl.canvas.clientHeight, y: 1, z: 1 }) });
	const directionalLightModel = await model.fromJSON("./obj/sphere/model.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.5, y: 0.5, z: 0.5 }) });
	const groundModel = await model.fromJSON("./obj/ground/model.json");
	const pointLightModel = await model.fromJSON("./obj/sphere/model.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.1, y: 0.1, z: 0.1 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
		directionalLights: functional.range(10, i => ({
			color: color.createBright(i),
			direction: vector.Vector3.zero,
			shadow: false
		})),
		input: runtime.input,
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			debug: webgl.loadModel(gl, debugModel),
			directionalLight: webgl.loadModel(gl, directionalLightModel),
			ground: webgl.loadModel(gl, groundModel),
			pointLight: webgl.loadModel(gl, pointLightModel)
		},
		move: 0,
		pointLights: functional.range(500, i => ({
			color: color.createBright(i),
			position: vector.Vector3.zero,
			radius: 2
		})),
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderers: {
			debug: new debugTexture.Renderer(gl, { zNear: 0.1, zFar: 100 }),
			scene: bitfield.enumerate(getOptions(tweak)).map(flags => new deferredShading.Renderer(gl, {
				lightModel: deferredShading.LightModel.Phong,
				lightModelPhongNoAmbient: !flags[0],
				lightModelPhongNoDiffuse: !flags[1],
				lightModelPhongNoSpecular: !flags[2],
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
	const directionalLights = state.directionalLights.slice(0, [0, 1, 2, 5][tweak.nbDirectionals] || 0);
	const pointLights = state.pointLights.slice(0, [0, 50, 100, 250, 500][tweak.nbPoints] || 0);

	// Draw scene
	const deferredRenderer = renderers.scene[bitfield.index(getOptions(tweak))];
	const deferredScene = {
		ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
		directionalLights: directionalLights,
		pointLights: pointLights,
		subjects: [{
			matrix: matrix.Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
			model: models.ground
		}].concat(functional.range(16, i => ({
			matrix: matrix.Matrix4.createIdentity().translate({ x: (i % 4 - 1.5) * 2, y: 0, z: (Math.floor(i / 4) - 1.5) * 2 }),
			model: models.cube
		}))).concat(directionalLights.map(light => ({
			matrix: matrix.Matrix4.createIdentity().translate(vector.Vector3.scale(vector.Vector3.normalize(light.direction), 10)),
			model: models.directionalLight
		}))).concat(pointLights.map(light => ({
			matrix: matrix.Matrix4.createIdentity().translate(light.position),
			model: models.pointLight
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
			{ source: deferredRenderer.depthBuffer, select: debugTexture.Select.Red, format: debugTexture.Format.Depth },
			{ source: deferredRenderer.albedoAndShininessBuffer, select: debugTexture.Select.RedGreenBlue, format: debugTexture.Format.Colorful },
			{ source: deferredRenderer.normalAndGlossBuffer, select: debugTexture.Select.RedGreen, format: debugTexture.Format.Spheremap },
			{ source: deferredRenderer.albedoAndShininessBuffer, select: debugTexture.Select.Alpha, format: debugTexture.Format.Monochrome },
			{ source: deferredRenderer.normalAndGlossBuffer, select: debugTexture.Select.Alpha, format: debugTexture.Format.Monochrome }
		];

		const debugRenderer = renderers.debug;
		const debugScene = {
			subjects: [{
				matrix: matrix.Matrix4.createIdentity().translate({ x: 2, y: -1.5, z: -6 }),
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

	for (let i = 0; i < state.directionalLights.length; ++i)
		state.directionalLights[i].direction = move.rotate(i, state.move * 5);

	for (let i = 0; i < state.pointLights.length; ++i)
		state.pointLights[i].position = move.orbitate(i, state.move, 6, 2);

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
