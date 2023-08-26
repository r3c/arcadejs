import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlPainter, GlTarget, GlGeometry } from "../../webgl";
import { GlMaterial, GlMesh, GlObject, GlPolygon } from "../model";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

type BatchScene<TSceneState> = {
  objects: Iterable<GlObject>;
  state: TSceneState;
  viewMatrix: Matrix4;
};

type MeshBatch = {
  index: GlBuffer;
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
  polygon: GlPolygon;
};

type MaterialMap = Map<GlMaterial, MeshBatch[]>;

const group = (
  batchByMaterial: Map<GlMaterial, MeshBatch[]>,
  viewMatrix: Matrix4,
  parentMatrix: Matrix4,
  meshes: Iterable<GlMesh>
) => {
  for (const { children, primitives, transform } of meshes) {
    const modelMatrix = Matrix4.fromObject(parentMatrix);

    modelMatrix.multiply(transform);

    const normalMatrix = Matrix3.fromObject(viewMatrix);

    normalMatrix.multiply(modelMatrix);
    normalMatrix.invert();

    for (const { index, material, polygon } of primitives) {
      let meshBatches = batchByMaterial.get(material);

      if (meshBatches === undefined) {
        meshBatches = [];

        batchByMaterial.set(material, meshBatches);
      }

      meshBatches.push({
        index,
        modelMatrix,
        normalMatrix,
        polygon,
      });
    }

    group(batchByMaterial, viewMatrix, modelMatrix, children);
  }
};

const paint = (
  geometryBinding: GlShaderBinding<GlGeometry>,
  materialBinding: GlShaderBinding<GlMaterial>,
  polygonBinding: GlShaderBinding<GlPolygon>,
  target: GlTarget,
  materialMap: MaterialMap
) => {
  for (const [material, meshBatches] of materialMap.entries()) {
    materialBinding.bind(material);

    for (const { index, polygon, modelMatrix, normalMatrix } of meshBatches) {
      geometryBinding.bind({ normalMatrix, modelMatrix });
      polygonBinding.bind(polygon);
      target.draw(0, index);
    }
  }
};

class BatchPainter<TSceneState> implements GlPainter<BatchScene<TSceneState>> {
  private readonly geometryBinding: GlShaderBinding<GlGeometry>;
  private readonly materialBinding: GlShaderBinding<GlMaterial>;
  private readonly polygonBinding: GlShaderBinding<GlPolygon>;
  private readonly sceneBinding: GlShaderBinding<TSceneState>;

  public constructor(
    sceneBinding: GlShaderBinding<TSceneState>,
    geometryBinding: GlShaderBinding<GlGeometry>,
    materialBinding: GlShaderBinding<GlMaterial>,
    polygonBinding: GlShaderBinding<GlPolygon>
  ) {
    this.geometryBinding = geometryBinding;
    this.materialBinding = materialBinding;
    this.polygonBinding = polygonBinding;
    this.sceneBinding = sceneBinding;
  }

  public paint(target: GlTarget, scene: BatchScene<TSceneState>): void {
    const { objects, state, viewMatrix } = scene;
    const materialMap: MaterialMap = new Map();

    for (const { matrix, model } of objects) {
      group(materialMap, viewMatrix, matrix, model.meshes);
    }

    this.sceneBinding.bind(state);

    paint(
      this.geometryBinding,
      this.materialBinding,
      this.polygonBinding,
      target,
      materialMap
    );
  }
}

export { type BatchScene, BatchPainter };
