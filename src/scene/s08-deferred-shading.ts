import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as color from "./shared/color";
import * as controller from "../engine/controller";
import * as deferredShadingRenderer from "../engine/render/renderers/deferred-shading";
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

interface DebugState {
	format: number,
	projectionMatrix: matrix.Matrix4,
	select: number,
	texture: WebGLTexture,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	camera: view.Camera,
	gl: WebGLRenderingContext,
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
		debug: webgl.Shader<DebugState>,
		scene: deferredShadingRenderer.Renderer[]
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

	// Setup render targets
	const screen = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());

	// Setup shaders
	const debugShader = new webgl.Shader<DebugState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/debug-texture-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/debug-texture-fragment.glsl")
	);

	debugShader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	debugShader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	debugShader.bindPropertyPerTarget("format", gl => gl.uniform1i, state => state.format);
	debugShader.bindPropertyPerTarget("select", gl => gl.uniform1i, state => state.select);
	debugShader.bindTexturePerTarget("source", state => state.texture);

	debugShader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	debugShader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	debugShader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const debugModel = await model.fromJSON("./obj/debug.json");
	const groundModel = await model.fromJSON("./obj/ground.json");
	const lightModel = await model.fromJSON("./obj/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		gl: gl,
		input: runtime.input,
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			debug: webgl.loadModel(gl, debugModel),
			ground: webgl.loadModel(gl, groundModel),
			light: webgl.loadModel(gl, lightModel)
		},
		move: 0,
		pointLights: functional.range(100, i => {
			const lightColor = color.createBright(i);

			return {
				diffuseColor: lightColor,
				position: { x: 0, y: 0, z: 0 },
				radius: 4,
				specularColor: lightColor
			};
		}),
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderers: {
			debug: debugShader,
			scene: bitfield.enumerate(getOptions(tweak)).map(flags => new deferredShadingRenderer.Renderer(gl, {
				lightModel: (flags[0] ? 1 : 0) + (flags[1] ? 2 : 0),
				useHeightMap: true,
				useNormalMap: true
			}))
		},
		target: screen,
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const models = state.models;
	const renderers = state.renderers;
	const tweak = state.tweak;

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Draw scene
	const lights = state.pointLights.slice(0, [5, 10, 25, 100][tweak.nbLights] || 0);

	const lightSubjects = lights.map(light => ({
		matrix: matrix.Matrix4.createIdentity().translate(light.position),
		model: models.light
	}));

	const cubeSubject = {
		matrix: matrix.Matrix4.createIdentity(),
		model: models.cube
	};

	const groundSubject = {
		matrix: matrix.Matrix4.createIdentity().translate({ x: 0, y: -1.5, z: 0 }),
		model: models.ground
	};

	const deferredRenderer = state.renderers.scene[bitfield.index(getOptions(tweak))];

	const deferredScene = {
		pointLights: lights,
		subjects: [cubeSubject, groundSubject].concat(lightSubjects)
	};

	deferredRenderer.render(state.target, deferredScene, state.projectionMatrix, cameraView);

	// Draw debug
	if (tweak.debugMode !== 0) {
		const debugSubject = {
			matrix: matrix.Matrix4.createIdentity().translate({ x: 3, y: -2, z: -8 }),
			model: models.debug
		};

		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);

		state.target.draw(renderers.debug, [debugSubject], {
			format: [1, 2, 3, 2, 2][tweak.debugMode - 1],
			projectionMatrix: state.projectionMatrix,
			select: [1, 6, 3, 9, 9][tweak.debugMode - 1],
			texture: [
				deferredRenderer.albedoAndShininessBuffer,
				deferredRenderer.depthBuffer,
				deferredRenderer.normalAndReflectionBuffer,
				deferredRenderer.albedoAndShininessBuffer,
				deferredRenderer.normalAndReflectionBuffer][tweak.debugMode - 1],
			viewMatrix: matrix.Matrix4.createIdentity()
		});
	}
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0001;

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
