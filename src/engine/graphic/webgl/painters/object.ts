import { Matrix3, Matrix4 } from "../../../math/matrix";
import { GlPainter, GlTarget, GlGeometry } from "../../webgl";
import { GlMaterial, GlMesh, GlObject, GlPolygon } from "../model";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

type ObjectBatch = {
  indexBuffer: GlBuffer;
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
  mesh: GlMesh
) => {
  const { children, primitives, transform } = mesh;

  const modelMatrix = Matrix4.fromSource(parentMatrix, ["multiply", transform]);
  const normalMatrix = Matrix3.fromSource(
    viewMatrix,
    ["multiply", modelMatrix],
    ["invert"]
  );

  for (const { indexBuffer, material, polygon } of primitives) {
    let meshBatches = batchByMaterial.get(material);

    if (meshBatches === undefined) {
      meshBatches = [];

      batchByMaterial.set(material, meshBatches);
    }

    meshBatches.push({
      indexBuffer,
      modelMatrix,
      normalMatrix,
      polygon,
    });
  }

  for (let i = 0; i < children.length; ++i) {
    group(batchByMaterial, viewMatrix, modelMatrix, children[i]);
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

    for (const {
      indexBuffer,
      polygon,
      modelMatrix,
      normalMatrix,
    } of meshBatches) {
      geometryBinding?.bind({ normalMatrix, modelMatrix });
      polygonBinding?.bind(polygon);
      target.draw(0, WebGL2RenderingContext["TRIANGLES"], indexBuffer);
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
        group(materialMap, viewMatrix, matrix, model.mesh);
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
