import { GlPainter, GlTarget } from "../../webgl";
import { GlBuffer } from "../resource";
import { GlShaderBinding } from "../shader";

class WirePainter<
  TObject,
  TScene extends {
    objects: Iterable<TObject>;
  }
> implements GlPainter<TScene>
{
  private readonly indexGetter: (object: TObject) => GlBuffer;
  private readonly sceneBinding: GlShaderBinding<TScene>;
  private readonly wireBinding: GlShaderBinding<TObject>;

  public constructor(
    sceneBinding: GlShaderBinding<TScene>,
    wireBinding: GlShaderBinding<TObject>,
    indexGetter: (object: TObject) => GlBuffer
  ) {
    this.indexGetter = indexGetter;
    this.sceneBinding = sceneBinding;
    this.wireBinding = wireBinding;
  }

  public paint(target: GlTarget, scene: TScene): void {
    this.sceneBinding.bind(scene);

    for (const object of scene.objects) {
      this.wireBinding.bind(object);

      target.draw(0, WebGL2RenderingContext["LINES"], this.indexGetter(object));
    }
  }
}

export { WirePainter };
