import { Releasable } from "../../io/resource";
import { Matrix4 } from "../../math/matrix";
import { GlPencil, GlTarget } from "../webgl/target";
import { GlMesh, GlPolygon } from "../webgl/model";
import { GlShaderBinding } from "../webgl/shader";
import { Renderer } from "../renderer";

type GlVolumeMeshBinding<TScene> = Releasable & {
  polygonBinding: GlShaderBinding<GlPolygon>;
  sceneBinding: GlShaderBinding<TScene>;
  subjectBinding: GlShaderBinding<GlVolumeMeshSubject>;
};

type GlVolumeMeshRenderer<TScene extends GlVolumeMeshScene> = Releasable &
  Renderer<GlTarget, TScene, GlMesh>;

type GlVolumeMeshScene = {
  projection: Matrix4;
  view: Matrix4;
};

type GlVolumeMeshSubject = {
  model: Matrix4;
};

/*
 ** Create a simple volume mesh renderer with no material support.
 */
const createGlVolumeMeshRenderer = <TScene extends GlVolumeMeshScene>(
  binding: GlVolumeMeshBinding<TScene>,
): GlVolumeMeshRenderer<TScene> => {
  const { polygonBinding, sceneBinding, subjectBinding } = binding;
  const subjects = new Map<Symbol, GlMesh>();

  const renderMesh = (
    target: GlTarget,
    subjectBinding: GlShaderBinding<GlVolumeMeshSubject>,
    polygonBinding: GlShaderBinding<GlPolygon>,
    mesh: GlMesh,
    view: Matrix4,
    parent: Matrix4,
  ): void => {
    const model = Matrix4.fromSource(parent, ["multiply", mesh.transform]);

    subjectBinding.bind({ model });

    for (const child of mesh.children) {
      renderMesh(target, subjectBinding, polygonBinding, child, view, model);
    }

    for (const { indexBuffer, polygon } of mesh.primitives) {
      polygonBinding.bind(polygon);
      target.draw(GlPencil.Triangle, indexBuffer);
    }
  };

  return {
    addSubject(mesh) {
      const symbol = Symbol();

      subjects.set(symbol, mesh);

      return () => {
        subjects.delete(symbol);
      };
    },

    release() {},

    render(target, scene) {
      sceneBinding.bind(scene);

      for (const subject of subjects.values()) {
        renderMesh(
          target,
          subjectBinding,
          polygonBinding,
          subject,
          scene.view,
          Matrix4.identity,
        );
      }
    },

    setSize() {},
  };
};

export {
  type GlVolumeMeshBinding,
  type GlVolumeMeshRenderer,
  type GlVolumeMeshScene,
  type GlVolumeMeshSubject,
  createGlVolumeMeshRenderer,
};
