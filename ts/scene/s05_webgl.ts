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

interface CallState {
	projectionMatrix: math.Matrix,
	viewMatrix: math.Matrix
}

interface SceneState {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	gl: WebGLRenderingContext,
	input: controller.Input,
	model: webgl.Model,
	projectionMatrix: math.Matrix,
	shader: webgl.Shader<CallState>,
	target: webgl.Target
}

const prepare = async () => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;
	const shader = new webgl.Shader<CallState>(gl, vsSource, fsSource);

	shader.bindPerGeometryAttribute("colors", 4, gl.FLOAT, state => state.geometry.colors);
	shader.bindPerGeometryAttribute("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindPerGeometryAttribute("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindPerMaterialProperty("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
	shader.bindPerMaterialTexture("ambientMap", state => state.material.ambientMap);

	shader.bindPerModelMatrix("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindPerCallMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindPerCallMatrix("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		gl: gl,
		input: runtime.input,
		model: webgl.loadModel(gl, await model.fromJSON("./res/model/cube.json")),
		projectionMatrix: math.Matrix.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shader: shader,
		target: new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight())
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const target = state.target;

	const viewMatrix = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const cube = {
		matrix: math.Matrix.createIdentity(),
		model: state.model
	};

	gl.enable(gl.CULL_FACE);
	gl.enable(gl.DEPTH_TEST);

	gl.cullFace(gl.BACK);

	target.clear();
	target.draw(state.shader, [cube], {
		projectionMatrix: state.projectionMatrix,
		viewMatrix: viewMatrix
	});
};

const update = (state: SceneState, dt: number) => {
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
