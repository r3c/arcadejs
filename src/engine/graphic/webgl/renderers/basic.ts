import { Matrix4 } from "../../../math/matrix";
import {
  GlObject,
  GlPainter,
  GlRenderer,
  GlRuntime,
  GlScene,
  GlShader,
  GlTarget,
  uniform,
} from "../../webgl";
import { SingularPainter } from "../painters/singular";
import { GlAttribute } from "../resource";

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

type BasicPolygon = {
  points: GlAttribute;
};

type SceneState = {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const load = (runtime: GlRuntime) => {
  const shader = new GlShader<SceneState, BasicPolygon>(
    runtime,
    vertexShader,
    fragmentShader,
    {}
  );

  shader.setAttributePerPolygon("points", ({ points }) => points);

  shader.setUniformPerGeometry(
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

class BasicRenderer implements GlRenderer<SceneState, GlObject<BasicPolygon>> {
  private readonly painter: GlPainter<SceneState, BasicPolygon>;
  private readonly runtime: GlRuntime;

  public constructor(runtime: GlRuntime) {
    this.painter = new SingularPainter<SceneState, BasicPolygon>(load(runtime));
    this.runtime = runtime;
  }

  public render(
    target: GlTarget,
    scene: GlScene<SceneState, GlObject<BasicPolygon>>
  ) {
    const { objects, state } = scene;
    const gl = this.runtime.context;

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.cullFace(gl.BACK);

    this.painter.paint(target, objects, state.viewMatrix, state);
  }

  public resize(_width: number, _height: number) {}
}

export { BasicRenderer };
