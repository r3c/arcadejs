import { GlShaderFunction } from "../shader";

const shininessDecode: GlShaderFunction<{}, { encoded: string }> = {
  declare: (): string => `
float shininessDecode(in float encoded) {
  return 1.0 / encoded - 1.0;
}`,

  invoke: ({ encoded }): string => `shininessDecode(${encoded})`,
};

const shininessEncode: GlShaderFunction<{}, { decoded: string }> = {
  declare: (): string => `
float shininessEncode(in float decoded) {
  return 1.0 / (max(decoded, 0.0) + 1.0);
}`,

  invoke: ({ decoded }): string => `shininessEncode(${decoded})`,
};

export { shininessDecode, shininessEncode };
