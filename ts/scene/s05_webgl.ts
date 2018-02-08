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
	attribute vec4 colors;
	attribute vec2 coords;
	attribute vec4 points;

	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	uniform mat4 viewMatrix;

	varying highp vec4 color;
	varying highp vec2 coord;

	void main(void) {
		color = colors;
		coord = coords;

		gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
	}
`;

const fsSource = `
	varying highp vec4 color;
	varying highp vec2 coord;

	uniform highp vec4 ambientColor;
	uniform sampler2D ambientMap;

	void main(void) {
		gl_FragColor = color * ambientColor * texture2D(ambientMap, coord);
	}
`;

interface State {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	input: controller.Input,
	model: webgl.Mesh[],
	shader: webgl.Shader<void>,
	target: webgl.Target
}

const prepare = async () => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	const renderer = new webgl.Renderer(gl);
	const shader = new webgl.Shader<void>(gl, vsSource, fsSource);

	shader.bindAttribute("colors", 4, gl.FLOAT, mesh => mesh.colors);
	shader.bindAttribute("coords", 2, gl.FLOAT, mesh => mesh.coords);
	shader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);

	shader.bindMaterialProperty("ambientColor", gl => gl.uniform4fv, material => material.ambientColor);
	shader.bindMaterialTexture("ambientMap", material => material.ambientMap);

	shader.bindMatrix("modelMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelMatrix);
	shader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);
	shader.bindMatrix("viewMatrix", gl => gl.uniformMatrix4fv, transform => transform.viewMatrix);

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		input: runtime.input,
		model: renderer.load(await model.fromJSON("./res/model/cube.json")),
		shader: shader,
		target: webgl.Target.createScreen(gl, runtime.screen.getWidth(), runtime.screen.getHeight())
	};
};

const render = (state: State) => {
	const camera = state.camera;
	const target = state.target;

	const viewMatrix = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const cube = {
		meshes: state.model,
		modelMatrix: math.Matrix.createIdentity(),
		shader: state.shader
	};

	target.draw([cube], viewMatrix, undefined);
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
