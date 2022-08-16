import { Matrix4 } from "../../math/matrix";
import { Painter as SingularPainter } from "../painters/singular";
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
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

const load = (gl: WebGLRenderingContext) => {
  const shader = new webgl.Shader<State>(gl, vertexShader, fragmentShader);

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setupMatrixPerNode(
    "modelMatrix",
    (state) => state.transform.getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "viewMatrix",
    (state) => state.viewMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );

  return shader;
};

class Pipeline implements webgl.Pipeline {
  private readonly gl: WebGLRenderingContext;
  private readonly painter: webgl.Painter<State>;

  public constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.painter = new SingularPainter(load(gl));
  }

  public process(
    target: webgl.Target,
    transform: webgl.Transform,
    scene: webgl.Scene
  ) {
    const gl = this.gl;

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.cullFace(gl.BACK);

    this.painter.paint(target, scene.subjects, transform.viewMatrix, {
      projectionMatrix: transform.projectionMatrix,
      viewMatrix: transform.viewMatrix,
    });
  }

  public resize(_width: number, _height: number) {}
}

export { Pipeline };
