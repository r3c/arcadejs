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

  public paint(target: GlTarget, subject: TScene): void {
    this.binding.bind(subject);

    target.draw(0, subject.index);
  }
}

export { SinglePainter };
