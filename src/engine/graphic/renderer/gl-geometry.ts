import { Releasable } from "../../io/resource";
import { Matrix4 } from "../../math/matrix";
import { GlPencil, GlTarget } from "../webgl/target";
import { GlMesh, GlPolygon } from "../webgl/model";
import { GlShaderBinding } from "../webgl/shader";
import { Renderer } from "../renderer";

type GlGeometryBinding<TScene> = Releasable & {
  polygonBinding: GlShaderBinding<GlPolygon>;
  sceneBinding: GlShaderBinding<TScene>;
  subjectBinding: GlShaderBinding<GlGeometrySubject>;
};

type GlGeometryRenderer<TScene extends GlGeometryScene> = Releasable &
  Renderer<GlTarget, TScene> & {
    addSubject: (subject: GlMesh) => () => void;
  };

type GlGeometryScene = {
  projection: Matrix4;
  view: Matrix4;
};

type GlGeometrySubject = {
  model: Matrix4;
};

/*
 ** Create a simple geometry mesh renderer with no material support.
 */
const createGlGeometryRenderer = <TScene extends GlGeometryScene>(
  binding: GlGeometryBinding<TScene>,
): GlGeometryRenderer<TScene> => {
  const { polygonBinding, sceneBinding, subjectBinding } = binding;
  const subjects = new Map<Symbol, GlMesh>();

  const renderMesh = (
    target: GlTarget,
    subjectBinding: GlShaderBinding<GlGeometrySubject>,
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
  type GlGeometryBinding,
  type GlGeometryRenderer,
  type GlGeometryScene,
  type GlGeometrySubject,
  createGlGeometryRenderer,
};
