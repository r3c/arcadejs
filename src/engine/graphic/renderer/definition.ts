import { MutableMatrix4 } from "../../math/matrix";
import { Vector2 } from "../../math/vector";

type Renderer<TScene, TSubject> = {
  /**
   * Register subject into current renderer.
   */
  register: (subject: TSubject) => RendererSubject;

  /**
   * Render scene.
   */
  render: (scene: TScene) => void;

  /**
   * Resize rendering target.
   */
  resize: (size: Vector2) => void;
};

type RendererSubject = {
  remove: () => void;
  transform: MutableMatrix4;
};

export { type Renderer, type RendererSubject };
