import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlMesh, GlPainter, GlShader, GlObject, GlTarget } from "../../webgl";

const draw = <TSceneState, TModelState>(
  shader: GlShader<TSceneState, TModelState>,
  target: GlTarget,
  meshes: Iterable<GlMesh>,
  parentTransform: Matrix4,
  viewMatrix: Matrix4,
  state: TModelState
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

class SingularPainter<TSceneState, TModelState>
  implements GlPainter<TSceneState, TModelState>
{
  private readonly shader: GlShader<TSceneState, TModelState>;

  public constructor(shader: GlShader<TSceneState, TModelState>) {
    this.shader = shader;
  }

  public paint(
    target: GlTarget,
    objects: Iterable<GlObject<TModelState>>,
    view: Matrix4,
    state: TSceneState
  ): void {
    const shader = this.shader;

    shader.activate();
    shader.bindScene(state);

    for (const { matrix, model, state } of objects) {
      draw(shader, target, model.meshes, matrix, view, state);
    }
  }
}

export { SingularPainter };
