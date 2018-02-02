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
	useSpecular: boolean
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
			enabled: webgl.ShaderUniform<number>,
			positionUniform: webgl.ShaderUniform<number[]>,
			position: math.Vector3
		}[],
		move: number,
		useAmbient: webgl.ShaderUniform<number>,
		useDiffuse: webgl.ShaderUniform<number>,
		useSpecular: webgl.ShaderUniform<number>
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
	useSpecular: false
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const renderer = new webgl.Renderer(runtime.screen.context);

	const cubeModel = await model.fromJSON("./res/s04/cube.json");
	const cubeShader = new webgl.Shader(
		runtime.screen.context,
		await io.readURL(io.StringFormat, "./res/s06/cube.vert"),
		await io.readURL(io.StringFormat, "./res/s06/cube.frag")
	);

	const spotModel = await model.fromOBJ("./res/mesh/sphere.obj", { scale: { xx: 0.2, yy: 0.2, zz: 0.2 } });
	const spotShader = new webgl.Shader(
		runtime.screen.context,
		await io.readURL(io.StringFormat, "./res/s06/spot.vert"),
		await io.readURL(io.StringFormat, "./res/s06/spot.frag")
	);

	const bulbs = [0, 1, 2].map(i => ({
		enabled: cubeShader.declareUniformValue("light" + i + ".enabled", gl => gl.uniform1i),
		positionUniform: cubeShader.declareUniformValue("light" + i + ".position", gl => gl.uniform3fv),
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
				colorBase: cubeShader.declareUniformValue("colorBase", gl => gl.uniform4fv),
				colorMap: cubeShader.declareUniformValue("colorMap", gl => gl.uniform1i),
				coords: cubeShader.declareAttribute("coord", 2, float),
				glossMap: cubeShader.declareUniformValue("glossMap", gl => gl.uniform1i),
				modelViewMatrix: cubeShader.declareUniformMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
				normalMatrix: cubeShader.declareUniformMatrix("normalMatrix", gl => gl.uniformMatrix3fv),
				normals: cubeShader.declareAttribute("normal", 3, float),
				points: cubeShader.declareAttribute("point", 3, float),
				projectionMatrix: cubeShader.declareUniformMatrix("projectionMatrix", gl => gl.uniformMatrix4fv),
				shininess: cubeShader.declareUniformValue("shininess", gl => gl.uniform1f)
			},
			meshes: renderer.load(cubeModel),
			shader: cubeShader
		},
		drawSpot: {
			binding: {
				modelViewMatrix: spotShader.declareUniformMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
				points: spotShader.declareAttribute("point", 3, float),
				projectionMatrix: spotShader.declareUniformMatrix("projectionMatrix", gl => gl.uniformMatrix4fv)
			},
			meshes: renderer.load(spotModel),
			shader: spotShader,
		},
		input: runtime.input,
		light: {
			bulbs: bulbs,
			move: 0,
			useAmbient: cubeShader.declareUniformValue("useAmbient", gl => gl.uniform1i),
			useDiffuse: cubeShader.declareUniformValue("useDiffuse", gl => gl.uniform1i),
			useSpecular: cubeShader.declareUniformValue("useSpecular", gl => gl.uniform1i)
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
	state.drawSpot.shader.activate();

	for (let i = 0; i < Math.min(light.bulbs.length, state.tweak.nbLights); ++i) {
		const bulb = light.bulbs[i];

		renderer.draw(state.drawSpot.shader, state.drawSpot.binding, state.drawSpot.meshes, state.projection, view.translate(bulb.position));
	}

	// Draw cube
	state.drawCube.shader.activate();

	light.bulbs.forEach((bulb, i) => state.drawCube.shader.setUniform(bulb.enabled, i < state.tweak.nbLights ? 1 : 0));

	state.drawCube.shader.setUniform(light.useAmbient, state.tweak.useAmbient);
	state.drawCube.shader.setUniform(light.useDiffuse, state.tweak.useDiffuse);
	state.drawCube.shader.setUniform(light.useSpecular, state.tweak.useSpecular);

	for (const bulb of light.bulbs) {
		const position = view.transform({
			x: bulb.position.x,
			y: bulb.position.y,
			z: bulb.position.z,
			w: 1
		});

		state.drawCube.shader.setUniform(bulb.positionUniform, [position.x, position.y, position.z]);
	}

	renderer.draw(state.drawCube.shader, state.drawCube.binding, state.drawCube.meshes, state.projection, view);
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
