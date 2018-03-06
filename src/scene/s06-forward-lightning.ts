import * as application from "../engine/application";
import * as basicTechnique from "../engine/render/shaders/basic";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as forwardTechnique from "../engine/render/shaders/forward";
import * as functional from "../engine/language/functional";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as move from "./shared/move";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
** - Shader supports tangent space transform for normal and height mapping
** - Scene uses two different shaders loaded from external files
*/

interface Configuration {
	nbLights: string[],
	animate: boolean,
	lightingMode: string[],
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface SceneState {
	camera: view.Camera,
	gl: WebGLRenderingContext,
	input: controller.Input,
	lightPositions: vector.Vector3[],
	models: {
		cube: webgl.Model,
		ground: webgl.Model,
		light: webgl.Model
	},
	move: number,
	projectionMatrix: matrix.Matrix4,
	shaders: {
		basic: webgl.Shader<basicTechnique.State>,
		lights: webgl.Shader<forwardTechnique.State>[]
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: ["0", ".1", "2", "3"],
	animate: false,
	lightingMode: ["None", ".Ambient", "Lambert", "Phong"],
	useNormalMap: false,
	useHeightMap: false
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	(tweak.lightingMode & 1) !== 0,
	(tweak.lightingMode & 2) !== 0,
	tweak.useHeightMap !== 0,
	tweak.useNormalMap !== 0
];

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Setup basic shader
	const basicShader = basicTechnique.load(gl);

	// Setup light shader variants
	const lightShaders = bitfield.enumerate(getOptions(tweak)).map(flags => forwardTechnique.load(gl, {
		lightingMode: (flags[0] ? 1 : 0) + (flags[1] ? 2 : 0),
		pointLightCount: 3,
		useHeightMap: flags[2],
		useNormalMap: flags[3]
	}));

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const groundModel = await model.fromJSON("./obj/ground.json");
	const lightModel = await model.fromJSON("./obj/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		gl: gl,
		input: runtime.input,
		lightPositions: functional.range(3, i => ({ x: 0, y: 0, z: 0 })),
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			ground: webgl.loadModel(gl, groundModel),
			light: webgl.loadModel(gl, lightModel)
		},
		move: 0,
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shaders: {
			basic: basicShader,
			lights: lightShaders
		},
		target: new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight()),
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const models = state.models;
	const shaders = state.shaders;
	const target = state.target;

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Draw scene
	const lights = state.lightPositions.slice(0, state.tweak.nbLights).map(position => ({
		matrix: matrix.Matrix4.createIdentity().translate(position),
		model: models.light
	}));

	const cube = {
		matrix: matrix.Matrix4.createIdentity(),
		model: models.cube
	};

	const ground = {
		matrix: matrix.Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
		model: models.ground
	};

	const callState = {
		pointLights: state.lightPositions.map((position, index) => ({
			diffuseColor: vector.Vector3.scale({ x: 1, y: 1, z: 1 }, index < state.tweak.nbLights ? 0.6 : 0),
			position: position,
			specularColor: vector.Vector3.scale({ x: 1, y: 1, z: 1 }, index < state.tweak.nbLights ? 0.6 : 0)
		})),
		projectionMatrix: state.projectionMatrix,
		tweak: state.tweak,
		viewMatrix: cameraView
	};

	gl.enable(gl.CULL_FACE);
	gl.enable(gl.DEPTH_TEST);

	gl.cullFace(gl.BACK);

	target.clear();
	target.draw(shaders.basic, lights, callState);
	target.draw(shaders.lights[bitfield.index(getOptions(state.tweak))], [cube, ground], callState);
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0001;

	for (let i = 0; i < state.lightPositions.length; ++i)
		state.lightPositions[i] = move.rotate(i, state.move, 2);

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
