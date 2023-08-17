import { Matrix3, Matrix4 } from "../../../math/matrix";
import {
  GlMaterial,
  GlMesh,
  GlPainter,
  GlShader,
  GlObject,
  GlTarget,
} from "../../webgl";
import { GlBuffer } from "../resource";

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

const paint = <TSceneState, TPolygon>(
  shader: GlShader<TSceneState, TPolygon>,
  target: GlTarget,
  materialMap: MaterialMap<TPolygon>,
  state: TSceneState
) => {
  shader.activate();
  shader.bindScene(state);

  for (const [material, meshBatches] of materialMap.entries()) {
    shader.bindMaterial(material);

    for (const { index, polygon, modelMatrix, normalMatrix } of meshBatches) {
      shader.bindGeometry({ normalMatrix, modelMatrix });
      shader.bindPolygon(polygon);
      target.draw(0, index.buffer, index.length, index.type);
    }
  }
};

class BatchPainter<TSceneState, TPolygon>
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
    const materialMap: MaterialMap<TPolygon> = new Map();

    for (const { matrix, model } of objects) {
      group(materialMap, view, matrix, model.meshes);
    }

    paint(this.shader, target, materialMap, state);
  }
}

export { BatchPainter };
