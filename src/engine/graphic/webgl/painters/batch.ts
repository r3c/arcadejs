import { Matrix3, Matrix4 } from "../../../math/matrix";
import {
  GlMaterial,
  GlMesh,
  GlPainter,
  GlPolygon,
  GlShader,
  GlSubject,
  GlTarget,
} from "../../webgl";

type MeshBatch<TModel> = {
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
  polygon: GlPolygon;
  state: TModel;
};

type MaterialMap<TModel> = Map<GlMaterial, MeshBatch<TModel>[]>;

const group = <TModel>(
  batchByMaterial: Map<GlMaterial, MeshBatch<TModel>[]>,
  viewMatrix: Matrix4,
  parentMatrix: Matrix4,
  meshes: Iterable<GlMesh>,
  state: TModel
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

const paint = <TScene, TModel>(
  shader: GlShader<TScene, TModel>,
  target: GlTarget,
  materialMap: MaterialMap<TModel>,
  state: TScene
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

class BatchPainter<TScene, TModel> implements GlPainter<TScene, TModel> {
  private readonly shader: GlShader<TScene, TModel>;

  public constructor(shader: GlShader<TScene, TModel>) {
    this.shader = shader;
  }

  public paint(
    target: GlTarget,
    subjects: Iterable<GlSubject<TModel>>,
    viewMatrix: Matrix4,
    state: TScene
  ): void {
    const materialMap: MaterialMap<TModel> = new Map();

    for (const { matrix, model, state } of subjects) {
      group(materialMap, viewMatrix, matrix, model.meshes, state);
    }

    paint(this.shader, target, materialMap, state);
  }
}

export { BatchPainter };
