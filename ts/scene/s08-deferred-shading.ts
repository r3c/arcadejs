import * as application from "../engine/application";
import * as controller from "../engine/controller";
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
	applyDiffuse: boolean,
	applySpecular: boolean,
	debugMode: string[]
}

interface Light {
	colorDiffuse: vector.Vector3,
	colorSpecular: vector.Vector3,
	position: vector.Vector3,
	radius: number
}

interface DebugCallState {
	format: number,
	projectionMatrix: matrix.Matrix4,
	source: number,
	texture: WebGLTexture,
	viewMatrix: matrix.Matrix4
}

interface GeometryCallState {
	pass: number,
	projectionMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4
}

interface LightCallState {
	albedoAndShininess: WebGLTexture,
	depth: WebGLTexture,
	light: Light,
	normalAndReflection: WebGLTexture,
	projectionMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	camera: view.Camera,
	geometry: {
		albedoAndShininess: WebGLTexture,
		depth: WebGLTexture,
		normalAndReflection: WebGLTexture
	},
	gl: WebGLRenderingContext,
	input: controller.Input,
	lights: Light[],
	models: {
		cube: webgl.Model,
		debug: webgl.Model,
		ground: webgl.Model,
		light: webgl.Model,
		sphere: webgl.Model
	},
	move: number,
	projectionMatrix: matrix.Matrix4,
	shaders: {
		debug: webgl.Shader<DebugCallState>,
		geometry: webgl.Shader<GeometryCallState>,
		light: webgl.Shader<LightCallState>
	},
	targets: {
		geometry1: webgl.Target,
		geometry2: webgl.Target,
		screen: webgl.Target
	},
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: [".5", "10", "25", "100"],
	animate: true,
	applyDiffuse: true,
	applySpecular: true,
	debugMode: [".None", "Albedo", "Shininess", "Normal", "Reflection", "Depth"]
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Setup render targets
	const geometry1 = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());
	const geometry2 = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());
	const screen = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());

	const albedoAndShininess = geometry1.setupColorTexture(0);
	const depth = geometry1.setupDepthTexture();
	const normalAndReflection = geometry2.setupColorTexture(0);

	geometry2.setupDepthRenderbuffer();

	// Setup shaders
	const debugShader = new webgl.Shader<DebugCallState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/debug-texture-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/debug-texture-fragment.glsl")
	);

	debugShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	debugShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	debugShader.bindPerCallProperty("format", gl => gl.uniform1i, state => state.format);
	debugShader.bindPerCallProperty("scope", gl => gl.uniform1i, state => state.source);
	debugShader.bindPerCallTexture("source", state => state.texture);

	debugShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	debugShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	debugShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	const geometryShader = new webgl.Shader<GeometryCallState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/deferred-geometry-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/deferred-geometry-fragment.glsl")
	);

	geometryShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	geometryShader.bindPerGeometryAttribute("normals", 3, gl.FLOAT, state => state.geometry.normals);
	geometryShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);
	geometryShader.bindPerGeometryAttribute("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	geometryShader.bindPerCallProperty("pass", gl => gl.uniform1i, state => state.pass);
	geometryShader.bindPerCallProperty("useHeightMap", gl => gl.uniform1i, state => 1);
	geometryShader.bindPerCallProperty("useNormalMap", gl => gl.uniform1i, state => 1);

	geometryShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	geometryShader.bindPerModelMatrix("normalMatrix", gl => gl.uniformMatrix3fv, state => state.call.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	geometryShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	geometryShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	geometryShader.bindPerMaterialProperty("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
	geometryShader.bindPerMaterialTexture("ambientMap", state => state.material.ambientMap);
	geometryShader.bindPerMaterialTexture("heightMap", state => state.material.heightMap);
	geometryShader.bindPerMaterialTexture("normalMap", state => state.material.normalMap);
	geometryShader.bindPerMaterialTexture("reflectionMap", state => state.material.reflectionMap);
	geometryShader.bindPerMaterialProperty("shininess", gl => gl.uniform1f, state => state.material.shininess);

	const lightShader = new webgl.Shader<LightCallState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/deferred-light-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/deferred-light-fragment.glsl")
	);

	lightShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	lightShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());

	lightShader.bindPerCallMatrix("inverseProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getInverse().getValues());
	lightShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	lightShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());
	lightShader.bindPerCallProperty("applyDiffuse", gl => gl.uniform1i, state => state.tweak.applyDiffuse);
	lightShader.bindPerCallProperty("applySpecular", gl => gl.uniform1i, state => state.tweak.applySpecular);
	lightShader.bindPerCallProperty("lightColorDiffuse", gl => gl.uniform3fv, state => [state.light.colorDiffuse.x, state.light.colorDiffuse.y, state.light.colorDiffuse.z]);
	lightShader.bindPerCallProperty("lightColorSpecular", gl => gl.uniform3fv, state => [state.light.colorSpecular.x, state.light.colorSpecular.y, state.light.colorSpecular.z]);
	lightShader.bindPerCallProperty("lightPosition", gl => gl.uniform3fv, state => [state.light.position.x, state.light.position.y, state.light.position.z]);
	lightShader.bindPerCallProperty("lightRadius", gl => gl.uniform1f, state => state.light.radius);
	lightShader.bindPerCallTexture("albedoAndShininess", state => state.albedoAndShininess);
	lightShader.bindPerCallTexture("depth", state => state.depth);
	lightShader.bindPerCallTexture("normalAndReflection", state => state.normalAndReflection);

	// Load models
	const lightRadius = 6;

	const cubeModel = await model.fromJSON("./res/model/cube.json");
	const debugModel = await model.fromJSON("./res/model/debug.json");
	const groundModel = await model.fromJSON("./res/model/ground.json");
	const lightModel = await model.fromJSON("./res/model/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });
	const sphereModel = await model.fromJSON("./res/model/sphere.json");

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		geometry: {
			albedoAndShininess: albedoAndShininess,
			depth: depth,
			normalAndReflection: normalAndReflection
		},
		gl: gl,
		input: runtime.input,
		lights: functional.range(100, i => {
			const u = ((i * 1.17) % 2 - 1) * 0.436;
			const v = ((i * 1.43) % 2 - 1) * 0.615;
			const color = { x: 1.0 + 1.13983 * v, y: 1.0 - 0.39465 * u - 0.5806 * v, z: 1.0 + 2.03211 * u };

			return {
				colorDiffuse: vector.Vector3.scale(color, 0.6),
				colorSpecular: vector.Vector3.scale(color, 1.0),
				position: { x: 0, y: 0, z: 0 },
				radius: lightRadius
			};
		}),
		models: {
			cube: webgl.loadModel(gl, cubeModel),
			debug: webgl.loadModel(gl, debugModel),
			ground: webgl.loadModel(gl, groundModel),
			light: webgl.loadModel(gl, lightModel),
			sphere: webgl.loadModel(gl, sphereModel)
		},
		move: 0,
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shaders: {
			debug: debugShader,
			geometry: geometryShader,
			light: lightShader
		},
		targets: {
			geometry1: geometry1,
			geometry2: geometry2,
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

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Pick active lights
	const lights = state.lights.slice(0, [5, 10, 25, 100][state.tweak.nbLights] || 0);

	// Draw scene geometries
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

	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.BACK);

	gl.disable(gl.BLEND);

	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);

	for (const pass of [{ number: 1, target: targets.geometry1 }, { number: 2, target: targets.geometry2 }]) {
		const callState = {
			pass: pass.number,
			projectionMatrix: state.projectionMatrix,
			tweak: state.tweak,
			viewMatrix: cameraView
		};

		pass.target.clear();
		pass.target.draw(shaders.geometry, [cubeSubject, groundSubject].concat(lightSubjects), callState);
	}

	// Draw scene lights
	gl.cullFace(gl.FRONT);

	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);

	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE);

	targets.screen.clear();

	for (const light of lights) {
		const subject = {
			matrix: matrix.Matrix4.createIdentity()
				.translate(light.position)
				.scale({ x: light.radius, y: light.radius, z: light.radius }),
			model: models.sphere
		};

		targets.screen.draw(shaders.light, [subject], {
			albedoAndShininess: state.geometry.albedoAndShininess,
			depth: state.geometry.depth,
			light: light,
			normalAndReflection: state.geometry.normalAndReflection,
			projectionMatrix: state.projectionMatrix,
			tweak: state.tweak,
			viewMatrix: cameraView
		});
	}

	// Draw debug
	if (state.tweak.debugMode !== 0) {
		const debugSubject = {
			matrix: matrix.Matrix4.createIdentity().translate({ x: 3, y: -2, z: -8 }),
			model: models.debug
		};

		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);

		targets.screen.draw(shaders.debug, [debugSubject], {
			format: [0, 0, 1, 0, 0][state.tweak.debugMode - 1],
			source: [1, 9, 3, 9, 6][state.tweak.debugMode - 1],
			projectionMatrix: state.projectionMatrix,
			texture: [state.geometry.albedoAndShininess, state.geometry.albedoAndShininess, state.geometry.normalAndReflection, state.geometry.normalAndReflection, state.geometry.depth][state.tweak.debugMode - 1],
			viewMatrix: matrix.Matrix4.createIdentity()
		});
	}
};

const update = (state: SceneState, dt: number) => {
	// Update light positions
	if (state.tweak.animate)
		state.move += dt * 0.0001;

	for (let i = 0; i < state.lights.length; ++i)
		state.lights[i].position = move.rotate(i, state.move, 4);

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
