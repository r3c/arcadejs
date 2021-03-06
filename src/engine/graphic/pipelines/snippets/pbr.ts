import * as light from "./light";
import * as material from "./material";
import * as rgb from "./rgb";

// Heavily based on Khronos PBR in glTF 2.0 using WebGL:
// https://github.com/KhronosGroup/glTF-WebGL-PBR

const declare = (environmentEnableDirective: string, environmentBrdfMap: string, environmentDiffuseMap: string, environmentSpecularMap: string) => `
const vec3 PBR_F0 = vec3(0.04);
const float PBR_PI = 3.141592653589793;

// This calculates the specular geometric attenuation (aka G()),
// where rougher material will reflect less light back to the viewer.
// This implementation is based on [1] Equation 4, and we adopt their modifications to
// alphaRoughness as input as originally proposed in [2].
float pbrGeometricOcclusion(float roughness, float NdotL, float NdotV) {
	float roughnessSquare = roughness * roughness;
	float attenuationL = 2.0 * NdotL / (NdotL + sqrt(roughnessSquare + (1.0 - roughnessSquare) * (NdotL * NdotL)));
	float attenuationV = 2.0 * NdotV / (NdotV + sqrt(roughnessSquare + (1.0 - roughnessSquare) * (NdotV * NdotV)));

	return attenuationL * attenuationV;
}

// The following equation(s) model the distribution of microfacet normals across the area being drawn (aka D())
// Implementation from "Average Irregularity Representation of a Roughened Surface for Ray Reflection" by T. S. Trowbridge, and K. P. Reitz
// Follows the distribution function recommended in the SIGGRAPH 2013 course notes from EPIC Games [1], Equation 3.
float pbrMicrofacetDistribution(float roughness, float NdotH) {
	float roughnessSquare = roughness * roughness;
	float f = (NdotH * roughnessSquare - NdotH) * NdotH + 1.0;

	return roughnessSquare / (PBR_PI * f * f);
}

// The following equation models the Fresnel reflectance term of the spec equation (aka F())
// Implementation of fresnel from [4], Equation 15
vec3 pbrSpecularReflection(vec3 reflectance0, vec3 reflectance90, float VdotH) {
	return reflectance0 + (reflectance90 - reflectance0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);
}

// Calculation of the lighting contribution from an optional Image Based Light source.
// Precomputed Environment Maps are required uniform inputs and are computed as outlined in [1].
// See our README.md on Environment Maps [3] for additional discussion.
vec3 pbrEnvironment(in ${material.sampleType} material, in vec3 normal, in vec3 eyeDirection) {
	#ifdef ${environmentEnableDirective}
		vec3 diffuseColor = material.albedo * (vec3(1.0) - PBR_F0) * (1.0 - material.metalness);
		vec3 specularColor = mix(PBR_F0, material.albedo, material.metalness);

		vec3 diffuseLight = ${rgb.standardToLinearInvoke(`texture(${environmentDiffuseMap}, normal).rgb`)};
		vec3 diffuse = diffuseLight * diffuseColor;

		float NdotV = abs(dot(normal, eyeDirection)) + 0.001;
		vec3 brdf = ${rgb.standardToLinearInvoke(`texture(${environmentBrdfMap}, vec2(NdotV, 1.0 - material.roughness)).rgb`)};
		vec3 reflection = -normalize(reflect(eyeDirection, normal));

		vec3 specularLight = ${rgb.standardToLinearInvoke(`texture(${environmentSpecularMap}, reflection).rgb`)};
		vec3 specular = specularLight * (specularColor * brdf.x + brdf.y);

		return diffuse + specular;
	#else
		return material.albedo;
	#endif
}

vec3 pbrLight(in ${light.sourceTypeResult} light, in ${material.sampleType} material, in vec3 normal, in vec3 eyeDirection) {
	vec3 diffuseColor = material.albedo * (vec3(1.0) - PBR_F0) * (1.0 - material.metalness);
	vec3 specularColor = mix(PBR_F0, material.albedo, material.metalness);

	// Compute reflectance
	float reflectance = max(max(specularColor.r, specularColor.g), specularColor.b);
	float reflectance90 = clamp(reflectance * 25.0, 0.0, 1.0);

	vec3 specularEnvironmentR0 = specularColor.rgb;
	vec3 specularEnvironmentR90 = vec3(1.0, 1.0, 1.0) * reflectance90;
	vec3 halfwayDirection = normalize(light.direction + eyeDirection);

	float alphaRoughness = material.roughness * material.roughness;

	float NdotL = clamp(dot(normal, light.direction), 0.001, 1.0);
	float NdotV = abs(dot(normal, eyeDirection)) + 0.001;
	float NdotH = clamp(dot(normal, halfwayDirection), 0.0, 1.0);
	float VdotH = clamp(dot(eyeDirection, halfwayDirection), 0.0, 1.0);

	// Calculate the shading terms for the microfacet specular shading model
	vec3 F = pbrSpecularReflection(specularEnvironmentR0, specularEnvironmentR90, VdotH);
	float G = pbrGeometricOcclusion(alphaRoughness, NdotL, NdotV);
	float D = pbrMicrofacetDistribution(alphaRoughness, NdotH);

	// Calculation of analytical lighting contribution
	vec3 diffuseContrib = (1.0 - F) * diffuseColor / PBR_PI;
	vec3 specularContrib = F * G * D / (4.0 * NdotL * NdotV);

	// Obtain final intensity as reflectance (BRDF) scaled by the energy of the light (cosine law)
	return light.color * light.power * NdotL * (diffuseContrib + specularContrib);
}`;

const environmentInvoke = (material: string, normal: string, eyeDirection: string) =>
	`pbrEnvironment(${material}, ${normal}, ${eyeDirection})`;

const lightInvoke = (light: string, material: string, normal: string, eyeDirection: string) =>
	`pbrLight(${light}, ${material}, ${normal}, ${eyeDirection})`;

export { declare, environmentInvoke, lightInvoke }