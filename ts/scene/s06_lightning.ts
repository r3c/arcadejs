import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as model from "../engine/model";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
** - Shader supports tangent space transform for normal and height mapping
** - Scene uses two different shaders loaded from external files
*/

interface Configuration {
	animate: boolean,
	nbLights: string[],
	useAmbient: boolean,
	useDiffuse: boolean,
	useSpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface CallState {
	lightPositions: math.Vector3[],
	projectionMatrix: math.Matrix,
	tweak: application.Tweak<Configuration>,
	viewMatrix: math.Matrix
}

interface SceneState {
	bulbs: math.Vector3[],
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	gl: WebGLRenderingContext,
	input: controller.Input,
	models: {
		bulb: webgl.Mesh[],
		cube: webgl.Mesh[],
		ground: webgl.Mesh[]
	},
	move: number,
	projectionMatrix: math.Matrix,
	shaders: {
		basic: webgl.Shader<CallState>,
		light: webgl.Shader<CallState>
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	animate: true,
	nbLights: ["0", ".1", "2", "3"],
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

	basicShader.bindPerMeshAttribute("points", 3, gl.FLOAT, state => state.mesh.points);

	basicShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.model.matrix.getValues());
	basicShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	basicShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	const lightShader = new webgl.Shader<CallState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/forward-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/forward-fragment.glsl")
	);

	lightShader.bindPerMeshAttribute("coords", 2, gl.FLOAT, state => state.mesh.coords);
	lightShader.bindPerMeshAttribute("normals", 3, gl.FLOAT, state => state.mesh.normals);
	lightShader.bindPerMeshAttribute("points", 3, gl.FLOAT, state => state.mesh.points);
	lightShader.bindPerMeshAttribute("tangents", 3, gl.FLOAT, state => state.mesh.tangents);

	lightShader.bindPerCallProperty("useAmbient", gl => gl.uniform1i, state => state.tweak.useAmbient);
	lightShader.bindPerCallProperty("useDiffuse", gl => gl.uniform1i, state => state.tweak.useDiffuse);
	lightShader.bindPerCallProperty("useHeightMap", gl => gl.uniform1i, state => state.tweak.useHeightMap);
	lightShader.bindPerCallProperty("useNormalMap", gl => gl.uniform1i, state => state.tweak.useNormalMap);
	lightShader.bindPerCallProperty("useSpecular", gl => gl.uniform1i, state => state.tweak.useSpecular);

	lightShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.model.matrix.getValues());
	lightShader.bindPerModelMatrix("normalMatrix", gl => gl.uniformMatrix3fv, state => state.call.viewMatrix.compose(state.model.matrix).getTransposedInverse3x3());
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
	const bulbModel = await model.fromOBJ("./res/model/sphere.obj", { scale: { xx: 0.2, yy: 0.2, zz: 0.2 } });
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
		projectionMatrix: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shaders: {
			basic: basicShader,
			light: lightShader
		},
		target: webgl.Target.createScreen(gl, runtime.screen.getWidth(), runtime.screen.getHeight()),
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const models = state.models;
	const shaders = state.shaders;
	const target = state.target;

	const cameraView = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Draw scene
	const bulbs = state.bulbs.slice(0, state.tweak.nbLights).map(bulb => ({
		matrix: math.Matrix.createIdentity().translate(bulb),
		meshes: models.bulb
	}));

	const cube = {
		matrix: math.Matrix.createIdentity(),
		meshes: models.cube
	};

	const ground = {
		matrix: math.Matrix.createIdentity().translate({x: 0, y: -1.5, z: 0}),
		meshes: models.ground
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

		state.bulbs[i] = math.Vector.scale3({
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
