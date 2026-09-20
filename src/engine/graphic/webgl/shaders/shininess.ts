import { createSingletonFunction, shader } from "../shader";

const shininessDecode = createSingletonFunction<{ encoded: string }>(
  shader`\
float shininessDecode(in float encoded) {
  return 1.0 / encoded - 1.0;
}`,
  ({ encoded }) => `shininessDecode(${encoded})`,
);

const shininessEncode = createSingletonFunction<{ decoded: string }>(
  shader`\
float shininessEncode(in float decoded) {
  return 1.0 / (max(decoded, 0.0) + 1.0);
}`,
  ({ decoded }) => `shininessEncode(${decoded})`,
);

export { shininessDecode, shininessEncode };
