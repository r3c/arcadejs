type EasingFunction = (ratio: number) => number;

const enum EasingType {
  Cubic,
  Linear,
  Quadratic,
  QuadraticOut,
}

const cubic: EasingFunction = (x) => x * x * x;
const linear: EasingFunction = (x) => x;
const quadratic: EasingFunction = (x) => x * x;
const quadraticOut: EasingFunction = (x) => 1 - (1 - x) * (1 - x);

const getEasing = (type: EasingType): EasingFunction => {
  switch (type) {
    case EasingType.Cubic:
      return cubic;

    case EasingType.Linear:
      return linear;

    case EasingType.Quadratic:
      return quadratic;

    case EasingType.QuadraticOut:
      return quadraticOut;

    default:
      throw new Error(`unknown easing type "${type}"`);
  }
};

export { type EasingFunction, EasingType, getEasing };
