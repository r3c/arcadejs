import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
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
	applyAmbient: boolean,
	applyDiffuse: boolean,
	applySpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean,
	showDebug: boolean
}

interface DebugCallState {
	projectionMatrix: matrix.Matrix4,
	shadowMap: WebGLTexture,
	viewMatrix: matrix.Matrix4
}

interface LightCallState {
	direction: vector.Vector3,
	projectionMatrix: matrix.Matrix4,
	shadowMap: WebGLTexture,
	shadowProjectionMatrix: matrix.Matrix4,
	shadowViewMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4
}

interface ShadowCallState {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	camera: view.Camera,
	gl: WebGLRenderingContext,
	input: controller.Input,
	models: {
		cube: webgl.Model,
		debug: webgl.Model,
		ground: webgl.Model
	},
	move: number,
	screenProjectionMatrix: matrix.Matrix4,
	shaders: {
		debug: webgl.Shader<DebugCallState>,
		light: webgl.Shader<LightCallState>,
		shadow: webgl.Shader<ShadowCallState>,
	},
	shadowMap: WebGLTexture,
	shadowProjectionMatrix: matrix.Matrix4,
	targets: {
		buffer: webgl.Target,
		screen: webgl.Target
	},
	tweak: application.Tweak<Configuration>
}

