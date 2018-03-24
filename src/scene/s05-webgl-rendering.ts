import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as matrix from "../engine/math/matrix";
import * as model from "../engine/graphic/model";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Rendering target is now a WebGL context instead of a 2D one
** - Shaders are defined to replace software projection and rasterization steps
*/

const vsSource = `
	in vec4 colors;
	in vec2 coords;
	in vec4 points;

	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	uniform mat4 viewMatrix;

	out vec4 color;
	out vec2 coord;

	void main(void) {
		color = colors;
		coord = coords;

		gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
	}
`;

const fsSource = `
	in vec4 color;
	in vec2 coord;

	uniform vec4 albedoColor;
	uniform sampler2D albedoMap;

	layout(location=0) out vec4 fragColor;

	void main(void) {
		fragColor = color * albedoColor * texture(albedoMap, coord);
	}
`;

interface CallState {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

interface SceneState {
	camera: view.Camera,
	gl: WebGLRenderingContext,
	input: controller.Input,
	model: webgl.Model,
	projectionMatrix: matrix.Matrix4,
	shader: webgl.Shader<CallState>,
	target: webgl.Target
}

const prepare = async () => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;
	const shader = new webgl.Shader<CallState>(gl, vsSource, fsSource);

	shader.bindAttributePerGeometry("colors", 4, gl.FLOAT, state => state.geometry.colors);
	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindPropertyPerMaterial("albedoColor", gl => gl.uniform4fv, state => state.material.albedoColor);
	shader.bindTexturePerMaterial("albedoMap", state => state.material.albedoMap);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
		gl: gl,
		input: runtime.input,
		model: webgl.loadModel(gl, await model.fromJSON("./obj/cube/model.json")),
		projectionMatrix: matrix.Matrix4.createPerspective(45, runtime.screen.getRatio(), 0.1, 100),
		shader: shader,
		target: new webgl.Target(gl, runtime.screen.getWidth(), runtime.screen.getHeight())
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const gl = state.gl;
	const target = state.target;

	const viewMatrix = matrix.Matrix4
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

	const cube = {
		matrix: matrix.Matrix4.createIdentity(),
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
	state.camera.move(state.input);
};

const scenario = {
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
