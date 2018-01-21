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
		direction: webgl.ShaderUniform<number[]>,
		enabled: webgl.ShaderUniform<number>,
		ry: number,
		rz: number
	}
	options: application.OptionMap,
	projection: math.Matrix,
	renderer: webgl.Renderer
}

const definitions = {
	light: {
		caption: "Enable light",
		type: application.DefinitionType.Checkbox,
		default: 1
	}
};

const prepare = async (options: application.OptionMap) => {
	const runtime = application.runtime(display.WebGLScreen);
	const renderer = new webgl.Renderer(runtime.screen.context);

	const cubeModel = await model.fromJSON("./res/s04/cube.json");
	const cubeShader = new webgl.Shader(
		runtime.screen.context,
		await io.readURL(io.StringFormat, "./res/s06/cube.vert"),
		await io.readURL(io.StringFormat, "./res/s06/cube.frag")
	);

	const spotModel = await model.fromJSON("./res/s06/spot.json");
	const spotShader = new webgl.Shader(
		runtime.screen.context,
		await io.readURL(io.StringFormat, "./res/s06/spot.vert"),
		await io.readURL(io.StringFormat, "./res/s06/spot.frag")
	);

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
				colors: cubeShader.declareAttribute("color", 4, float),
				coords: cubeShader.declareAttribute("coord", 2, float),
				modelViewMatrix: cubeShader.declareUniformMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
				normalMatrix: cubeShader.declareUniformMatrix("normalMatrix", gl => gl.uniformMatrix3fv),
				normals: cubeShader.declareAttribute("normal", 3, float),
				points: cubeShader.declareAttribute("point", 3, float),
				projectionMatrix: cubeShader.declareUniformMatrix("projectionMatrix", gl => gl.uniformMatrix4fv)
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
			direction: cubeShader.declareUniformValue("lightDirection", gl => gl.uniform3fv),
			enabled: cubeShader.declareUniformValue("lightEnabled", gl => gl.uniform1i),
			ry: Math.PI * 0.3,
			rz: Math.PI * -0.2
		},
		options: options,
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: renderer
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

	const viewCube = view;

	const viewSpot = view
		.rotate({x: 0, y: 1, z: 0}, light.ry)
		.rotate({x: 0, y: 0, z: 1}, light.rz)
		.translate({x: 3, y: 0, z: 0});

	const lightDirection = viewSpot.transform({x: 1, y: 0, z: 0, w: 0});

	renderer.clear();

	// Draw cube
	state.drawCube.shader.activate();
	state.drawCube.shader.setUniform(light.direction, [lightDirection.x, lightDirection.y, lightDirection.z]);
	state.drawCube.shader.setUniform(light.enabled, state.options["light"]);

	renderer.draw(state.drawCube.shader, state.drawCube.binding, state.drawCube.meshes, state.projection, viewCube);

	// Draw light spot
	state.drawSpot.shader.activate();

	renderer.draw(state.drawSpot.shader, state.drawSpot.binding, state.drawSpot.meshes, state.projection, viewSpot);
};

const update = (state: State, dt: number) => {
	const camera = state.camera;
	const input = state.input;
	const light = state.light;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	if (input.isPressed("mousemiddle")) {
		light.ry += movement.x / 64;
		light.rz += movement.y / 64;
	}

	if (input.isPressed("mouseleft")) {
		camera.position.x += movement.x / 64;
		camera.position.y -= movement.y / 64;
	}

	if (input.isPressed("mouseright")) {
		camera.rotation.x -= movement.y / 64;
		camera.rotation.y -= movement.x / 64;
	}

	camera.position.z += wheel;
};

const scenario = {
	definitions: definitions,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
