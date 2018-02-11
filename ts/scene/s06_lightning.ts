import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/model";
import * as vector from "../engine/math/vector";
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
	useAmbient: boolean,
	useDiffuse: boolean,
	useSpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface CallState {
	lightPositions: vector.Vector3[],
	projectionMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	bulbs: vector.Vector3[],
	camera: {
		position: vector.Vector3,
		rotation: vector.Vector3
	},
	gl: WebGLRenderingContext,
	input: controller.Input,
	models: {
		bulb: webgl.Model,
		cube: webgl.Model,
		ground: webgl.Model
	},
	move: number,
	projectionMatrix: matrix.Matrix4,
	shaders: {
		basic: webgl.Shader<CallState>,
		light: webgl.Shader<CallState>
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: ["0", ".1", "2", "3"],
	animate: true,
	useAmbient: true,
	useDiffuse: false,
	useSpecular: false,
	useNormalMap: false,
	useHeightMap: false
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Setup shaders
	const basicShader = new webgl.Shader<CallState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/basic-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/basic-fragment.glsl")
	);

	basicShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	basicShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	basicShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	basicShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	const lightShader = new webgl.Shader<CallState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/forward-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/forward-fragment.glsl")
	);

	lightShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	lightShader.bindPerGeometryAttribute("normals", 3, gl.FLOAT, state => state.geometry.normals);
	lightShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);
	lightShader.bindPerGeometryAttribute("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	lightShader.bindPerCallProperty("useAmbient", gl => gl.uniform1i, state => state.tweak.useAmbient);
	lightShader.bindPerCallProperty("useDiffuse", gl => gl.uniform1i, state => state.tweak.useDiffuse);
	lightShader.bindPerCallProperty("useHeightMap", gl => gl.uniform1i, state => state.tweak.useHeightMap);
	lightShader.bindPerCallProperty("useNormalMap", gl => gl.uniform1i, state => state.tweak.useNormalMap);
	lightShader.bindPerCallProperty("useSpecular", gl => gl.uniform1i, state => state.tweak.useSpecular);

	lightShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	lightShader.bindPerModelMatrix("normalMatrix", gl => gl.uniformMatrix3fv, state => state.call.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	lightShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	lightShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	lightShader.bindPerMaterialProperty("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
	lightShader.bindPerMaterialTexture("ambientMap", state => state.material.ambientMap);
	lightShader.bindPerMaterialProperty("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
	lightShader.bindPerMaterialTexture("diffuseMap", state => state.material.diffuseMap);
	lightShader.bindPerMaterialTexture("heightMap", state => state.material.heightMap);
	lightShader.bindPerMaterialTexture("normalMap", state => state.material.normalMap);
	lightShader.bindPerMaterialTexture("reflectionMap", state => state.material.reflectionMap);
	lightShader.bindPerMaterialProperty("shininess", gl => gl.uniform1f, state => state.material.shininess);
	lightShader.bindPerMaterialProperty("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
	lightShader.bindPerMaterialTexture("specularMap", state => state.material.specularMap);

	const bulbs = [0, 1, 2].map(i => ({ x: 0, y: 0, z: 0 }));

	for (const index of [0, 1, 2]) {
		lightShader.bindPerCallProperty("light" + index + ".enabled", gl => gl.uniform1i, state => index < state.tweak.nbLights ? 1 : 0);
		lightShader.bindPerCallProperty("light" + index + ".position", gl => gl.uniform3fv, state => [state.lightPositions[index].x, state.lightPositions[index].y, state.lightPositions[index].z]);
	}

	// Load models
	const bulbModel = await model.fromOBJ("./res/model/sphere.obj", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });
	const cubeModel = await model.fromJSON("./res/model/cube.json");
	const groundModel = await model.fromJSON("./res/model/ground.json");

	// Create state
	return {
		bulbs: bulbs,
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		gl: gl,
		input: runtime.input,
		models: {
			bulb: webgl.loadModel(gl, bulbModel),
			cube: webgl.loadModel(gl, cubeModel),
			ground: webgl.loadModel(gl, groundModel)
		},
		move: 0,
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shaders: {
			basic: basicShader,
			light: lightShader
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
	const bulbs = state.bulbs.slice(0, state.tweak.nbLights).map(bulb => ({
		matrix: matrix.Matrix4.createIdentity().translate(bulb),
		model: models.bulb
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
		lightPositions: state.bulbs,
		projectionMatrix: state.projectionMatrix,
		tweak: state.tweak,
		viewMatrix: cameraView
	};

	gl.enable(gl.CULL_FACE);
	gl.enable(gl.DEPTH_TEST);

	gl.cullFace(gl.BACK);

	target.clear();
	target.draw(shaders.basic, bulbs, callState);
	target.draw(shaders.light, [cube, ground], callState);
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

	// Update light bulb positions
	if (state.tweak.animate) {
		state.move += dt * 0.00003;
	}

	for (let i = 0; i < state.bulbs.length; ++i) {
		const pitch = state.move * (((i + 1) * 17) % 23);
		const yaw = state.move * (((i + 1) * 7) % 13);

		state.bulbs[i] = vector.Vector3.scale({
			x: Math.cos(yaw) * Math.cos(pitch),
			y: Math.sin(yaw) * Math.cos(pitch),
			z: Math.sin(pitch)
		}, 2);
	}
};

const scenario = {
	configuration: configuration,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
