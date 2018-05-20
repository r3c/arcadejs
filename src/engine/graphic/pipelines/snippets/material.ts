import * as compiler from "./compiler";
import * as rgb from "./rgb";

const sampleType = "MaterialSample";

const sampleDeclare = (
	albedoEnableDirective: string,
	albedoEnableUniform: string,
	albedoSampler: string,
	albedoFactor: string,
	glossEnableDirective: string,
	glossEnableUniform: string,
	glossSampler: string,
	glossFactor: string,
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
	vec3 gloss;
	float metalness;
	float roughness;
	float shininess;
};

${sampleType} materialSample(vec2 coord) {
	vec3 albedo = ${albedoFactor}.rgb * (${compiler.getBooleanDirectiveOrUniform(albedoEnableDirective, albedoEnableUniform)}
		? ${rgb.standardToLinearInvoke(`texture(${albedoSampler}, coord).rgb`)}
		: vec3(1.0));

	vec3 gloss = ${glossFactor}.rgb * (${compiler.getBooleanDirectiveOrUniform(glossEnableDirective, glossEnableUniform)}
		? ${rgb.standardToLinearInvoke(`texture(${glossSampler}, coord).rgb`)}
		: vec3(1.0));

	float metalness = ${metalnessFactor} * (${compiler.getBooleanDirectiveOrUniform(metalnessEnableDirective, metalnessEnableUniform)}
		? texture(${metalnessSampler}, coord).r
		: 1.0);

	float roughness = ${roughnessFactor} * (${compiler.getBooleanDirectiveOrUniform(roughnessEnableDirective, roughnessEnableUniform)}
		? texture(${roughnessSampler}, coord).r
		: 1.0);

	return ${sampleType}(
		albedo,
		gloss,
		clamp(metalness, 0.0, 1.0),
		clamp(roughness, 0.04, 1.0),
		shininess
	);
}`;

const sampleInvoke = (coord: string) =>
	`materialSample(${coord})`;

export { sampleDeclare, sampleInvoke, sampleType }