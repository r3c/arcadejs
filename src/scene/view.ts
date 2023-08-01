import { Input } from "../engine/io/controller";
import { MutableVector3, Vector3 } from "../engine/math/vector";

const ease = (from: MutableVector3, to: Vector3, speed: number) => {
  from.add({
    x: (to.x - from.x) * speed,
    y: (to.y - from.y) * speed,
    z: (to.z - from.z) * speed,
  });
};

const positionEasing = 0.5;
const positionSpeed = 1 / 64;
const rotationEasing = 0.5;
const rotationSpeed = 1 / 64;

class Camera {
  public position: MutableVector3;
  public rotation: MutableVector3;

  private nextPosition: MutableVector3;
  private nextRotation: MutableVector3;

  public constructor(position: Vector3, rotation: Vector3) {
    this.nextPosition = Vector3.fromObject(position);
    this.nextRotation = Vector3.fromObject(rotation);
    this.position = Vector3.fromObject(position);
    this.rotation = Vector3.fromObject(rotation);
  }

  public move(input: Input) {
    const movement = input.fetchMovement();
    const wheel = input.fetchWheel();

    const deltaPosition = {
      x: input.isPressed("mouseleft") ? movement.x * positionSpeed : 0,
      y: input.isPressed("mouseleft") ? -movement.y * positionSpeed : 0,
      z: wheel / 4,
    };

    const deltaRotation = {
      x: input.isPressed("mouseright") ? -movement.y * rotationSpeed : 0,
      y: input.isPressed("mouseright") ? -movement.x * rotationSpeed : 0,
      z: 0,
    };

    this.nextPosition.add(deltaPosition);
    this.nextRotation.add(deltaRotation);

    ease(this.position, this.nextPosition, positionEasing);
    ease(this.rotation, this.nextRotation, rotationEasing);
  }
}

export { Camera };
