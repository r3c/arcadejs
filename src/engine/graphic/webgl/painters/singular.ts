import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlMesh, GlPainter, GlShader, GlSubject, GlTarget } from "../../webgl";

const draw = <TScene, TModel>(
  shader: GlShader<TScene, TModel>,
  target: GlTarget,
  meshes: Iterable<GlMesh>,
  parentTransform: Matrix4,
  viewMatrix: Matrix4,
  state: TModel
): void => {
  const modelMatrix = Matrix4.fromIdentity();
  const normalMatrix = Matrix3.fromIdentity();

  for (const mesh of meshes) {
    modelMatrix.set(parentTransform);
    modelMatrix.multiply(mesh.transform);
    normalMatrix.set(viewMatrix);
    normalMatrix.multiply(modelMatrix);
    normalMatrix.invert();

    draw(shader, target, mesh.children, modelMatrix, viewMatrix, state);

    for (const primitive of mesh.primitives) {
      const material = primitive.material;
      const polygon = primitive.polygon;
      const { indexBuffer, indexCount, indexType } = polygon;

      shader.bindPolygon(polygon);
      shader.bindMaterial(material);
      shader.bindModel({ normalMatrix, modelMatrix, state });
      target.draw(0, indexBuffer, indexCount, indexType);
    }
  }
};

class SingularPainter<TScene, TModel> implements GlPainter<TScene, TModel> {
  private readonly shader: GlShader<TScene, TModel>;

  public constructor(shader: GlShader<TScene, TModel>) {
    this.shader = shader;
  }

  public paint(
    target: GlTarget,
    subjects: Iterable<GlSubject<TModel>>,
    viewMatrix: Matrix4,
    state: TScene
  ): void {
    const shader = this.shader;

    shader.activate();
    shader.bindScene(state);

    for (const { matrix, model, state } of subjects) {
      draw(shader, target, model.meshes, matrix, viewMatrix, state);
    }
  }
}

export { SingularPainter };
