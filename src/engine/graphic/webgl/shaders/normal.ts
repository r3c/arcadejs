import { GlShaderFunction } from "../language";

const normalDecode: GlShaderFunction<[], [string]> = {
  declare: (): string => `
  vec3 normalDecode(in vec2 normalPack) {
	  // Spheremap transform
	  // See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	  vec2 fenc = normalPack * 4.0 - 2.0;
	  float f = dot(fenc, fenc);
	  float g = sqrt(1.0 - f * 0.25);
  
	  return normalize(vec3(fenc * g, 1.0 - f * 0.5));
  }`,

  invoke: (packedNormal: string): string => `normalDecode(${packedNormal})`,
};

const normalEncode: GlShaderFunction<[], [string]> = {
  declare: (): string => `
vec2 normalEncode(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}`,

  invoke: (decoded: string): string => `normalEncode(${decoded})`,
};

const normalPerturb: GlShaderFunction<[], [string, string, string]> = {
  declare: (): string => `
	vec3 normalPerturb(in sampler2D sampler, in vec2 coord, in mat3 tbn) {
		vec3 normal = 2.0 * texture(sampler, coord).rgb - 1.0;
	
		return normalize(tbn * normal);
	}
	`,

  invoke: (sampler: string, coord: string, tbn: string): string =>
    `normalPerturb(${sampler}, ${coord}, ${tbn})`,
};

export { normalDecode, normalEncode, normalPerturb };
