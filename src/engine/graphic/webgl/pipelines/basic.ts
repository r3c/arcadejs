import { Matrix4 } from "../../../math/matrix";
import {
  GlPainter,
  GlPipeline,
  GlRenderer,
  GlScene,
  GlShader,
  GlTarget,
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

type SceneState = {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const load = (renderer: GlRenderer) => {
  const shader = new GlShader<SceneState, undefined>(
    renderer,
    vertexShader,
    fragmentShader
  );

  shader.setAttributePerPolygon("points", (geometry) => geometry.points);

  shader.setUniformPerMesh(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerScene(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerScene(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  return shader;
};

class Pipeline implements GlPipeline<SceneState, undefined> {
  private readonly painter: GlPainter<SceneState, undefined>;
  private readonly renderer: GlRenderer;

  public constructor(renderer: GlRenderer) {
    this.painter = new SingularPainter<SceneState, undefined>(load(renderer));
    this.renderer = renderer;
  }

  public process(target: GlTarget, scene: GlScene<SceneState, undefined>) {
    const { state, subjects } = scene;
    const gl = this.renderer.context;

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.cullFace(gl.BACK);

    this.painter.paint(target, subjects, state.viewMatrix, state);
  }

  public resize(_width: number, _height: number) {}
}

export { Pipeline };
