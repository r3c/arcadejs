import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlPainter, GlTarget, GlGeometry } from "../../webgl";
import { GlMaterial, GlMesh, GlObject, GlPolygon } from "../model";
import { GlShaderBinding } from "../shader";

type SingularScene<TSceneState> = {
  objects: Iterable<GlObject>;
  state: TSceneState;
  viewMatrix: Matrix4;
};

const draw = (
  geometryBinding: GlShaderBinding<GlGeometry> | undefined,
  materialBinding: GlShaderBinding<GlMaterial> | undefined,
  polygonBinding: GlShaderBinding<GlPolygon> | undefined,
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

    draw(
      geometryBinding,
      materialBinding,
      polygonBinding,
      target,
      mesh.children,
      modelMatrix,
      viewMatrix
    );

    geometryBinding?.bind({ normalMatrix, modelMatrix });

    for (const primitive of mesh.primitives) {
      const { index, material, polygon } = primitive;

      materialBinding?.bind(material);
      polygonBinding?.bind(polygon);
      target.draw(0, index);
    }
  }
};

class SingularPainter<TSceneState>
  implements GlPainter<SingularScene<TSceneState>>
{
  private readonly geometryBinding: GlShaderBinding<GlGeometry> | undefined;
  private readonly materialBinding: GlShaderBinding<GlMaterial> | undefined;
  private readonly polygonBinding: GlShaderBinding<GlPolygon> | undefined;
  private readonly sceneBinding: GlShaderBinding<TSceneState> | undefined;

  public constructor(
    sceneBinding: GlShaderBinding<TSceneState> | undefined,
    geometryBinding: GlShaderBinding<GlGeometry> | undefined,
    materialBinding: GlShaderBinding<GlMaterial> | undefined,
    polygonBinding: GlShaderBinding<GlPolygon> | undefined
  ) {
    this.geometryBinding = geometryBinding;
    this.materialBinding = materialBinding;
    this.polygonBinding = polygonBinding;
    this.sceneBinding = sceneBinding;
  }

  public paint(target: GlTarget, scene: SingularScene<TSceneState>): void {
    const { objects, state, viewMatrix } = scene;
    this.sceneBinding?.bind(state);

    for (const { matrix, model } of objects) {
      draw(
        this.geometryBinding,
        this.materialBinding,
        this.polygonBinding,
        target,
        model.meshes,
        matrix,
        viewMatrix
      );
    }
  }
}

export { type SingularScene, SingularPainter };
