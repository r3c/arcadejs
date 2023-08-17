import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlMesh, GlPainter, GlShader, GlObject, GlTarget } from "../../webgl";

const draw = <TSceneState, TPolygon>(
  shader: GlShader<TSceneState, TPolygon>,
  target: GlTarget,
  meshes: Iterable<GlMesh<TPolygon>>,
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

    shader.bindGeometry({ normalMatrix, modelMatrix });

    for (const primitive of mesh.primitives) {
      const { index, material, polygon } = primitive;

      shader.bindMaterial(material);
      shader.bindPolygon(polygon);
      target.draw(0, index.buffer, index.length, index.type);
    }
  }
};

class SingularPainter<TSceneState, TPolygon>
  implements GlPainter<TSceneState, TPolygon>
{
  private readonly shader: GlShader<TSceneState, TPolygon>;

  public constructor(shader: GlShader<TSceneState, TPolygon>) {
    this.shader = shader;
  }

  public paint(
    target: GlTarget,
    objects: Iterable<GlObject<TPolygon>>,
    view: Matrix4,
    state: TSceneState
  ): void {
    const shader = this.shader;

    shader.activate();
    shader.bindScene(state);

    for (const { matrix, model } of objects) {
      draw(shader, target, model.meshes, matrix, view);
    }
  }
}

export { SingularPainter };
