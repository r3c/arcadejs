import { Matrix3, Matrix4 } from "../../../math/matrix";
import {
  GlMaterial,
  GlMesh,
  GlPainter,
  GlPolygon,
  GlShader,
  GlObject,
  GlTarget,
} from "../../webgl";

type MeshBatch<TModelState> = {
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
  polygon: GlPolygon;
  state: TModelState;
};

type MaterialMap<TModelState> = Map<GlMaterial, MeshBatch<TModelState>[]>;

const group = <TModelState>(
  batchByMaterial: Map<GlMaterial, MeshBatch<TModelState>[]>,
  viewMatrix: Matrix4,
  parentMatrix: Matrix4,
  meshes: Iterable<GlMesh>,
  state: TModelState
) => {
  for (const { children, primitives, transform } of meshes) {
    const modelMatrix = Matrix4.fromObject(parentMatrix);

    modelMatrix.multiply(transform);

    const normalMatrix = Matrix3.fromObject(viewMatrix);

    normalMatrix.multiply(modelMatrix);
    normalMatrix.invert();

    for (const { material, polygon } of primitives) {
      let meshBatches = batchByMaterial.get(material);

      if (meshBatches === undefined) {
        meshBatches = [];

        batchByMaterial.set(material, meshBatches);
      }

      meshBatches.push({ modelMatrix, normalMatrix, polygon, state });
    }

    group(batchByMaterial, viewMatrix, modelMatrix, children, state);
  }
};

const paint = <TSceneState, TModelState>(
  shader: GlShader<TSceneState, TModelState>,
  target: GlTarget,
  materialMap: MaterialMap<TModelState>,
  state: TSceneState
) => {
  shader.activate();
  shader.bindScene(state);

  for (const [material, meshBatches] of materialMap.entries()) {
    shader.bindMaterial(material);

    for (const { polygon, modelMatrix, normalMatrix, state } of meshBatches) {
      const { indexBuffer, indexCount, indexType } = polygon;

      shader.bindModel({ normalMatrix, modelMatrix, state });
      shader.bindPolygon(polygon);
      target.draw(0, indexBuffer, indexCount, indexType);
    }
  }
};

class BatchPainter<TSceneState, TModelState>
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
    const materialMap: MaterialMap<TModelState> = new Map();

    for (const { matrix, model, state } of objects) {
      group(materialMap, view, matrix, model.meshes, state);
    }

    paint(this.shader, target, materialMap, state);
  }
}

export { BatchPainter };
