import { Vector3 } from "../engine/math/vector";

/**
 * Return arbitrary number, continuous depending on `dt`.
 */
const at = (dt: number, index: number, prime: number): number => {
  const drift = (index + 1) * prime;
  const speed = Math.sin(drift) / 2 + 1;

  return dt * speed + drift * 0.001;
};

const orbitatePosition = (
  dt: number,
  index: number,
  minRadius: number,
  maxRadius: number
): Vector3 => {
  const amplitude = Math.sin(at(dt * 0.1, index, 193)) / 2 + 0.5;
  const angle = at(dt * 0.1, index, 97);
  const radius = minRadius + amplitude * (maxRadius - minRadius);
  const slope = at(dt * 0.1, index, 157) - 0.5;

  return {
    x: Math.cos(angle * Math.PI * 2) * radius,
    y: Math.sin(slope * Math.PI * 0.5),
    z: Math.sin(angle * Math.PI * 2) * radius,
  };
};

const rotateDirection = (dt: number, index: number): Vector3 => {
  const angle = at(dt * 0.1, index, 97);

  return {
    x: Math.cos(angle),
    y: (Math.PI * 1) / 6,
    z: Math.sin(angle),
  };
};

export { orbitatePosition, rotateDirection };
