import * as application from "../engine/application";
import * as basicRenderer from "../engine/render/renderers/basic";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as forwardLighting from "../engine/render/renderers/forward-lighting";
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
	lightModel: string[],
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
	renderers: {
		basic: basicRenderer.Renderer,
		lights: forwardLighting.Renderer[]
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: ["0", ".1", "2", "3"],
	animate: false,
	lightModel: ["None", ".Ambient", "Lambert", "Phong"],
	useNormalMap: false,
	useHeightMap: false
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	(tweak.lightModel & 1) !== 0,
	(tweak.lightModel & 2) !== 0,
	tweak.useHeightMap !== 0,
	tweak.useNormalMap !== 0
];

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

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
		renderers: {
			basic: new basicRenderer.Renderer(gl),
			lights: bitfield.enumerate(getOptions(tweak)).map(flags => new forwardLighting.Renderer(gl, {
				lightModel: (flags[0] ? 1 : 0) + (flags[1] ? 2 : 0),
				pointLightCount: 3,
				useHeightMap: flags[2],
				useNormalMap: flags[3],
				useShadowMap: false
			}))
		},
		target: new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight()),
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const models = state.models;
	const renderers = state.renderers;
	const target = state.target;

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Draw scene
	const cube = {
		matrix: matrix.Matrix4.createIdentity(),
		model: models.cube
	};

	const ground = {
		matrix: matrix.Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
		model: models.ground
	};

	const lights = state.lightPositions.map(position => ({
		matrix: matrix.Matrix4.createIdentity().translate(position),
		model: models.light
	}));

	target.clear();

	// Basic pass
	const basicRenderer = renderers.basic;
	const basicScene = {
		subjects: lights.slice(0, state.tweak.nbLights)
	};

	renderers.basic.render(target, basicScene, {
		projectionMatrix: state.projectionMatrix,
		viewMatrix: cameraView
	});

	// Light pass
	const lightRenderer = renderers.lights[bitfield.index(getOptions(state.tweak))];
	const lightScene = {
		pointLights: state.lightPositions.map((position, index) => ({
			diffuseColor: vector.Vector3.scale({ x: 1, y: 1, z: 1 }, index < state.tweak.nbLights ? 0.6 : 0),
			position: position,
			radius: 0,
			specularColor: vector.Vector3.scale({ x: 1, y: 1, z: 1 }, index < state.tweak.nbLights ? 0.6 : 0)
		})),
		subjects: [cube, ground]
	};

	lightRenderer.render(target, lightScene, {
		projectionMatrix: state.projectionMatrix,
		shadowViewMatrix: matrix.Matrix4.createIdentity(),
		viewMatrix: cameraView
	});
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0005;

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
