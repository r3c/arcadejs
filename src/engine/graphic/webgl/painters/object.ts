import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlPainter, GlTarget, GlGeometry } from "../../webgl";
import { GlMaterial, GlMesh, GlObject, GlPolygon } from "../model";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

type ObjectBatch = {
  index: GlBuffer;
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
  polygon: GlPolygon;
};

type ObjectScene = {
  objects: Iterable<GlObject>;
  viewMatrix: Matrix4;
};

type MaterialMap = Map<GlMaterial, ObjectBatch[]>;

const group = (
  batchByMaterial: Map<GlMaterial, ObjectBatch[]>,
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
  geometryBinding: GlShaderBinding<GlGeometry> | undefined,
  materialBinding: GlShaderBinding<GlMaterial> | undefined,
  polygonBinding: GlShaderBinding<GlPolygon> | undefined,
  target: GlTarget,
  materialMap: MaterialMap
) => {
  for (const [material, meshBatches] of materialMap.entries()) {
    materialBinding?.bind(material);

    for (const { index, polygon, modelMatrix, normalMatrix } of meshBatches) {
      geometryBinding?.bind({ normalMatrix, modelMatrix });
      polygonBinding?.bind(polygon);
      target.draw(0, index);
    }
  }
};

const createObjectPainter = <TScene extends ObjectScene>(
  sceneBinding: GlShaderBinding<TScene>,
  geometryBinding: GlShaderBinding<GlGeometry> | undefined,
  materialBinding: GlShaderBinding<GlMaterial> | undefined,
  polygonBinding: GlShaderBinding<GlPolygon> | undefined
): GlPainter<TScene> => {
  return {
    paint: (target, scene) => {
      const { objects, viewMatrix } = scene;
      const materialMap: MaterialMap = new Map();

      for (const { matrix, model } of objects) {
        group(materialMap, viewMatrix, matrix, model.meshes);
      }

      sceneBinding.bind(scene);

      paint(
        geometryBinding,
        materialBinding,
        polygonBinding,
        target,
        materialMap
      );
    },
  };
};

export { type ObjectScene, createObjectPainter };
