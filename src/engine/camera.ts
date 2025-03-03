import { Input, Pointer } from "./io/controller";
import { EasingFunction, EasingType, getEasing } from "./math/easing";
import { Matrix3, Matrix4 } from "./math/matrix";
import { Quaternion } from "./math/quaternion";
import { Vector3 } from "./math/vector";

type Camera = {
  update: (dt: number) => void;
  viewMatrix: Matrix4;
};

const interpolate = (
  from: Vector3,
  to: Vector3,
  elapsed: number,
  duration: number,
  easing: EasingFunction
) => {
  const ratio = easing(Math.min(elapsed / duration, 1));

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
    z: from.z + (to.z - from.z) * ratio,
  };
};

const createBehindCamera = (
  input: Input,
  position: Vector3,
  rotation: Quaternion
): Camera => {
  const positionCurrent = Vector3.fromZero();
  const rotationCurrent = Quaternion.fromSource(rotation);
  const rotationInverse = Quaternion.fromIdentity();
  const rotationMatrix3 = Matrix3.fromIdentity();
  const rotationMatrix4 = Matrix4.fromIdentity();
  const viewMatrix = Matrix4.fromIdentity();

  let zoom = -25;

  return {
    update: () => {
      zoom += input.fetchZoom() * 0.2;

      positionCurrent.set(position);
      positionCurrent.negate();

      rotationCurrent.slerp(rotation, 0.05);
      rotationInverse.set(rotationCurrent);
      rotationInverse.conjugate();
      rotationMatrix3.setFromQuaternion(rotationInverse);
      rotationMatrix4.setFromRotationPosition(rotationMatrix3, Vector3.zero);

      viewMatrix.set(Matrix4.identity);
      viewMatrix.translate({ x: 0, y: 0, z: zoom });
      viewMatrix.rotate({ x: 0, y: 1, z: 0 }, Math.PI);
      viewMatrix.multiply(rotationMatrix4);
      viewMatrix.translate(positionCurrent);
    },
    viewMatrix,
  };
};

type OrbitCameraConfiguration = {
  positionDuration: number;
  positionEasingType: EasingType;
  positionInitial: Vector3;
  rotationDuration: number;
  rotationEasingType: EasingType;
  rotationInitial: Vector3;
  moveSpeed: number;
  rotationSpeed: number;
  zoomSpeed: number;
};

const createOrbitCamera = (
  input: Input,
  initialPosition: Vector3,
  initialRotation: Vector3,
  configuration?: Partial<OrbitCameraConfiguration>
): Camera => {
  const moveSpeed = configuration?.moveSpeed ?? 1 / 64;
  const positionDuration = configuration?.positionDuration ?? 100;
  const positionEasing = getEasing(
    configuration?.positionEasingType ?? EasingType.Linear
  );
  const rotationDuration = configuration?.rotationDuration ?? 100;
  const rotationEasing = getEasing(
    configuration?.rotationEasingType ?? EasingType.Linear
  );
  const rotationSpeed = configuration?.rotationSpeed ?? 1 / 32;
  const viewMatrix = Matrix4.fromIdentity();
  const zoomSpeed = configuration?.zoomSpeed ?? 1 / 8;

  let position = initialPosition ?? Vector3.zero;
  let positionElapsed = positionDuration;
  let positionStart = position;
  let positionStop = position;
  let rotation = initialRotation ?? Vector3.zero;
  let rotationElapsed = rotationDuration;
  let rotationStart = rotation;
  let rotationStop = rotation;

  return {
    update: (dt) => {
      const focusMovement = input.fetchMove(Pointer.Grab);
      const grabMovement = input.fetchMove(Pointer.Drag);
      const zoom = input.fetchZoom();

      if (focusMovement.x !== 0 || focusMovement.y !== 0) {
        rotationElapsed = 0;
        rotationStart = rotation;
        rotationStop = {
          x: rotation.x - focusMovement.y * rotationSpeed,
          y: rotation.y - focusMovement.x * rotationSpeed,
          z: rotation.z,
        };
      }

      if (grabMovement.x !== 0 || grabMovement.y !== 0 || zoom !== 0) {
        positionElapsed = 0;
        positionStart = position;
        positionStop = {
          x: position.x + grabMovement.x * moveSpeed,
          y: position.y - grabMovement.y * moveSpeed,
          z: position.z + zoom * zoomSpeed,
        };
      }

      if (positionElapsed < positionDuration) {
        positionElapsed += dt;
        position = interpolate(
          positionStart,
          positionStop,
          positionElapsed,
          positionDuration,
          positionEasing
        );
      } else {
        position = positionStop;
      }

      if (rotationElapsed < rotationDuration) {
        rotationElapsed += dt;
        rotation = interpolate(
          rotationStart,
          rotationStop,
          rotationElapsed,
          rotationDuration,
          rotationEasing
        );
      } else {
        rotation = rotationStop;
      }

      viewMatrix.set(Matrix4.identity);
      viewMatrix.translate(position);
      viewMatrix.rotate({ x: 1, y: 0, z: 0 }, rotation.x);
      viewMatrix.rotate({ x: 0, y: 1, z: 0 }, rotation.y);
    },
    viewMatrix,
  };
};

export { type Camera, createBehindCamera, createOrbitCamera };
