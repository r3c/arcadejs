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

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	drawCube: {
		binding: webgl.Binding,
		meshes: webgl.Mesh[],
		shader: webgl.Shader
	},
	drawSpot: {
		binding: webgl.Binding,
		meshes: webgl.Mesh[],
		shader: webgl.Shader
	},
	input: controller.Input,
	light: {
		bulbs: {
			enabled: webgl.UniformValue<number>,
			positionUniform: webgl.UniformValue<number[]>,
			position: math.Vector3
		}[],
		move: number,
		useAmbient: webgl.UniformValue<number>,
		useDiffuse: webgl.UniformValue<number>,
		useHeightMap: webgl.UniformValue<number>,
		useNormalMap: webgl.UniformValue<number>,
		useSpecular: webgl.UniformValue<number>
	},
	projection: math.Matrix,
	renderer: webgl.Renderer,
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
	const renderer = new webgl.Renderer(runtime.screen.context);

	const cubeModel = await model.fromJSON("./res/model/cube.json");
	const cubeShader = new webgl.Shader(
		runtime.screen.context,
		await io.readURL(io.StringFormat, "./res/shader/forward-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/forward-fragment.glsl")
	);

	const spotModel = await model.fromOBJ("./res/model/sphere.obj", { scale: { xx: 0.2, yy: 0.2, zz: 0.2 } });
	const spotShader = new webgl.Shader(
		runtime.screen.context,
		await io.readURL(io.StringFormat, "./res/shader/basic-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/basic-fragment.glsl")
	);

	const bulbs = [0, 1, 2].map(i => ({
		enabled: cubeShader.declareValue("light" + i + ".enabled", gl => gl.uniform1i),
		positionUniform: cubeShader.declareValue("light" + i + ".position", gl => gl.uniform3fv),
		position: { x: 0, y: 0, z: 0 }
	}));

	const float = runtime.screen.context.FLOAT;

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		drawCube: {
			binding: {
				ambientColor: cubeShader.declareValue("ambientColor", gl => gl.uniform4fv),
				ambientMap: cubeShader.declareTexture("ambientMap"),
				coords: cubeShader.declareAttribute("coords", 2, float),
				diffuseColor: cubeShader.declareValue("diffuseColor", gl => gl.uniform4fv),
				diffuseMap: cubeShader.declareTexture("diffuseMap"),
				heightMap: cubeShader.declareTexture("heightMap"),
				modelViewMatrix: cubeShader.declareMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
				normalMap: cubeShader.declareTexture("normalMap"),
				normalMatrix: cubeShader.declareMatrix("normalMatrix", gl => gl.uniformMatrix3fv),
				normals: cubeShader.declareAttribute("normals", 3, float),
				points: cubeShader.declareAttribute("points", 3, float),
				projectionMatrix: cubeShader.declareMatrix("projectionMatrix", gl => gl.uniformMatrix4fv),
				reflectionMap: cubeShader.declareTexture("reflectionMap"),
				shininess: cubeShader.declareValue("shininess", gl => gl.uniform1f),
				specularColor: cubeShader.declareValue("specularColor", gl => gl.uniform4fv),
				specularMap: cubeShader.declareTexture("specularMap"),
				tangents: cubeShader.declareAttribute("tangents", 3, float)
			},
			meshes: renderer.load(cubeModel),
			shader: cubeShader
		},
		drawSpot: {
			binding: {
				modelViewMatrix: spotShader.declareMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
				points: spotShader.declareAttribute("points", 3, float),
				projectionMatrix: spotShader.declareMatrix("projectionMatrix", gl => gl.uniformMatrix4fv)
			},
			meshes: renderer.load(spotModel),
			shader: spotShader,
		},
		input: runtime.input,
		light: {
			bulbs: bulbs,
			move: 0,
			useAmbient: cubeShader.declareValue("useAmbient", gl => gl.uniform1i),
			useDiffuse: cubeShader.declareValue("useDiffuse", gl => gl.uniform1i),
			useNormalMap: cubeShader.declareValue("useNormalMap", gl => gl.uniform1i),
			useHeightMap: cubeShader.declareValue("useHeightMap", gl => gl.uniform1i),
			useSpecular: cubeShader.declareValue("useSpecular", gl => gl.uniform1i)
		},
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: renderer,
		tweak: tweak
	};
};

const render = (state: State) => {
	const camera = state.camera;
	const draw = state.drawCube;
	const light = state.light;
	const renderer = state.renderer;

	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y)

	renderer.clear();

	// Draw light bulbs
	for (let i = 0; i < Math.min(light.bulbs.length, state.tweak.nbLights); ++i) {
		const bulb = light.bulbs[i];

		state.drawSpot.shader.draw(state.drawSpot.binding, state.drawSpot.meshes, state.projection, view.translate(bulb.position));
	}

	// Draw cube
	light.bulbs.forEach((bulb, i) => bulb.enabled.set(i < state.tweak.nbLights ? 1 : 0));

	light.useAmbient.set(state.tweak.useAmbient);
	light.useDiffuse.set(state.tweak.useDiffuse);
	light.useHeightMap.set(state.tweak.useHeightMap);
	light.useNormalMap.set(state.tweak.useNormalMap);
	light.useSpecular.set(state.tweak.useSpecular);

	for (const bulb of light.bulbs) {
		const position = view.transform({
			x: bulb.position.x,
			y: bulb.position.y,
			z: bulb.position.z,
			w: 1
		});

		bulb.positionUniform.set([position.x, position.y, position.z]);
	}

	state.drawCube.shader.draw(state.drawCube.binding, state.drawCube.meshes, state.projection, view);
};

const update = (state: State, dt: number) => {
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

	if (state.tweak.moveLights) {
		light.move += dt * 0.00003;
	}

	for (let i = 0; i < state.light.bulbs.length; ++i) {
		const pitch = light.move * (((i + 1) * 17) % 23);
		const yaw = light.move * (((i + 1) * 7) % 13);

		state.light.bulbs[i].position = math.Vector.scale3({
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
