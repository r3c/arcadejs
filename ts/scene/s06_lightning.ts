import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as model from "../engine/model";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Simple directional (diffuse) lightning has been added to the scene
** - Scene uses two different shaders loaded from external files
*/

interface Configuration {
	moveLights: boolean,
	nbLights: string[],
	useAmbient: boolean,
	useDiffuse: boolean,
	useSpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface SceneState {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	input: controller.Input,
	light: ShaderState,
	models: {
		bulb: webgl.Mesh[],
		cube: webgl.Mesh[],
		ground: webgl.Mesh[]
	},
	move: number,
	shaders: {
		basic: webgl.Shader<ShaderState>,
		light: webgl.Shader<ShaderState>
	},
	target: webgl.Target
}

interface ShaderState {
	bulbs: math.Vector3[],
	tweak: application.Tweak<Configuration>
}

const configuration = {
	moveLights: true,
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

	const renderer = new webgl.Renderer(gl);

	// Setup shaders
	const basicShader = new webgl.Shader<ShaderState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/basic-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/basic-fragment.glsl")
	);

	basicShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);

	basicShader.bindMatrix("modelMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelMatrix);
	basicShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);
	basicShader.bindMatrix("viewMatrix", gl => gl.uniformMatrix4fv, transform => transform.viewMatrix);

	const lightShader = new webgl.Shader<ShaderState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/forward-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/forward-fragment.glsl")
	);

	lightShader.bindAttribute("coords", 2, gl.FLOAT, mesh => mesh.coords);
	lightShader.bindAttribute("normals", 3, gl.FLOAT, mesh => mesh.normals);
	lightShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);
	lightShader.bindAttribute("tangents", 3, gl.FLOAT, mesh => mesh.tangents);

	lightShader.bindGlobalProperty("useAmbient", gl => gl.uniform1i, state => state.tweak.useAmbient);
	lightShader.bindGlobalProperty("useDiffuse", gl => gl.uniform1i, state => state.tweak.useDiffuse);
	lightShader.bindGlobalProperty("useHeightMap", gl => gl.uniform1i, state => state.tweak.useHeightMap);
	lightShader.bindGlobalProperty("useNormalMap", gl => gl.uniform1i, state => state.tweak.useNormalMap);
	lightShader.bindGlobalProperty("useSpecular", gl => gl.uniform1i, state => state.tweak.useSpecular);

	lightShader.bindMatrix("modelMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelMatrix);
	lightShader.bindMatrix("normalMatrix", gl => gl.uniformMatrix3fv, transform => transform.normalMatrix);
	lightShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);
	lightShader.bindMatrix("viewMatrix", gl => gl.uniformMatrix4fv, transform => transform.viewMatrix);

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

	const bulbs = [0, 1, 2].map(i => ({ x: 0, y: 0, z: 0 }));

	for (const index of [0, 1, 2]) {
		lightShader.bindGlobalProperty("light" + index + ".enabled", gl => gl.uniform1i, state => index < state.tweak.nbLights ? 1 : 0);
		lightShader.bindGlobalProperty("light" + index + ".position", gl => gl.uniform3fv, state => [state.bulbs[index].x, state.bulbs[index].y, state.bulbs[index].z]);
	}

	// Load models
	const bulbModel = await model.fromOBJ("./res/model/sphere.obj", { scale: { xx: 0.2, yy: 0.2, zz: 0.2 } });
	const cubeModel = await model.fromJSON("./res/model/cube.json");
	const groundModel = await model.fromJSON("./res/model/ground.json");

	// Create state
	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		input: runtime.input,
		light: {
			bulbs: bulbs,
			tweak: tweak
		},
		models: {
			bulb: renderer.load(bulbModel),
			cube: renderer.load(cubeModel),
			ground: renderer.load(groundModel)
		},
		move: 0,
		shaders: {
			basic: basicShader,
			light: lightShader
		},
		target: webgl.Target.createScreen(gl, runtime.screen.getWidth(), runtime.screen.getHeight())
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const light = state.light;
	const models = state.models;
	const shaders = state.shaders;
	const target = state.target;

	const cameraView = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Draw scene
	const bulbs = light.bulbs.slice(0, light.tweak.nbLights).map(bulb => ({
		meshes: models.bulb,
		modelMatrix: math.Matrix.createIdentity().translate(bulb),
		shader: shaders.basic
	}));

	const cube = {
		meshes: models.cube,
		modelMatrix: math.Matrix.createIdentity(),
		shader: shaders.light
	};

	const ground = {
		meshes: models.ground,
		modelMatrix: math.Matrix.createIdentity().translate({x: 0, y: -1.5, z: 0}),
		shader: shaders.light
	};

	target.draw(bulbs.concat([cube, ground]), cameraView, light);
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
	const light = state.light;

	if (light.tweak.moveLights) {
		state.move += dt * 0.00003;
	}

	for (let i = 0; i < light.bulbs.length; ++i) {
		const pitch = state.move * (((i + 1) * 17) % 23);
		const yaw = state.move * (((i + 1) * 7) % 13);

		light.bulbs[i] = math.Vector.scale3({
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
