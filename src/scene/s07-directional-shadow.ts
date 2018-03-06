import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
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
		lights: webgl.Shader<LightCallState>[],
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

const getOptions = (tweak: application.Tweak<Configuration>) => [tweak.useHeightMap !== 0, tweak.useNormalMap !== 0];

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

	debugShader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	debugShader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	debugShader.bindPropertyPerTarget("format", gl => gl.uniform1i, state => 2);
	debugShader.bindPropertyPerTarget("select", gl => gl.uniform1i, state => 6);
	debugShader.bindTexturePerTarget("source", state => state.shadowMap);

	debugShader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	debugShader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	debugShader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	const vsShader = await io.readURL(io.StringFormat, "./glsl/forward-lighting-shadow-vertex.glsl");
	const fsShader = await io.readURL(io.StringFormat, "./glsl/forward-lighting-shadow-fragment.glsl");

	const lightShaders = bitfield.enumerate(getOptions(tweak)).map(flags => {
		const shader = new webgl.Shader<LightCallState>(gl, vsShader, fsShader, [
			{ name: "USE_HEIGHT_MAP", value: flags[0] ? 1 : 0 },
			{ name: "USE_NORMAL_MAP", value: flags[1] ? 1 : 0 }
		]);

		shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
		shader.bindAttributePerGeometry("normals", 3, gl.FLOAT, state => state.geometry.normals);
		shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);
		shader.bindAttributePerGeometry("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

		shader.bindPropertyPerTarget("lightDirection", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.direction));
		shader.bindPropertyPerTarget("applyAmbient", gl => gl.uniform1i, state => state.tweak.applyAmbient);
		shader.bindPropertyPerTarget("applyDiffuse", gl => gl.uniform1i, state => state.tweak.applyDiffuse);
		shader.bindPropertyPerTarget("applySpecular", gl => gl.uniform1i, state => state.tweak.applySpecular);
		shader.bindTexturePerTarget("shadowMap", state => state.shadowMap);

		shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
		shader.bindMatrixPerModel("normalMatrix", gl => gl.uniformMatrix3fv, state => state.target.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
		shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
		shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());
		shader.bindMatrixPerTarget("shadowProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.shadowProjectionMatrix.getValues());
		shader.bindMatrixPerTarget("shadowViewMatrix", gl => gl.uniformMatrix4fv, state => state.shadowViewMatrix.getValues());

		shader.bindPropertyPerMaterial("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
		shader.bindTexturePerMaterial("ambientMap", state => state.material.ambientMap);
		shader.bindPropertyPerMaterial("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
		shader.bindTexturePerMaterial("diffuseMap", state => state.material.diffuseMap);

		if (flags[0])
			shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);

		if (flags[1])
			shader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);

		shader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);
		shader.bindPropertyPerMaterial("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
		shader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);

		return shader;
	});

	const shadowShader = new webgl.Shader<ShadowCallState>(gl,
		await io.readURL(io.StringFormat, "./glsl/shadow-directional-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/shadow-directional-fragment.glsl"));

	shadowShader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shadowShader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shadowShader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shadowShader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

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
			lights: lightShaders,
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
	targets.screen.draw(shaders.lights[bitfield.index(getOptions(state.tweak))], [cube, ground], {
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
