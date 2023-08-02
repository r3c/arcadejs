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

    const textureIndex = shader.bindTarget(state);

    for (const subject of subjects) {
      this.draw(
        target,
        subject.model.meshes,
        subject.matrix,
        view,
        textureIndex
      );
    }
  }

  private draw(
    target: webgl.GlTarget,
    nodes: Iterable<webgl.GlMesh>,
    parentTransform: Matrix4,
    viewMatrix: Matrix4,
    textureIndex: number
  ): void {
    const modelMatrix = Matrix4.createIdentity();
    const normalMatrix = Matrix3.createIdentity();
    const shader = this.shader;

    for (const node of nodes) {
      modelMatrix.duplicate(parentTransform).multiply(node.transform);
      normalMatrix.duplicate(viewMatrix).multiply(modelMatrix).invert();

      this.draw(target, node.children, modelMatrix, viewMatrix, textureIndex);

      for (const primitive of node.primitives) {
        const geometry = primitive.polygon;
        const material = primitive.material;

        shader.bindGeometry(geometry);
        shader.bindMaterial(material, textureIndex);
        shader.bindNode({ normalMatrix, modelMatrix });

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
