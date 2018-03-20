import * as application from "../engine/application";
import * as color from "./shared/color";
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
	color: vector.Vector3,
	position: vector.Vector3,
	radius: number
}

interface DebugCallState {
	format: number,
	projectionMatrix: matrix.Matrix4,
	select: number,
	texture: WebGLTexture,
	viewMatrix: matrix.Matrix4
}

interface GeometryCallState {
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
	viewMatrix: matrix.Matrix4,
	viewportSize: vector.Vector2
}

interface SceneState {
	buffers: {
		albedoAndShininess: WebGLTexture,
		depth: WebGLTexture,
		normalAndReflection: WebGLTexture
	},
	camera: view.Camera,
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
	screen: display.Screen,
	shaders: {
		debug: webgl.Shader<DebugCallState>,
		geometry: webgl.Shader<GeometryCallState>,
		light: webgl.Shader<LightCallState>
	},
	targets: {
		geometry: webgl.Target,
		screen: webgl.Target
	},
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: [".5", "10", "25", "100"],
	animate: true,
	applyDiffuse: true,
	applySpecular: true,
	debugMode: [".None", "Albedo", "Depth", "Normal", "Shininess", "Specular"]
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Setup render targets
	const geometry = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());
	const screen = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());

	const albedoAndShininessBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 0);
	const depthBuffer = geometry.setupDepthTexture(webgl.Storage.Depth16);
	const normalAndReflectionBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 1);

	// Setup shaders
	const debugShader = new webgl.Shader<DebugCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/debug-texture-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/debug-texture-fragment.glsl")
	);

	debugShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	debugShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	debugShader.bindPerCallProperty("format", gl => gl.uniform1i, state => state.format);
	debugShader.bindPerCallProperty("select", gl => gl.uniform1i, state => state.select);
	debugShader.bindPerCallTexture("source", state => state.texture);

	debugShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	debugShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	debugShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	const geometryShader = new webgl.Shader<GeometryCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/deferred-shading-geometry-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/deferred-shading-geometry-fragment.glsl")
	);

	geometryShader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	geometryShader.bindPerGeometryAttribute("normals", 3, gl.FLOAT, state => state.geometry.normals);
	geometryShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);
	geometryShader.bindPerGeometryAttribute("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

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
	geometryShader.bindPerMaterialProperty("shininess", gl => gl.uniform1f, state => state.material.shininess);
	geometryShader.bindPerMaterialTexture("specularMap", state => state.material.specularMap);

	const lightShader = new webgl.Shader<LightCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/deferred-shading-phong-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/deferred-shading-phong-fragment.glsl")
	);

	lightShader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	lightShader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());

	lightShader.bindPerCallMatrix("inverseProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getInverse().getValues());
	lightShader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	lightShader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());
	lightShader.bindPerCallProperty("applyDiffuse", gl => gl.uniform1i, state => state.tweak.applyDiffuse);
	lightShader.bindPerCallProperty("applySpecular", gl => gl.uniform1i, state => state.tweak.applySpecular);
	lightShader.bindPerCallProperty("lightColor", gl => gl.uniform3fv, state => [state.light.color.x, state.light.color.y, state.light.color.z]);
	lightShader.bindPerCallProperty("lightPosition", gl => gl.uniform3fv, state => [state.light.position.x, state.light.position.y, state.light.position.z]);
	lightShader.bindPerCallProperty("lightRadius", gl => gl.uniform1f, state => state.light.radius);
	lightShader.bindPerCallProperty("viewportSize", gl => gl.uniform2fv, state => [state.viewportSize.x, state.viewportSize.y]);
	lightShader.bindPerCallTexture("albedoAndShininess", state => state.albedoAndShininess);
	lightShader.bindPerCallTexture("depth", state => state.depth);
	lightShader.bindPerCallTexture("normalAndReflection", state => state.normalAndReflection);

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const debugModel = await model.fromJSON("./obj/debug.json");
	const groundModel = await model.fromJSON("./obj/ground.json");
	const lightModel = await model.fromJSON("./obj/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });
	const sphereModel = await model.fromJSON("./obj/sphere.json");

	// Create state
	return {
		buffers: {
			albedoAndShininess: albedoAndShininessBuffer,
			depth: depthBuffer,
			normalAndReflection: normalAndReflectionBuffer
		},
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }),
		gl: gl,
		input: runtime.input,
		lights: functional.range(100, i => {
			return {
				color: color.createBright(i),
				position: { x: 0, y: 0, z: 0 },
				radius: 4
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
		screen: runtime.screen,
		shaders: {
			debug: debugShader,
			geometry: geometryShader,
			light: lightShader
		},
		targets: {
			geometry: geometry,
			screen: screen
		},
		tweak: tweak
	};
};

const render = (state: SceneState) => {
	const buffers = state.buffers;
	const camera = state.camera;
	const gl = state.gl;
	const models = state.models;
	const shaders = state.shaders;
	const targets = state.targets;
	const tweak = state.tweak;

	const cameraView = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	// Pick active lights
	const lights = state.lights.slice(0, [5, 10, 25, 100][tweak.nbLights] || 0);

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

	const callState = {
		projectionMatrix: state.projectionMatrix,
		tweak: tweak,
		viewMatrix: cameraView
	};

	targets.geometry.clear();
	targets.geometry.draw(shaders.geometry, [cubeSubject, groundSubject].concat(lightSubjects), callState);

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
			albedoAndShininess: buffers.albedoAndShininess,
			depth: buffers.depth,
			light: light,
			normalAndReflection: buffers.normalAndReflection,
			projectionMatrix: state.projectionMatrix,
			tweak: tweak,
			viewMatrix: cameraView,
			viewportSize: { x: state.screen.getWidth(), y: state.screen.getHeight() }
		});
	}

	// Draw debug
	if (tweak.debugMode !== 0) {
		const debugSubject = {
			matrix: matrix.Matrix4.createIdentity().translate({ x: 3, y: -2, z: -8 }),
			model: models.debug
		};

		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);

		targets.screen.draw(shaders.debug, [debugSubject], {
			format: [1, 2, 3, 2, 2][tweak.debugMode - 1],
			projectionMatrix: state.projectionMatrix,
			select: [1, 6, 3, 9, 9][tweak.debugMode - 1],
			texture: [
				buffers.albedoAndShininess,
				buffers.depth,
				buffers.normalAndReflection,
				buffers.albedoAndShininess,
				buffers.normalAndReflection][tweak.debugMode - 1],
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
