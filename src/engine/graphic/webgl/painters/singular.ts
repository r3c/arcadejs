import { Matrix3, Matrix4 } from "../../../math/matrix";
import * as webgl from "../../webgl";

class SingularPainter<TContext> implements webgl.GlPainter<TContext> {
  private readonly shader: webgl.GlShader<TContext>;

  public constructor(shader: webgl.GlShader<TContext>) {
    this.shader = shader;
  }

  public paint(
    target: webgl.GlTarget,
    subjects: Iterable<webgl.GlSubject>,
    view: Matrix4,
    state: TContext
  ): void {
    const shader = this.shader;

    shader.activate();
    shader.bindTarget(state);

    for (const subject of subjects) {
      this.draw(target, subject.model.meshes, subject.matrix, view);
    }
  }

  private draw(
    target: webgl.GlTarget,
    nodes: Iterable<webgl.GlMesh>,
    parentTransform: Matrix4,
    viewMatrix: Matrix4
  ): void {
    const modelMatrix = Matrix4.fromIdentity();
    const normalMatrix = Matrix3.fromIdentity();
    const shader = this.shader;

    for (const node of nodes) {
      modelMatrix.set(parentTransform);
      modelMatrix.multiply(node.transform);
      normalMatrix.set(viewMatrix);
      normalMatrix.multiply(modelMatrix);
      normalMatrix.invert();

      this.draw(target, node.children, modelMatrix, viewMatrix);

      for (const primitive of node.primitives) {
        const geometry = primitive.polygon;
        const material = primitive.material;

        shader.bindGeometry(geometry);
        shader.bindMaterial(material);
        shader.bindMesh({ normalMatrix, modelMatrix });

        target.draw(
          0,
          geometry.indexBuffer,
          geometry.indexCount,
          geometry.indexType
        );
      }
    }
  }
}

export { SingularPainter };
