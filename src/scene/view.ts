import * as controller from "../engine/io/controller";
import { Vector3 } from "../engine/math/vector";

const ease = (from: Vector3, to: Vector3, speed: number) => {
  return {
    x: from.x + (to.x - from.x) * speed,
    y: from.y + (to.y - from.y) * speed,
    z: from.z + (to.z - from.z) * speed,
  };
};

class Camera {
  public position: Vector3;
  public rotation: Vector3;

  private nextPosition: Vector3;
  private nextRotation: Vector3;

  public constructor(position: Vector3, rotation: Vector3) {
    this.nextPosition = position;
    this.nextRotation = rotation;
    this.position = position;
    this.rotation = rotation;
  }

  public move(input: controller.Input) {
    const movement = input.fetchMovement();
    const wheel = input.fetchWheel();

    const deltaPosition = {
      x: input.isPressed("mouseleft") ? movement.x / 64 : 0,
      y: input.isPressed("mouseleft") ? -movement.y / 64 : 0,
      z: wheel / 4,
    };

    const deltaRotation = {
      x: input.isPressed("mouseright") ? -movement.y / 64 : 0,
      y: input.isPressed("mouseright") ? -movement.x / 64 : 0,
      z: 0,
    };

    this.nextPosition = Vector3.add(this.nextPosition, deltaPosition);
    this.nextRotation = Vector3.add(this.nextRotation, deltaRotation);

    this.position = ease(this.position, this.nextPosition, 0.2);
    this.rotation = ease(this.rotation, this.nextRotation, 0.2);
  }
}

export { Camera };
