import { Vector4 } from "../math/vector";

/**
 * Create a deterministic bright color value from arbitrary seed number.
 */
const brightColor = (seed: number): Vector4 => {
  const y = 0.8;
  const u = (((seed * 1.17) % 2) - 1) * 0.436;
  const v = (((seed * 1.43) % 2) - 1) * 0.615;

  return {
    x: Math.min(y + 1.13983 * v, 1),
    y: Math.min(y - 0.39465 * u - 0.5806 * v, 1),
    z: Math.min(y + 2.03211 * u, 1),
    w: 1,
  };
};

export { brightColor };
