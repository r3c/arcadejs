import { Input } from "../engine/io/controller";
import { EasingType, getEasing } from "../engine/math/easing";
import { Vector3 } from "../engine/math/vector";

const interpolate = (
  from: Vector3,
  to: Vector3,
  elapsed: number,
  duration: number,
  type: EasingType
) => {
  const easing = getEasing(type);
  const ratio = easing(Math.min(elapsed / duration, 1));

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
    z: from.z + (to.z - from.z) * ratio,
  };
};

const moveSpeed = 1 / 64;
const rotateSpeed = 1 / 32;
const zoomSpeed = 1;

const positionDuration = 100;
const positionEasing = EasingType.QuadraticOut;
const rotationDuration = 100;
const rotationEasing = EasingType.QuadraticOut;

class Camera {
  public position: Vector3;
  public rotation: Vector3;

  private positionElapsed: number;
  private positionStart: Vector3;
  private positionStop: Vector3;
  private rotationElapsed: number;
  private rotationStart: Vector3;
  private rotationStop: Vector3;

  public constructor(position: Vector3, rotation: Vector3) {
    this.position = position;
    this.positionElapsed = positionDuration;
    this.positionStart = position;
    this.positionStop = position;
    this.rotation = rotation;
    this.rotationElapsed = rotationDuration;
    this.rotationStart = rotation;
    this.rotationStop = rotation;
  }

  public move(input: Input, elapsed: number) {
    const { x, y } = input.fetchMovement();
    const wheel = input.fetchWheel();

    const isMoving = input.isPressed("mouseleft") && (x !== 0 || y !== 0);
    const isRotating = input.isPressed("mouseright") && (x !== 0 || y !== 0);
    const isZooming = wheel !== 0;

    if (isRotating) {
      this.rotationElapsed = 0;
      this.rotationStart = this.rotation;
      this.rotationStop = {
        x: this.rotation.x - y * rotateSpeed,
        y: this.rotation.y - x * rotateSpeed,
        z: this.rotation.z,
      };
    }

    if (isMoving || isZooming) {
      this.positionElapsed = 0;
      this.positionStart = this.position;
      this.positionStop = {
        x: this.position.x + (isMoving ? x * moveSpeed : 0),
        y: this.position.y - (isMoving ? y * moveSpeed : 0),
        z: this.position.z + (isZooming ? wheel * zoomSpeed : 0),
      };
    }

    if (this.positionElapsed < positionDuration) {
      this.positionElapsed += elapsed;
      this.position = interpolate(
        this.positionStart,
        this.positionStop,
        this.positionElapsed,
        positionDuration,
        positionEasing
      );
    } else {
      this.position = this.positionStop;
    }

    if (this.rotationElapsed < rotationDuration) {
      this.rotationElapsed += elapsed;
      this.rotation = interpolate(
        this.rotationStart,
        this.rotationStop,
        this.rotationElapsed,
        rotationDuration,
        rotationEasing
      );
    } else {
      this.rotation = this.rotationStop;
    }
  }
}

export { Camera };
