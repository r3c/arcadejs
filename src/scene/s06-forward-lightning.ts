import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as functional from "../engine/language/functional";
import * as io from "../engine/io";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as move from "./shared/move";
import * as variant from "./shared/variant";
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
	applyAmbient: boolean,
	applyDiffuse: boolean,
	applySpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface Light {
	position: vector.Vector3
}

interface CallState {
	lightPositions: Light[],
	projectionMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	camera: view.Camera,
	gl: WebGLRenderingContext,
	input: controller.Input,
	lights: Light[],
	models: {
		cube: webgl.Model,
		ground: webgl.Model,
		light: webgl.Model
	},
	move: number,
	projectionMatrix: matrix.Matrix4,
	shaders: {
		basic: webgl.Shader<CallState>,
		lights: webgl.Shader<CallState>[]
	},
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: ["0", ".1", "2", "3"],
	animate: false,
	applyAmbient: true,
	applyDiffuse: false,
	applySpecular: false,
	useNormalMap: false,
	useHeightMap: false
};

const getOptions = (tweak: application.Tweak<Configuration>): { [name: string]: boolean } => {
	return {
		"USE_HEIGHT_MAP": tweak.useHeightMap !== 0,
		"USE_NORMAL_MAP": tweak.useNormalMap !== 0
	};
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Setup basic shader
	const basicShader = new webgl.Shader<CallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/basic-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/basic-fragment.glsl")
	);

	basicShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	basicShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	basicShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	basicShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	// Setup light shader variants
	const vsShader = await io.readURL(io.StringFormat, "./glsl/forward-lighting-phong-vertex.glsl");
	const fsShader = await io.readURL(io.StringFormat, "./glsl/forward-lighting-phong-fragment.glsl");

	const lightShaders = variant.enumerate(getOptions(tweak)).map(flags => {
		const shader = new webgl.Shader<CallState>(gl, vsShader, fsShader, flags);

		shader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
		shader.bindPerGeometryAttribute("normals", 3, gl.FLOAT, state => state.geometry.normals);
		shader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);
		shader.bindPerGeometryAttribute("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

		shader.bindPerCallProperty("applyAmbient", gl => gl.uniform1i, state => state.tweak.applyAmbient);
		shader.bindPerCallProperty("applyDiffuse", gl => gl.uniform1i, state => state.tweak.applyDiffuse);
		shader.bindPerCallProperty("applySpecular", gl => gl.uniform1i, state => state.tweak.applySpecular);

		shader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
		shader.bindPerModelMatrix("normalMatrix", gl => gl.uniformMatrix3fv, state => state.call.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
		shader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
		shader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

		shader.bindPerMaterialProperty("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
		shader.bindPerMaterialTexture("ambientMap", state => state.material.ambientMap);
		shader.bindPerMaterialProperty("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
		shader.bindPerMaterialTexture("diffuseMap", state => state.material.diffuseMap);

		if (flags.indexOf("USE_HEIGHT_MAP") !== -1)
			shader.bindPerMaterialTexture("heightMap", state => state.material.heightMap);

		if (flags.indexOf("USE_NORMAL_MAP") !== -1)
			shader.bindPerMaterialTexture("normalMap", state => state.material.normalMap);

		shader.bindPerMaterialProperty("shininess", gl => gl.uniform1f, state => state.material.shininess);
		shader.bindPerMaterialProperty("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
		shader.bindPerMaterialTexture("specularMap", state => state.material.specularMap);

		for (const index of [0, 1, 2]) {
			shader.bindPerCallProperty("light" + index + ".enabled", gl => gl.uniform1i, state => index < state.tweak.nbLights ? 1 : 0);
			shader.bindPerCallProperty("light" + index + ".position", gl => gl.uniform3fv, state => [state.lightPositions[index].position.x, state.lightPositions[index].position.y, state.lightPositions[index].position.z]);
		}

		return shader;
	});

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const groundModel = await model.fromJSON("./obj/ground.json");
	const lightModel = await model.fromJSON("./obj/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		gl: gl,
		input: runtime.input,
		lights: functional.range(50, i => ({ position: { x: 0, y: 0, z: 0 } })),
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
	const lights = state.lights.slice(0, state.tweak.nbLights).map(light => ({
		matrix: matrix.Matrix4.createIdentity().translate(light.position),
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
		lightPositions: state.lights,
		projectionMatrix: state.projectionMatrix,
		tweak: state.tweak,
		viewMatrix: cameraView
	};

	gl.enable(gl.CULL_FACE);
	gl.enable(gl.DEPTH_TEST);

	gl.cullFace(gl.BACK);

	target.clear();
	target.draw(shaders.basic, lights, callState);
	target.draw(shaders.lights[variant.index(getOptions(state.tweak))], [cube, ground], callState);
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0001;

	for (let i = 0; i < state.lights.length; ++i)
		state.lights[i].position = move.rotate(i, state.move, 2);

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
