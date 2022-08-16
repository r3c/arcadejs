import { Matrix4 } from "../../math/matrix";
import * as webgl from "../webgl";

class Painter<State> implements webgl.Painter<State> {
  private readonly shader: webgl.Shader<State>;

  public constructor(shader: webgl.Shader<State>) {
    this.shader = shader;
  }

  public paint(
    target: webgl.Target,
    subjects: Iterable<webgl.Subject>,
    view: Matrix4,
    state: State
  ): void {
    const shader = this.shader;

    shader.activate();

    for (const subject of subjects) {
      const textureIndex = shader.bindTarget(state);

      this.draw(target, subject.mesh.nodes, subject.matrix, view, textureIndex);
    }
  }

  private draw(
    target: webgl.Target,
    nodes: Iterable<webgl.Node>,
    parentTransform: Matrix4,
    viewMatrix: Matrix4,
    textureIndex: number
  ): void {
    const shader = this.shader;

    for (const node of nodes) {
      const transform = parentTransform.compose(node.transform);

      this.draw(target, node.children, transform, viewMatrix, textureIndex);

      for (const primitive of node.primitives) {
        const geometry = primitive.geometry;
        const material = primitive.material;

        shader.bindGeometry(geometry);
        shader.bindMaterial(material, textureIndex);
        shader.bindNode({
          normalMatrix: viewMatrix.compose(transform).getTransposedInverse3x3(),
          transform: transform,
        });

        target.draw(
          0,
          geometry.indexBuffer,
          geometry.count,
          geometry.indexType
        );
      }
    }
  }
}

export { Painter };
