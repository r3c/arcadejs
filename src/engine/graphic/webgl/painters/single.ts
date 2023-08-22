import { GlPainter, GlTarget } from "../../webgl";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

type SingleScene = {
  index: GlBuffer;
};

class SinglePainter<TScene extends SingleScene> implements GlPainter<TScene> {
  private readonly binding: GlShaderBinding<TScene>;

  public constructor(binding: GlShaderBinding<TScene>) {
    this.binding = binding;
  }

  public paint(target: GlTarget, scene: TScene): void {
    this.binding.bind(scene);

    target.draw(0, scene.index);
  }
}

export { SinglePainter };
