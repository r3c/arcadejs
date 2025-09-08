import { Vector2 } from "../../math/vector";

type Renderer<TScene, TSubject, TAction> = {
  /**
   * Append subject to renderer.
   */
  append: (subject: TSubject) => RendererHandle<TAction>;

  /**
   * Render scene.
   */
  render: (scene: TScene) => void;

  /**
   * Resize rendering target.
   */
  resize: (size: Vector2) => void;
};

type RendererHandle<TAction> = {
  action: TAction;
  remove: () => void;
};

export { type Renderer, type RendererHandle };
