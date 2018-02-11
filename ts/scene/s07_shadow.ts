import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as model from "../engine/model";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
*/

const shadowVsSource = `
	attribute vec4 points;

	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	uniform mat4 viewMatrix;

	void main(void) {
		gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
	}
`;

const shadowFsSource = `
	void main(void) {
		gl_FragColor = vec4(1, 1, 1, 1);
	}
`;

interface Configuration {
	animate: boolean,
	useAmbient: boolean,
	useDiffuse: boolean,
	useSpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean,
	showDebug: boolean
}

interface SceneState {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	gl: WebGLRenderingContext,
	input: controller.Input,
	light: ShaderState,
	models: {
		cube: webgl.Mesh[],
		debug: webgl.Mesh[],
		ground: webgl.Mesh[]
	},
	move: number,
	shaders: {
		debug: webgl.Shader<ShaderState>,
		light: webgl.Shader<ShaderState>,
		shadow: webgl.Shader<void>,
	},
	targets: {
		buffer: webgl.BufferTarget,
		screen: webgl.ScreenTarget
	}
}

interface ShaderState {
	direction: math.Vector3,
	shadowMap: WebGLTexture,
	shadowProjectionMatrix: math.Matrix,
	shadowViewMatrix: math.Matrix,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	animate: true,
	useAmbient: true,
	useDiffuse: false,
	useSpecular: false,
	useNormalMap: false,
	useHeightMap: false,
	showDebug: false
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	const renderer = new webgl.Renderer(gl);

	const buffer = webgl.Target.createBuffer(gl, 1024, 1024);
	const screen = webgl.Target.createScreen(gl, runtime.screen.getWidth(), runtime.screen.getHeight());

