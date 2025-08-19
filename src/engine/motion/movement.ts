import { Vector3 } from "../math/vector";

type Movement = {
  readonly currentVelocity: Vector3;

  nextFrame(impulse: Vector3, friction: number, mass: number, dt: number): void;
};

// See: https://gafferongames.com/post/integration_basics/
const createSemiImplicitEulerMovement = (): Movement => {
  const acceleration = Vector3.fromZero();
  const output = Vector3.fromZero();
  const resistance = Vector3.fromZero();
  const velocity = Vector3.fromZero();

  return {
    currentVelocity: output,
    nextFrame: (impulse, friction, mass, dt) => {
      resistance.set(velocity);
      resistance.scale(Math.min(dt * friction, 1));

      acceleration.set(impulse);
      acceleration.scale(dt / mass);
      acceleration.sub(resistance);

      velocity.add(acceleration);

      output.set(velocity);
      output.scale(dt);
    },
  };
};

export { type Movement, createSemiImplicitEulerMovement };
