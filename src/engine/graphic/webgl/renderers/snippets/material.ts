import { standardToLinearInvoke } from "./rgb";

const sampleType = "MaterialSample";

const sampleDeclare = (
  albedoSampler: string,
  albedoFactor: string,
  glossinessSampler: string,
  glossinessFactor: string,
  metalnessSampler: string,
  metalnessFactor: string,
  roughnessSampler: string,
  roughnessFactor: string,
  _shininessValue: string
): string => `
struct ${sampleType} {
	vec3 albedo;
	float glossiness;
	float metalness;
	float roughness;
	float shininess;
};

${sampleType} materialSample(vec2 coord) {
	vec3 albedo = ${albedoFactor}.rgb * ${standardToLinearInvoke(
  `texture(${albedoSampler}, coord).rgb`
)};
	float glossiness = ${glossinessFactor} * texture(${glossinessSampler}, coord).r;
	float metalness = ${metalnessFactor} * texture(${metalnessSampler}, coord).r;
	float roughness = ${roughnessFactor} * texture(${roughnessSampler}, coord).r;

	return ${sampleType}(
		albedo,
		glossiness,
		clamp(metalness, 0.0, 1.0),
		clamp(roughness, 0.04, 1.0),
		shininess
	);
}`;

const sampleInvoke = (coord: string): string => `materialSample(${coord})`;

export { sampleDeclare, sampleInvoke, sampleType };
