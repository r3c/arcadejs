import * as matrix from "../../math/matrix";
import * as webgl from "../webgl";

const vsSource = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const fsSource = `
layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = vec4(1, 1, 1, 1);
}`;

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const load = (gl: WebGLRenderingContext) => {
	const shader = new webgl.Shader<State>(gl, vsSource, fsSource);

	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	private readonly shader: webgl.Shader<State>;

	public constructor(gl: WebGLRenderingContext) {
		this.shader = load(gl);
	}

	public render(target: webgl.Target, subjects: webgl.Subject[], state: State) {
		target.draw(this.shader, subjects, state);
	}
}

export { Renderer, State }