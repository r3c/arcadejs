import * as matrix from "../../math/matrix";
import * as webgl from "../webgl";

const vertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const fragmentShader = `
layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = vec4(1, 1, 1, 1);
}`;

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const load = (gl: WebGLRenderingContext) => {
	const shader = new webgl.Shader<State>(gl, vertexShader, fragmentShader);

	shader.bindAttributePerGeometry("points", state => state.geometry.points);

	shader.bindMatrixPerNode("modelMatrix", state => state.matrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerTarget("projectionMatrix", state => state.projectionMatrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerTarget("viewMatrix", state => state.viewMatrix.getValues(), gl => gl.uniformMatrix4fv);

	return shader;
};

class Pipeline implements webgl.Pipeline {
	private readonly gl: WebGLRenderingContext;
	private readonly shader: webgl.Shader<State>;

	public constructor(gl: WebGLRenderingContext) {
		this.gl = gl;
		this.shader = load(gl);
	}

	public process(target: webgl.Target, transform: webgl.Transform, scene: webgl.Scene) {
		const gl = this.gl;

		gl.enable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);

		gl.cullFace(gl.BACK);

		target.draw(this.shader, scene.subjects, {
			projectionMatrix: transform.projectionMatrix,
			viewMatrix: transform.viewMatrix
		});
	}

	public resize(width: number, height: number) {
	}
}

export { Pipeline }