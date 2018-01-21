import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as model from "../engine/model";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Rendering target is now a WebGL context instead of a 2D one
** - Shaders are defined to replace software projection and rasterization steps
*/

const vsSource = `
	attribute vec4 color;
	attribute vec2 coord;
	attribute vec4 point;

	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;

	varying highp vec4 vColor;
	varying highp vec2 vCoord;

	void main(void) {
		vColor = color;
		vCoord = coord;

		gl_Position = projectionMatrix * modelViewMatrix * point;
	}
`;

const fsSource = `
	varying highp vec4 vColor;
	varying highp vec2 vCoord;

	uniform highp vec4 colorBase;
	uniform sampler2D colorMap;

	void main(void) {
		gl_FragColor = vColor * colorBase * texture2D(colorMap, vCoord);
	}
`;

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	draw: {
		binding: webgl.Binding,
		meshes: webgl.Mesh[],
		shader: webgl.Shader
	},
	input: controller.Input,
	projection: math.Matrix,
	renderer: webgl.Renderer
}

const prepare = async () => {
	const runtime = application.runtime(display.WebGLScreen);

	const float = runtime.screen.context.FLOAT;
	const renderer = new webgl.Renderer(runtime.screen.context);
	const shader = new webgl.Shader(runtime.screen.context, vsSource, fsSource);

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		draw: {
			binding: {
				colorBase: shader.declareUniformValue("colorBase", gl => gl.uniform4fv),
				colorMap: shader.declareUniformValue("colorMap", gl => gl.uniform1i),
				colors: shader.declareAttribute("color", 4, float),
				coords: shader.declareAttribute("coord", 2, float),
				modelViewMatrix: shader.declareUniformMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
				projectionMatrix: shader.declareUniformMatrix("projectionMatrix", gl => gl.uniformMatrix4fv),
				points: shader.declareAttribute("point", 3, float)
			},
			meshes: await io
				.readURL(io.JSONRequest, "./res/mesh/cube-ambient.json")
				.then(model.fromJSON)
				.then(model => renderer.load(model, "./res/mesh/")),
			shader: shader
		},
		input: runtime.input,
		projection: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		renderer: renderer
	};
};

const render = (state: State) => {
	const camera = state.camera;
	const draw = state.draw;
	const renderer = state.renderer;

	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y)

	renderer.clear();

	draw.shader.activate();

	renderer.draw(draw.shader, draw.binding, draw.meshes, state.projection, view);
};

const update = (state: State, dt: number) => {
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
};

const scenario = {
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
