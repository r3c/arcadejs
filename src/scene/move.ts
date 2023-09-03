import { Vector3 } from "../engine/math/vector";

type Mover = (reference: Vector3, time: number) => Vector3;

const createCircleMover = (index: number): Mover => {
  const angle = generateAngle(index);

  return (reference, time) => {
    return {
      x: reference.x + Math.cos(angle + time),
      y: reference.y + Math.PI / 6,
      z: reference.z + Math.sin(angle + time),
    };
  };
};

const createRoundMover = (
  index: number,
  minRadius: number,
  maxRadius: number,
  height: number
): Mover => {
  const angle = generateAngle(index);
  const radius = minRadius + (maxRadius - minRadius) * generateWeight(index);
  const scale0 = generateScale(index + 0);
  const scale1 = generateScale(index + 1);

  return (reference, time) => {
    const u = angle + scale0 * time;
    const v = scale1 * time;

    return {
      x: reference.x + Math.cos(u) * radius,
      y: reference.y + Math.sin(v) * height,
      z: reference.z + Math.sin(u) * radius,
    };
  };
};

/**
 * Return deterministic angle given an index so that index sequence from 0 to N
 * converges to a uniform distribution along a 2*PI circle. The algorithm
 * considers rings of N uniformly distributed angles where N grows following
 * powers of 2. Each ring has an offset compared to previous one so they never
 * overlap.
 */
const generateAngle = (index: number): number => {
  if (index < 1) {
    return 0;
  }

  const ringCardinality = Math.pow(2, Math.floor(Math.log2(index)));
  const ringOffset = Math.PI / ringCardinality;
  const ringPosition = index - ringCardinality;

  return (ringPosition * Math.PI * 2) / ringCardinality + ringOffset;
};

/**
 * Return deterministic scaling factor between 0.5 and 1.5 from given index.
 */
const generateScale = (index: number): number => {
  return Math.sin(index * 56503) * 0.5 + 1;
};

/**
 * Return deterministic weight factor between 0 and 1 from given index.
 */
const generateWeight = (index: number): number => {
  return Math.sin(index * 46337) * 0.5 + 0.5;
};

export { type Mover, createCircleMover, createRoundMover as createOrbitMover };
