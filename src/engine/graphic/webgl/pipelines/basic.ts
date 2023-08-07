import { Matrix4 } from "../../../math/matrix";
import { SingularPainter } from "../painters/singular";
import * as webgl from "../../webgl";

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

const load = (gl: WebGL2RenderingContext) => {
  const shader = new webgl.GlShader<State>(gl, vertexShader, fragmentShader);

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setUniformPerMesh(
    "modelMatrix",
    webgl.numberMatrix4Uniform(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerTarget(
    "projectionMatrix",
    webgl.numberMatrix4Uniform(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerTarget(
    "viewMatrix",
    webgl.numberMatrix4Uniform(({ viewMatrix }) => viewMatrix)
  );

  return shader;
};

class Pipeline implements webgl.GlPipeline {
  private readonly gl: WebGL2RenderingContext;
  private readonly painter: webgl.GlPainter<State>;

  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.painter = new SingularPainter(load(gl));
  }

  public process(
    target: webgl.GlTarget,
    transform: webgl.GlTransform,
    scene: webgl.GlScene
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
