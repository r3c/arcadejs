import { Matrix3, Matrix4 } from "../../math/matrix";
import * as webgl from "../webgl";

class SingularPainter<TContext> implements webgl.Painter<TContext> {
  private readonly shader: webgl.Shader<TContext>;

  public constructor(shader: webgl.Shader<TContext>) {
    this.shader = shader;
  }

  public paint(
    target: webgl.Target,
    subjects: Iterable<webgl.Subject>,
    view: Matrix4,
    state: TContext
  ): void {
    const shader = this.shader;

    shader.activate();

    const textureIndex = shader.bindTarget(state);

    for (const subject of subjects) {
      this.draw(target, subject.mesh.nodes, subject.matrix, view, textureIndex);
    }
  }

  private draw(
    target: webgl.Target,
    nodes: Iterable<webgl.Node>,
    parentTransform: Matrix4,
    view: Matrix4,
    textureIndex: number
  ): void {
    const normal = Matrix4.createIdentity();
    const shader = this.shader;
    const modelMatrix = Matrix4.createIdentity();

    for (const node of nodes) {
      modelMatrix.duplicate(parentTransform).multiply(node.transform);

      const viewTransformMatrix = normal.duplicate(view).multiply(modelMatrix);
      const normalMatrix = Matrix3.fromObject(viewTransformMatrix).invert();

      this.draw(target, node.children, modelMatrix, view, textureIndex);

      for (const primitive of node.primitives) {
        const geometry = primitive.geometry;
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
