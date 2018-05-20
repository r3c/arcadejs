import * as compiler from "./compiler";
import * as rgb from "./rgb";

const sampleType = "MaterialSample";

const sampleDeclare = (
	albedoEnableDirective: string,
	albedoEnableUniform: string,
	albedoSampler: string,
	albedoFactor: string,
	glossinessEnableDirective: string,
	glossinessEnableUniform: string,
	glossinessSampler: string,
	glossinessFactor: string,
	metalnessEnableDirective: string,
	metalnessEnableUniform: string,
	metalnessSampler: string,
	metalnessFactor: string,
	roughnessEnableDirective: string,
	roughnessEnableUniform: string,
	roughnessSampler: string,
	roughnessFactor: string,
	shininessValue: string) => `
struct ${sampleType} {
	vec3 albedo;
	float glossiness;
	float metalness;
	float roughness;
	float shininess;
};

${sampleType} materialSample(vec2 coord) {
	vec3 albedo = ${albedoFactor}.rgb * (bool(${compiler.getDirectiveOrValue(albedoEnableDirective, albedoEnableUniform)})
		? ${rgb.standardToLinearInvoke(`texture(${albedoSampler}, coord).rgb`)}
		: vec3(1.0));

	float glossiness = ${glossinessFactor} * (bool(${compiler.getDirectiveOrValue(glossinessEnableDirective, glossinessEnableUniform)})
		? texture(${glossinessSampler}, coord).r
		: 1.0);

	float metalness = ${metalnessFactor} * (bool(${compiler.getDirectiveOrValue(metalnessEnableDirective, metalnessEnableUniform)})
		? texture(${metalnessSampler}, coord).r
		: 1.0);

	float roughness = ${roughnessFactor} * (bool(${compiler.getDirectiveOrValue(roughnessEnableDirective, roughnessEnableUniform)})
		? texture(${roughnessSampler}, coord).r
		: 1.0);

	return ${sampleType}(
		albedo,
		glossiness,
		clamp(metalness, 0.0, 1.0),
		clamp(roughness, 0.04, 1.0),
		shininess
	);
}`;

const sampleInvoke = (coord: string) =>
	`materialSample(${coord})`;

export { sampleDeclare, sampleInvoke, sampleType }