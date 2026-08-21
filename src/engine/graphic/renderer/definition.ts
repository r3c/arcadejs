import { Vector2 } from "../../math/vector";

type Renderer<TTarget, TScene> = {
  /**
   * Render scene.
   */
  render: (target: TTarget, scene: TScene) => void;

  /**
   * Resize rendering target.
   */
  setSize: (size: Vector2) => void;
};

export { type Renderer };
