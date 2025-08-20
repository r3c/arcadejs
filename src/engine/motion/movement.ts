type Movement = {
  impulse(delta: number, friction: number, mass: number, dt: number): number;
};

// See: https://gafferongames.com/post/integration_basics/
const createSemiImplicitEulerMovement = (): Movement => {
  let velocity = 0;

  return {
    impulse: (delta, friction, mass, dt) => {
      const resistance = velocity * Math.min(dt * friction, 1);
      const acceleration = (delta * dt) / mass - resistance;

      velocity += acceleration;

      return velocity * dt;
    },
  };
};

export { type Movement, createSemiImplicitEulerMovement };
