import { GlShaderFunction } from "../language";

const shininessDecode: GlShaderFunction<[string]> = {
  declare: (): string => `
float shininessDecode(in float encoded) {
	return 1.0 / encoded;
}`,

  invoke: (encoded: string): string => `shininessDecode(${encoded})`,
};

const shininessEncode: GlShaderFunction<[string]> = {
  declare: (): string => `
float shininessEncode(in float decoded) {
	return 1.0 / max(decoded, 1.0);
}`,

  invoke: (decoded: string): string => `shininessEncode(${decoded})`,
};

export { shininessDecode, shininessEncode };
