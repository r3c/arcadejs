import { EasingType, getEasing } from "../math/easing";
import { Matrix3, Matrix4 } from "../math/matrix";
import { Quaternion } from "../math/quaternion";
import { Vector2, Vector3 } from "../math/vector";

type Camera = {
  update: (dt: number) => void;
  viewMatrix: Matrix4;
};

type BehindCameraConfiguration = {
  zoomInitial: number;
  zoomSpeed: number;
};

type BehindCameraInput = {
  getPosition: () => Vector3;
  getRotation: () => Quaternion;
  getZoom: () => number;
};

const createBehindCamera = (
  input: BehindCameraInput,
  configuration?: Partial<BehindCameraConfiguration>
): Camera => {
  const positionCurrent = Vector3.fromZero();
  const rotationCurrent = Quaternion.fromSource(input.getRotation());
  const rotationInverse = Quaternion.fromIdentity();
  const rotationMatrix3 = Matrix3.fromIdentity();
  const rotationMatrix4 = Matrix4.fromIdentity();
  const viewMatrix = Matrix4.fromIdentity();
  const zoomSpeed = configuration?.zoomSpeed ?? 1 / 8;

  let zoom = configuration?.zoomInitial ?? -25;

  return {
    update: () => {
      zoom += input.getZoom() * zoomSpeed;

      positionCurrent.set(input.getPosition());
      positionCurrent.negate();

      rotationCurrent.slerp(input.getRotation(), 0.05);
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
  easingDuration: number;
  easingType: EasingType;
  moveSpeed: number;
  positionInitial: Vector3;
  rotateSpeed: number;
  rotationInitial: Vector3;
  zoomSpeed: number;
};

type OrbitCameraInput = {
  getMove: () => Vector2;
  getRotate: () => Vector2;
  getZoom: () => number;
};

const createOrbitCamera = (
  input: OrbitCameraInput,
  initialPosition: Vector3,
  initialRotation: Vector2,
  configuration?: Partial<OrbitCameraConfiguration>
): Camera => {
  const easing = getEasing(configuration?.easingType ?? EasingType.Linear);
  const easingDuration = configuration?.easingDuration ?? 100;
  const moveSpeed = configuration?.moveSpeed ?? 1 / 64;
  const rotateSpeed = configuration?.rotateSpeed ?? 1 / 32;
  const viewMatrix = Matrix4.fromIdentity();
  const zoomSpeed = configuration?.zoomSpeed ?? 1 / 8;

  let position = initialPosition;
  let positionElapsed = easingDuration;
  let positionStart = position;
  let positionStop = position;
  let rotation = initialRotation;
  let rotationElapsed = easingDuration;
  let rotationStart = rotation;
  let rotationStop = rotation;

  return {
    update: (dt) => {
      const move = input.getMove();
      const rotate = input.getRotate();
      const zoom = input.getZoom();

      if (rotate.x !== 0 || rotate.y !== 0) {
        rotationElapsed = 0;
        rotationStart = rotation;
        rotationStop = {
          x: rotation.x - rotate.y * rotateSpeed,
          y: rotation.y - rotate.x * rotateSpeed,
        };
      }

      if (move.x !== 0 || move.y !== 0 || zoom !== 0) {
        positionElapsed = 0;
        positionStart = position;
        positionStop = {
          x: position.x + move.x * moveSpeed,
          y: position.y - move.y * moveSpeed,
          z: position.z + zoom * zoomSpeed,
        };
      }

      if (positionElapsed < easingDuration) {
        positionElapsed += dt;

        const ratio = easing(Math.min(positionElapsed / easingDuration, 1));

        position = {
          x: positionStart.x + (positionStop.x - positionStart.x) * ratio,
          y: positionStart.y + (positionStop.y - positionStart.y) * ratio,
          z: positionStart.z + (positionStop.z - positionStart.z) * ratio,
        };
      } else {
        position = positionStop;
      }

      if (rotationElapsed < easingDuration) {
        rotationElapsed += dt;

        const ratio = easing(Math.min(rotationElapsed / easingDuration, 1));

        rotation = {
          x: rotationStart.x + (rotationStop.x - rotationStart.x) * ratio,
          y: rotationStart.y + (rotationStop.y - rotationStart.y) * ratio,
        };
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