	// Setup shaders
	const debugShader = new webgl.Shader<ShaderState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/debug-depth-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/debug-depth-fragment.glsl")
	);

	debugShader.bindAttribute("coords", 2, gl.FLOAT, mesh => mesh.coords);
	debugShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);

	debugShader.bindGlobalTexture("ambientMap", state => state.shadowMap);

	debugShader.bindMatrix("modelMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelMatrix);
	debugShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);
	debugShader.bindMatrix("viewMatrix", gl => gl.uniformMatrix4fv, transform => transform.viewMatrix);

	const lightShader = new webgl.Shader<ShaderState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/shadow-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/shadow-fragment.glsl")
	);

	lightShader.bindAttribute("coords", 2, gl.FLOAT, mesh => mesh.coords);
	lightShader.bindAttribute("normals", 3, gl.FLOAT, mesh => mesh.normals);
	lightShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);
	lightShader.bindAttribute("tangents", 3, gl.FLOAT, mesh => mesh.tangents);

	lightShader.bindGlobalProperty("lightDirection", gl => gl.uniform3fv, state => [state.direction.x, state.direction.y, state.direction.z]);
	lightShader.bindGlobalProperty("useAmbient", gl => gl.uniform1i, state => state.tweak.useAmbient);
	lightShader.bindGlobalProperty("useDiffuse", gl => gl.uniform1i, state => state.tweak.useDiffuse);
	lightShader.bindGlobalProperty("useHeightMap", gl => gl.uniform1i, state => state.tweak.useHeightMap);
	lightShader.bindGlobalProperty("useNormalMap", gl => gl.uniform1i, state => state.tweak.useNormalMap);
	lightShader.bindGlobalProperty("useSpecular", gl => gl.uniform1i, state => state.tweak.useSpecular);
	lightShader.bindGlobalTexture("shadowMap", state => state.shadowMap);

	lightShader.bindMatrix("modelMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelMatrix);
	lightShader.bindMatrix("normalMatrix", gl => gl.uniformMatrix3fv, transform => transform.normalMatrix);
	lightShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);
	lightShader.bindMatrix("viewMatrix", gl => gl.uniformMatrix4fv, transform => transform.viewMatrix);

	lightShader.bindGlobalMatrix("shadowProjectionMatrix", gl => gl.uniformMatrix4fv, state => new Float32Array(state.shadowProjectionMatrix.getValues()));
	lightShader.bindGlobalMatrix("shadowViewMatrix", gl => gl.uniformMatrix4fv, state => new Float32Array(state.shadowViewMatrix.getValues()));

	lightShader.bindMaterialProperty("ambientColor", gl => gl.uniform4fv, material => material.ambientColor);
	lightShader.bindMaterialTexture("ambientMap", material => material.ambientMap);
	lightShader.bindMaterialProperty("diffuseColor", gl => gl.uniform4fv, material => material.diffuseColor);
	lightShader.bindMaterialTexture("diffuseMap", material => material.diffuseMap);
	lightShader.bindMaterialTexture("heightMap", material => material.heightMap);
	lightShader.bindMaterialTexture("normalMap", material => material.normalMap);
	lightShader.bindMaterialTexture("reflectionMap", material => material.reflectionMap);
	lightShader.bindMaterialProperty("shininess", gl => gl.uniform1f, material => material.shininess);
	lightShader.bindMaterialProperty("specularColor", gl => gl.uniform4fv, material => material.specularColor);
	lightShader.bindMaterialTexture("specularMap", material => material.specularMap);

	const shadowShader = new webgl.Shader<void>(gl, shadowVsSource, shadowFsSource);

	shadowShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);

	shadowShader.bindMatrix("modelMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelMatrix);
	shadowShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);
	shadowShader.bindMatrix("viewMatrix", gl => gl.uniformMatrix4fv, transform => transform.viewMatrix);

	// Load models
	const cubeModel = await model.fromJSON("./res/model/cube.json");
	const debugModel = await model.fromJSON("./res/model/debug.json");
	const groundModel = await model.fromJSON("./res/model/ground.json");

	// Create state
	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		gl: gl,
		input: runtime.input,
		light: {
			direction: { x: 0, y: 0, z: 0 },
			shadowMap: buffer.getDepth(),
			shadowProjectionMatrix: math.Matrix.createIdentity(),
			shadowViewMatrix: math.Matrix.createIdentity(),
			tweak: tweak
		},
		models: {
			cube: renderer.load(cubeModel),
			debug: renderer.load(debugModel),
			ground: renderer.load(groundModel)
		},
		move: 0,
		shaders: {
			debug: debugShader,
			light: lightShader,
			shadow: shadowShader
		},
		targets: {
			buffer: buffer,
			screen: screen
		}
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const light = state.light;
	const models = state.models;
	const shaders = state.shaders;
	const targets = state.targets;

	const cubeModelMatrix = math.Matrix
		.createIdentity()
		.rotate({ x: 0, y: 1, z: 0 }, state.move * 5);

	const groundModelMatrix = math.Matrix
		.createIdentity()
		.translate({ x: 0, y: -1.5, z: 0 });

	// Draw shadow map
	const shadowView = math.Matrix
		.createIdentity()
		.translate({ x: 0, y: 0, z: -10 })
		.rotate({ x: 1, y: 0, z: 0 }, -Math.PI * 1 / 6)
		.rotate({ x: 0, y: 1, z: 0 }, state.move * 7);

	const shadowCube = {
		meshes: models.cube,
		modelMatrix: cubeModelMatrix,
		shader: shaders.shadow
	};

	const shadowGround = {
		meshes: models.ground,
		modelMatrix: groundModelMatrix,
		shader: shaders.shadow
	};

	gl.colorMask(false, false, false, false);
	gl.cullFace(gl.FRONT);
	targets.buffer.clear();
	targets.buffer.draw([shadowCube, shadowGround], shadowView, undefined);
	gl.colorMask(true, true, true, true);
	gl.cullFace(gl.BACK);

	// Draw scene
	light.direction = { x: shadowView.getValue(2), y: shadowView.getValue(6), z: shadowView.getValue(10) };
	light.shadowProjectionMatrix = targets.buffer.projection; // FIXME: hack, should be private
	light.shadowViewMatrix = shadowView;

	const cameraView = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const cube = {
		meshes: models.cube,
		modelMatrix: cubeModelMatrix,
		shader: shaders.light
	};

	const ground = {
		meshes: models.ground,
		modelMatrix: groundModelMatrix,
		shader: shaders.light
	};

	targets.screen.clear();
	targets.screen.draw([cube, ground], cameraView, light);

	// Draw debug
	if (light.tweak.showDebug) {
		const debug = {
			meshes: models.debug,
			modelMatrix: math.Matrix.createIdentity().translate({ x: 3, y: -2, z: -8 }),
			shader: shaders.debug
		};

		gl.disable(gl.DEPTH_TEST);
		targets.screen.draw([debug], math.Matrix.createIdentity(), light);
		gl.enable(gl.DEPTH_TEST);
	}
};

const update = (state: SceneState, dt: number) => {
	// Move camera
	const camera = state.camera;
	const input = state.input;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	if (input.isPressed("mouseleft")) {
		camera.position.x += movement.x / 64;
		camera.position.y -= movement.y / 64;
	}

	if (input.isPressed("mouseright")) {
		camera.rotation.x -= movement.y / 64;
		camera.rotation.y -= movement.x / 64;
	}

	camera.position.z += wheel;

	// Update animation state
	if (state.light.tweak.animate) {
		state.move += dt * 0.00003;
	}
};

const scenario = {
	configuration: configuration,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
