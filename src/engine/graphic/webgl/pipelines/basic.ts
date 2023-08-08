import { Matrix4 } from "../../../math/matrix";
import {
  GlPainter,
  GlPipeline,
  GlRenderer,
  GlScene,
  GlShader,
  GlTarget,
  GlTransform,
  uniform,
} from "../../webgl";
import { SingularPainter } from "../painters/singular";

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

const load = (renderer: GlRenderer) => {
  const shader = new GlShader<State>(renderer, vertexShader, fragmentShader);

  shader.setAttributePerPolygon("points", (geometry) => geometry.points);

  shader.setUniformPerMesh(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerTarget(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerTarget(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  return shader;
};

class Pipeline implements GlPipeline {
  private readonly painter: GlPainter<State>;
  private readonly renderer: GlRenderer;

  public constructor(renderer: GlRenderer) {
    this.painter = new SingularPainter(load(renderer));
    this.renderer = renderer;
  }

  public process(target: GlTarget, transform: GlTransform, scene: GlScene) {
    const gl = this.renderer.context;

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
