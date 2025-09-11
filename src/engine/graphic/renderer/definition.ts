import { Vector2 } from "../../math/vector";

type Renderer<TTarget, TScene, TSubject, THandle> = {
  /**
   * Append subject to renderer.
   */
  append: (subject: TSubject) => THandle;

  /**
   * Render scene.
   */
  render: (target: TTarget, scene: TScene) => void;

  /**
   * Resize rendering target.
   */
  resize: (size: Vector2) => void;
};

export { type Renderer };
