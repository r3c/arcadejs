import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as webgl from "../engine/webgl";

/*
** What changed?
*/

const vsSource = `
	attribute vec4 color;
	attribute vec2 coord;
	attribute vec3 normal;
	attribute vec4 point;

	uniform mat4 modelViewMatrix;
	uniform mat3 normalMatrix;
	uniform mat4 projectionMatrix;

	varying highp vec4 vColor;
	varying highp vec2 vCoord;
	varying highp vec3 vNormal;

	void main(void) {
		vColor = color;
		vCoord = coord;
		vNormal = normalMatrix * normal;

		gl_Position = projectionMatrix * modelViewMatrix * point;
	}
`;

const fsSource = `
	varying highp vec4 vColor;
	varying highp vec2 vCoord;
	varying highp vec3 vNormal;

	uniform highp vec4 colorBase;
	uniform sampler2D colorMap;
	uniform bool light;

	void main(void) {
		highp vec4 lightColor;

		if (light) {
			highp vec3 ambientLightColor = vec3(0.3, 0.3, 0.3);
			highp vec3 diffuseLightColor = vec3(1, 1, 1);
			highp vec3 diffuseLightDirection = normalize(vec3(0.85, 0.8, 0.75));

			highp float directional = max(dot(vNormal, diffuseLightDirection), 0.0);

			lightColor = vec4(ambientLightColor + (diffuseLightColor * directional), 1.0);
		}
		else {
			lightColor = vec4(1, 1, 1, 1);
		}

		gl_FragColor = vColor * colorBase * lightColor * texture2D(colorMap, vCoord);
	}
`;

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	cube: webgl.Mesh[],
	input: controller.Input,
	light: webgl.ShaderUniform<number>,
	options: application.OptionMap,
	projection: math.Matrix,
	scene: webgl.Binding,
	screen: display.WebGLScreen,
	shader: webgl.Shader
}

const definitions = {
	light: {
		caption: "Enable light",
		type: application.DefinitionType.Checkbox,
		default: 1
	}
};

const prepare = async (options: application.OptionMap) => {
	const cubeReader = await io.Stream.readURL(io.StringReader, "./res/mesh/cube-ambient.json");

	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;
	const shader = new webgl.Shader(gl, vsSource, fsSource);

	webgl.setup(gl);

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		cube: await webgl.load(gl, graphic.Loader.fromJSON(cubeReader.data), "./res/mesh/"),
		input: runtime.input,
		light: shader.declareUniformValue("light", gl => gl.uniform1i),
		options: options,
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		scene: {
			colorBase: shader.declareUniformValue("colorBase", gl => gl.uniform4fv),
			colorMap: shader.declareUniformValue("colorMap", gl => gl.uniform1i),
			colors: shader.declareAttribute("color", 4, gl.FLOAT),
			coords: shader.declareAttribute("coord", 2, gl.FLOAT),
			modelViewMatrix: shader.declareUniformMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
			normalMatrix: shader.declareUniformMatrix("normalMatrix", gl => gl.uniformMatrix3fv),
			normals: shader.declareAttribute("normal", 3, gl.FLOAT),
			points: shader.declareAttribute("point", 3, gl.FLOAT),
			projectionMatrix: shader.declareUniformMatrix("projectionMatrix", gl => gl.uniformMatrix4fv),
			shader: shader
		},
		screen: runtime.screen,
		shader: shader
	};
};

const render = (state: State) => {
	const camera = state.camera;
	const screen = state.screen;

	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y)

	webgl.clear(screen.context);
	webgl.draw(state.scene, state.projection, view, state.cube);
};

const update = (state: State, dt: number) => {
	const camera = state.camera;
	const input = state.input;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	// FIXME: must be done after program is used only
	state.shader.setUniform(state.light, state.options["light"]);

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
