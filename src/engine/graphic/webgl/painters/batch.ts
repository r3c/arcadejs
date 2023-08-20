import { Matrix3, Matrix4 } from "../../../math/matrix";
import {
  GlMaterial,
  GlMesh,
  GlPainter,
  GlObject,
  GlTarget,
  GlGeometry,
} from "../../webgl";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

type BatchScene<TSceneState, TPolygonState> = {
  objects: Iterable<GlObject<TPolygonState>>;
  state: TSceneState;
  viewMatrix: Matrix4;
};

type MeshBatch<TPolygon> = {
  index: GlBuffer;
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
  polygon: TPolygon;
};

type MaterialMap<TPolygon> = Map<GlMaterial, MeshBatch<TPolygon>[]>;

const group = <TPolygon>(
  batchByMaterial: Map<GlMaterial, MeshBatch<TPolygon>[]>,
  viewMatrix: Matrix4,
  parentMatrix: Matrix4,
  meshes: Iterable<GlMesh<TPolygon>>
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

const paint = <TPolygonState>(
  geometryBinding: GlShaderBinding<GlGeometry>,
  materialBinding: GlShaderBinding<GlMaterial>,
  polygonBinding: GlShaderBinding<TPolygonState>,
  target: GlTarget,
  materialMap: MaterialMap<TPolygonState>
) => {
  for (const [material, meshBatches] of materialMap.entries()) {
    materialBinding.bind(material);

    for (const { index, polygon, modelMatrix, normalMatrix } of meshBatches) {
      geometryBinding.bind({ normalMatrix, modelMatrix });
      polygonBinding.bind(polygon);
      target.draw(0, index.buffer, index.length, index.type);
    }
  }
};

class BatchPainter<TSceneState, TPolygonState>
  implements GlPainter<BatchScene<TSceneState, TPolygonState>>
{
  private readonly geometryBinding: GlShaderBinding<GlGeometry>;
  private readonly materialBinding: GlShaderBinding<GlMaterial>;
  private readonly polygonBinding: GlShaderBinding<TPolygonState>;
  private readonly sceneBinding: GlShaderBinding<TSceneState>;

  public constructor(
    sceneBinding: GlShaderBinding<TSceneState>,
    geometryBinding: GlShaderBinding<GlGeometry>,
    materialBinding: GlShaderBinding<GlMaterial>,
    polygonBinding: GlShaderBinding<TPolygonState>
  ) {
    this.geometryBinding = geometryBinding;
    this.materialBinding = materialBinding;
    this.polygonBinding = polygonBinding;
    this.sceneBinding = sceneBinding;
  }

  public paint(
    target: GlTarget,
    scene: BatchScene<TSceneState, TPolygonState>
  ): void {
    const { objects, state, viewMatrix } = scene;
    const materialMap: MaterialMap<TPolygonState> = new Map();

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
