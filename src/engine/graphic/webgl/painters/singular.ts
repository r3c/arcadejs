import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlMesh, GlPainter, GlShader, GlSubject, GlTarget } from "../../webgl";

const draw = <TState>(
  shader: GlShader<TState>,
  target: GlTarget,
  meshes: Iterable<GlMesh>,
  parentTransform: Matrix4,
  viewMatrix: Matrix4
): void => {
  const modelMatrix = Matrix4.fromIdentity();
  const normalMatrix = Matrix3.fromIdentity();

  for (const mesh of meshes) {
    modelMatrix.set(parentTransform);
    modelMatrix.multiply(mesh.transform);
    normalMatrix.set(viewMatrix);
    normalMatrix.multiply(modelMatrix);
    normalMatrix.invert();

    draw(shader, target, mesh.children, modelMatrix, viewMatrix);

    for (const primitive of mesh.primitives) {
      const material = primitive.material;
      const polygon = primitive.polygon;
      const { indexBuffer, indexCount, indexType } = polygon;

      shader.bindPolygon(polygon);
      shader.bindMaterial(material);
      shader.bindMesh({ normalMatrix, modelMatrix });
      target.draw(0, indexBuffer, indexCount, indexType);
    }
  }
};

class SingularPainter<TState> implements GlPainter<TState> {
  private readonly shader: GlShader<TState>;

  public constructor(shader: GlShader<TState>) {
    this.shader = shader;
  }

  public paint(
    target: GlTarget,
    subjects: Iterable<GlSubject>,
    viewMatrix: Matrix4,
    state: TState
  ): void {
    const shader = this.shader;

    shader.activate();
    shader.bindState(state);

    for (const subject of subjects) {
      draw(shader, target, subject.model.meshes, subject.matrix, viewMatrix);
    }
  }
}

export { SingularPainter };
