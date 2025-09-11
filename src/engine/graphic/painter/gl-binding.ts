import { Painter } from "./definition";
import { GlTarget } from "../webgl";
import { GlBuffer } from "../webgl/resource";
import { GlShaderBinding } from "../webgl/shader";

const createGlBindingPainter = <TScene>(
  binding: GlShaderBinding<TScene>,
  indexGetter: (scene: TScene) => GlBuffer
): Painter<GlTarget, TScene> => {
  return {
    paint(target, scene) {
      binding.bind(scene);
      target.draw(0, WebGL2RenderingContext["TRIANGLES"], indexGetter(scene));
    },
  };
};

export { createGlBindingPainter };
