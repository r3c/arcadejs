import * as application from "../engine/application";
import * as basic from "../engine/graphic/pipelines/basic";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/io/controller";
import * as display from "../engine/display";
import * as forwardLighting from "../engine/graphic/pipelines/forward-lighting";
import * as functional from "../engine/language/functional";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as move from "./shared/move";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/graphic/webgl";

/*
** What changed?
** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
** - Shader supports tangent space transform for normal and height mapping
** - Scene uses two different shaders loaded from external files
*/

interface Configuration {
	nbLights: string[],
	animate: boolean,
	enableAmbient: boolean,
	enableDiffuse: boolean,
	enableSpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface SceneState {
	camera: view.Camera,
	input: controller.Input,
	lightPositions: vector.Vector3[],
	models: {
		cube: webgl.Model,
		ground: webgl.Model,
		light: webgl.Model
	},
	move: number,
	pipelines: {
		basic: basic.Pipeline,
		lights: forwardLighting.Pipeline[]
	},
	projectionMatrix: matrix.Matrix4,
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: ["0", ".1", "2", "3"],
	animate: false,
	enableAmbient: true,
	enableDiffuse: false,
	enableSpecular: false,
	useNormalMap: false,
	useHeightMap: false
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	tweak.enableAmbient !== 0,
	tweak.enableDiffuse !== 0,
	tweak.enableSpecular !== 0,
	tweak.useHeightMap !== 0,
	tweak.useNormalMap !== 0
];

const prepare = () => application.runtime(display.WebGLScreen, configuration, async (screen, input, tweak) => {
	const gl = screen.context;

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube/model.json");
	const groundModel = await model.fromJSON("./obj/ground/model.json");
	const lightModel = await model.fromJSON("./obj/sphere/model.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
		input: input,
		lightPositions: functional.range(3, i => vector.Vector3.zero),
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			ground: webgl.loadModel(gl, groundModel),
			light: webgl.loadModel(gl, lightModel)
		},
		move: 0,
		pipelines: {
			basic: new basic.Pipeline(gl),
			lights: bitfield.enumerate(getOptions(tweak)).map(flags => new forwardLighting.Pipeline(gl, {
				lightModel: forwardLighting.LightModel.Phong,
				lightModelPhongNoAmbient: !flags[0],
				lightModelPhongNoDiffuse: !flags[1],
				lightModelPhongNoSpecular: !flags[2],
				maxPointLights: 3,
				useEmissiveMap: false,
				useGlossMap: true,
				useHeightMap: flags[3],
				useNormalMap: flags[4],
				useOcclusionMap: false,
				useShadowMap: false
			}))
		},
		projectionMatrix: matrix.Matrix4.createIdentity(),
		target: new webgl.Target(gl, screen.getWidth(), screen.getHeight()),
		tweak: tweak
	};
});

const render = (state: SceneState) => {
	const camera = state.camera;
	const models = state.models;
	const pipelines = state.pipelines;
	const target = state.target;

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Clear screen
	target.clear();

	// Basic pass: draw light bulbs
	const basicPipeline = pipelines.basic;
	const basicScene = {
		projectionMatrix: state.projectionMatrix,
		subjects: state.lightPositions.slice(0, state.tweak.nbLights).map(position => ({
			matrix: matrix.Matrix4.createIdentity().translate(position),
			model: models.light
		})),
		viewMatrix: cameraView
	};

	pipelines.basic.process(target, basicScene);

	// Light pass: draw subjects
	const lightPipeline = pipelines.lights[bitfield.index(getOptions(state.tweak))];
	const lightScene = {
		ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
		pointLights: state.lightPositions.map((position, index) => ({
			color: vector.Vector3.scale({ x: 1, y: 1, z: 1 }, index < state.tweak.nbLights ? 0.6 : 0),
			position: position,
			radius: 0
		})),
		projectionMatrix: state.projectionMatrix,
		subjects: [{
			matrix: matrix.Matrix4.createIdentity(),
			model: models.cube
		}, {
			matrix: matrix.Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
			model: models.ground
		}],
		viewMatrix: cameraView
	};

	lightPipeline.process(target, lightScene);
};

const resize = (state: SceneState, screen: display.WebGLScreen) => {
	for (const pipeline of state.pipelines.lights)
		pipeline.resize(screen.getWidth(), screen.getHeight());

	state.projectionMatrix = matrix.Matrix4.createPerspective(45, screen.getRatio(), 0.1, 100);
	state.pipelines.basic.resize(screen.getWidth(), screen.getHeight());
	state.target.resize(screen.getWidth(), screen.getHeight());
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0005;

	for (let i = 0; i < state.lightPositions.length; ++i)
		state.lightPositions[i] = move.orbitate(i, state.move, 2, 2);

	// Move camera
	state.camera.move(state.input);
};

const process = application.declare({
	prepare: prepare,
	render: render,
	resize: resize,
	update: update
});

export { process };