const configuration = {
	animate: true,
	applyAmbient: true,
	applyDiffuse: false,
	applySpecular: false,
	useNormalMap: false,
	useHeightMap: false,
	showDebug: false
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	const buffer = new webgl.Target(gl, 1024, 1024);
	const screen = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());

	// Setup shaders
	const debugShader = new webgl.Shader<DebugCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/debug-texture-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/debug-texture-fragment.glsl")
	);

	debugShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	debugShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	debugShader.bindPerCallProperty("format", gl => gl.uniform1i, state => 2);
	debugShader.bindPerCallProperty("select", gl => gl.uniform1i, state => 6);
	debugShader.bindPerCallTexture("source", state => state.shadowMap);

	debugShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	debugShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	debugShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	const lightShader = new webgl.Shader<LightCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/forward-lighting-shadow-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/forward-lighting-shadow-fragment.glsl")
	);

	lightShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	lightShader.bindPerGeometryAttribute("normals", 3, gl.FLOAT, state => state.geometry.normals);
	lightShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);
	lightShader.bindPerGeometryAttribute("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	lightShader.bindPerCallProperty("lightDirection", gl => gl.uniform3fv, state => [state.direction.x, state.direction.y, state.direction.z]);
	lightShader.bindPerCallProperty("applyAmbient", gl => gl.uniform1i, state => state.tweak.applyAmbient);
	lightShader.bindPerCallProperty("applyDiffuse", gl => gl.uniform1i, state => state.tweak.applyDiffuse);
	lightShader.bindPerCallProperty("applySpecular", gl => gl.uniform1i, state => state.tweak.applySpecular);
	lightShader.bindPerCallProperty("useHeightMap", gl => gl.uniform1i, state => state.tweak.useHeightMap);
	lightShader.bindPerCallProperty("useNormalMap", gl => gl.uniform1i, state => state.tweak.useNormalMap);
	lightShader.bindPerCallTexture("shadowMap", state => state.shadowMap);

	lightShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	lightShader.bindPerModelMatrix("normalMatrix", gl => gl.uniformMatrix3fv, state => state.call.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	lightShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	lightShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());
	lightShader.bindPerCallMatrix("shadowProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.shadowProjectionMatrix.getValues());
	lightShader.bindPerCallMatrix("shadowViewMatrix", gl => gl.uniformMatrix4fv, state => state.shadowViewMatrix.getValues());

	lightShader.bindPerMaterialProperty("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
	lightShader.bindPerMaterialTexture("ambientMap", state => state.material.ambientMap);
	lightShader.bindPerMaterialProperty("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
	lightShader.bindPerMaterialTexture("diffuseMap", state => state.material.diffuseMap);
	lightShader.bindPerMaterialTexture("heightMap", state => state.material.heightMap);
	lightShader.bindPerMaterialTexture("normalMap", state => state.material.normalMap);
	lightShader.bindPerMaterialProperty("shininess", gl => gl.uniform1f, state => state.material.shininess);
	lightShader.bindPerMaterialProperty("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
	lightShader.bindPerMaterialTexture("specularMap", state => state.material.specularMap);

	const shadowShader = new webgl.Shader<ShadowCallState>(gl,
		await io.readURL(io.StringFormat, "./glsl/shadow-directional-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/shadow-directional-fragment.glsl"));

	shadowShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	shadowShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shadowShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shadowShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const debugModel = await model.fromJSON("./obj/debug.json");
	const groundModel = await model.fromJSON("./obj/ground.json");

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		gl: gl,
		input: runtime.input,
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			debug: webgl.loadModel(gl, debugModel),
			ground: webgl.loadModel(gl, groundModel)
		},
		move: 0,
		screenProjectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shaders: {
			debug: debugShader,
			light: lightShader,
			shadow: shadowShader
		},
		shadowMap: buffer.setupDepthTexture(webgl.Storage.Depth16),
		shadowProjectionMatrix: matrix.Matrix4.createOrthographic(-10, 10, -10, 10, -10, 20),
		targets: {
			buffer: buffer,
			screen: screen
		},
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const models = state.models;
	const shaders = state.shaders;
	const targets = state.targets;

	const cubeModelMatrix = matrix.Matrix4
		.createIdentity()
		.rotate({ x: 0, y: 1, z: 0 }, state.move * 5);

	const groundModelMatrix = matrix.Matrix4
		.createIdentity()
		.translate({ x: 0, y: -1.5, z: 0 });

	// Draw shadow map
	const shadowView = matrix.Matrix4
		.createIdentity()
		.translate({ x: 0, y: 0, z: -10 })
		.rotate({ x: 1, y: 0, z: 0 }, -Math.PI * 1 / 6)
		.rotate({ x: 0, y: 1, z: 0 }, state.move * 7);

	const shadowCube = {
		matrix: cubeModelMatrix,
		model: models.cube
	};

	const shadowGround = {
		matrix: groundModelMatrix,
		model: models.ground
	};

	gl.enable(gl.CULL_FACE);
	gl.enable(gl.DEPTH_TEST);

	gl.colorMask(false, false, false, false);
	gl.cullFace(gl.FRONT);

	targets.buffer.clear();
	targets.buffer.draw(shaders.shadow, [shadowCube, shadowGround], {
		projectionMatrix: state.shadowProjectionMatrix,
		viewMatrix: shadowView
	});

	gl.colorMask(true, true, true, true);
	gl.cullFace(gl.BACK);

	// Draw scene
	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const cube = {
		matrix: cubeModelMatrix,
		model: models.cube
	};

	const ground = {
		matrix: groundModelMatrix,
		model: models.ground
	};

	targets.screen.clear();
	targets.screen.draw(shaders.light, [cube, ground], {
		direction: { x: shadowView.getValue(2), y: shadowView.getValue(6), z: shadowView.getValue(10) },
		projectionMatrix: state.screenProjectionMatrix,
		shadowMap: state.shadowMap,
		shadowProjectionMatrix: state.shadowProjectionMatrix,
		shadowViewMatrix: shadowView,
		tweak: state.tweak,
		viewMatrix: cameraView
	});

	// Draw debug
	if (state.tweak.showDebug) {
		const debug = {
			matrix: matrix.Matrix4.createIdentity().translate({ x: 3, y: -2, z: -8 }),
			model: models.debug
		};

		gl.disable(gl.DEPTH_TEST);
		targets.screen.draw(shaders.debug, [debug], {
			projectionMatrix: state.screenProjectionMatrix,
			shadowMap: state.shadowMap,
			viewMatrix: matrix.Matrix4.createIdentity()
		});
		gl.enable(gl.DEPTH_TEST);
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
