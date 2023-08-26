import { GlPainter, GlTarget } from "../../webgl";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

class SinglePainter<TScene> implements GlPainter<TScene> {
  private readonly binding: GlShaderBinding<TScene>;
  private readonly indexGetter: (scene: TScene) => GlBuffer;

  public constructor(
    binding: GlShaderBinding<TScene>,
    indexGetter: (scene: TScene) => GlBuffer
  ) {
    this.binding = binding;
    this.indexGetter = indexGetter;
  }

  public paint(target: GlTarget, scene: TScene): void {
    this.binding.bind(scene);

    target.draw(0, this.indexGetter(scene));
  }
}

export { SinglePainter };
