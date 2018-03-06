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
	depthBuffer: WebGLTexture,
	light: Light,
	normalAndSpecularBuffer: WebGLTexture,
	projectionMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4,
	viewportSize: vector.Vector2
}

interface MaterialCallState {
	lightBuffer: WebGLTexture,
	projectionMatrix: matrix.Matrix4,
	tweak: application.Tweak<Configuration>,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	buffers: {
		depth: WebGLTexture,
		light: WebGLTexture,
		normalAndSpecular: WebGLTexture
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
		light: webgl.Shader<LightCallState>,
		material: webgl.Shader<MaterialCallState>
	},
	targets: {
		geometry: webgl.Target,
		light: webgl.Target,
		screen: webgl.Target
	},
	tweak: application.Tweak<Configuration>
}

const configuration = {
	nbLights: [".5", "10", "25", "100"],
	animate: true,
	applyDiffuse: true,
	applySpecular: true,
	debugMode: [".None", "Depth", "Normal", "Shininess", "Specular", "Diffuse light", "Specular light"]
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	// Setup render targets
	const geometry = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());
	const light = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());
	const screen = new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight());

	light.setClearColor(1, 1, 1, 1);

	const depthBuffer = geometry.setupDepthTexture(webgl.Storage.Depth16);
	const lightBuffer = light.setupColorTexture(webgl.Storage.RGBA8, 0);
	const normalAndSpecularBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 0);

	// Setup shaders
	const debugShader = new webgl.Shader<DebugCallState>(
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

	const geometryShader = new webgl.Shader<GeometryCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/deferred-lighting-geometry-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/deferred-lighting-geometry-fragment.glsl"),
		[{ name: "USE_HEIGHT_MAP", value: 1 }, { name: "USE_NORMAL_MAP", value: 1 }]
	);

	geometryShader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	geometryShader.bindAttributePerGeometry("normals", 3, gl.FLOAT, state => state.geometry.normals);
	geometryShader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);
	geometryShader.bindAttributePerGeometry("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	geometryShader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	geometryShader.bindMatrixPerModel("normalMatrix", gl => gl.uniformMatrix3fv, state => state.target.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	geometryShader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	geometryShader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	geometryShader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);
	geometryShader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);
	geometryShader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);
	geometryShader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);

	const lightShader = new webgl.Shader<LightCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/deferred-lighting-phong-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/deferred-lighting-phong-fragment.glsl")
	);

	lightShader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	lightShader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());

	lightShader.bindMatrixPerTarget("inverseProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getInverse().getValues());
	lightShader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	lightShader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());
	lightShader.bindPropertyPerTarget("applyDiffuse", gl => gl.uniform1i, state => state.tweak.applyDiffuse);
	lightShader.bindPropertyPerTarget("applySpecular", gl => gl.uniform1i, state => state.tweak.applySpecular);
	lightShader.bindPropertyPerTarget("lightColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.light.color));
	lightShader.bindPropertyPerTarget("lightPosition", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.light.position));
	lightShader.bindPropertyPerTarget("lightRadius", gl => gl.uniform1f, state => state.light.radius);
	lightShader.bindPropertyPerTarget("viewportSize", gl => gl.uniform2fv, state => vector.Vector2.toArray(state.viewportSize));
	lightShader.bindTexturePerTarget("depth", state => state.depthBuffer);
	lightShader.bindTexturePerTarget("normalAndSpecular", state => state.normalAndSpecularBuffer);

	const materialShader = new webgl.Shader<MaterialCallState>(
		gl,
		await io.readURL(io.StringFormat, "./glsl/deferred-lighting-material-vertex.glsl"),
		await io.readURL(io.StringFormat, "./glsl/deferred-lighting-material-fragment.glsl")
	);

	materialShader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	materialShader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	materialShader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	materialShader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	materialShader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());
	materialShader.bindTexturePerTarget("light", state => state.lightBuffer);

	materialShader.bindPropertyPerMaterial("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
	materialShader.bindTexturePerMaterial("diffuseMap", state => state.material.diffuseMap);
	materialShader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);
	materialShader.bindPropertyPerMaterial("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
	materialShader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);

	// Load models
	const cubeModel = await model.fromJSON("./obj/cube.json");
	const debugModel = await model.fromJSON("./obj/debug.json");
	const groundModel = await model.fromJSON("./obj/ground.json");
	const lightModel = await model.fromJSON("./obj/sphere.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.2, y: 0.2, z: 0.2 }) });
	const sphereModel = await model.fromJSON("./obj/sphere.json");

	// Create state
	return {
		buffers: {
			depth: depthBuffer,
			light: lightBuffer,
			normalAndSpecular: normalAndSpecularBuffer
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
			light: lightShader,
			material: materialShader
		},
		targets: {
			geometry: geometry,
			light: light,
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

	// Draw geometries
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

	targets.geometry.clear();
	targets.geometry.draw(shaders.geometry, [cubeSubject, groundSubject].concat(lightSubjects), {
		projectionMatrix: state.projectionMatrix,
		tweak: tweak,
		viewMatrix: cameraView
	});

	// Draw lights
	gl.cullFace(gl.FRONT);

	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);

	gl.enable(gl.BLEND);
	gl.blendFunc(gl.DST_COLOR, gl.ZERO);

	targets.light.clear();

	for (const light of lights) {
		const subject = {
			matrix: matrix.Matrix4.createIdentity()
				.translate(light.position)
				.scale({ x: light.radius, y: light.radius, z: light.radius }),
			model: models.sphere
		};

		targets.light.draw(shaders.light, [subject], {
			depthBuffer: buffers.depth,
			light: light,
			normalAndSpecularBuffer: buffers.normalAndSpecular,
			projectionMatrix: state.projectionMatrix,
			tweak: tweak,
			viewMatrix: cameraView,
			viewportSize: { x: state.screen.getWidth(), y: state.screen.getHeight() }
		});
	}

	// Draw materials
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.BACK);

	gl.disable(gl.BLEND);

	gl.enable(gl.DEPTH_TEST);
	gl.depthMask(true);

	targets.screen.clear();
	targets.screen.draw(shaders.material, [cubeSubject, groundSubject].concat(lightSubjects), {
		lightBuffer: state.buffers.light,
		projectionMatrix: state.projectionMatrix,
		tweak: tweak,
		viewMatrix: cameraView
	});

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
			format: [2, 3, 2, 2, 4, 4][tweak.debugMode - 1],
			projectionMatrix: state.projectionMatrix,
			select: [6, 3, 8, 9, 1, 9][tweak.debugMode - 1],
			texture: [
				buffers.depth,
				buffers.normalAndSpecular,
				buffers.normalAndSpecular,
				buffers.normalAndSpecular,
				buffers.light,
				buffers.light
			][tweak.debugMode - 1],
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
