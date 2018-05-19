import * as directive from "./directive";
import * as rgb from "./rgb";

// Heavily based on Khronos PBR in glTF 2.0 using WebGL:
// https://github.com/KhronosGroup/glTF-WebGL-PBR

const lightDeclare = (iblEnabledMacro: string) => `
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

// Calculation of the lighting contribution from an optional Image Based Light source.
// Precomputed Environment Maps are required uniform inputs and are computed as outlined in [1].
// See our README.md on Environment Maps [3] for additional discussion.
vec3 pbrIBLContribution(in sampler2D brdfMap, in samplerCube environmentDiffuseMap, in samplerCube environmentSpecularMap, in float roughness, in vec3 diffuseColor, in vec3 specularColor, in float NdotV, in vec3 normal, in vec3 reflection) {
	vec3 diffuseLight = ${rgb.standardToLinearInvoke("texture(environmentDiffuseMap, normal).rgb")};
	vec3 diffuse = diffuseLight * diffuseColor;

	vec3 brdf = ${rgb.standardToLinearInvoke("texture(brdfMap, vec2(NdotV, 1.0 - roughness)).rgb")};
	vec3 specularLight = ${rgb.standardToLinearInvoke("texture(environmentSpecularMap, reflection).rgb")};
	vec3 specular = specularLight * (specularColor * brdf.x + brdf.y);

	return diffuse + specular;
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

#ifdef ${iblEnabledMacro}
	vec3 pbrLight(in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection, in vec3 lightColor, in vec3 albedo, in float metalness, in float roughness, in sampler2D brdfMap, in samplerCube environmentDiffuseMap, in samplerCube environmentSpecularMap) {
#else
	vec3 pbrLight(in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection, in vec3 lightColor, in vec3 albedo, in float metalness, in float roughness) {
#endif
	const vec3 f0 = vec3(0.04);

	vec3 diffuseColor = albedo * (vec3(1.0) - f0) * (1.0 - metalness);
	vec3 specularColor = mix(f0, albedo, metalness);

	// Compute reflectance
	float reflectance = max(max(specularColor.r, specularColor.g), specularColor.b);
	float reflectance90 = clamp(reflectance * 25.0, 0.0, 1.0);

	vec3 specularEnvironmentR0 = specularColor.rgb;
	vec3 specularEnvironmentR90 = vec3(1.0, 1.0, 1.0) * reflectance90;

	vec3 halfwayDirection = normalize(lightDirection + eyeDirection);
	vec3 reflection = -normalize(reflect(eyeDirection, normal));

	float alphaRoughness = roughness * roughness;

	float NdotL = clamp(dot(normal, lightDirection), 0.001, 1.0);
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
	vec3 color = NdotL * lightColor * (diffuseContrib + specularContrib);

	#ifdef ${iblEnabledMacro}
		color += pbrIBLContribution(brdfMap, environmentDiffuseMap, environmentSpecularMap, roughness, diffuseColor, specularColor, NdotV, normal, reflection);
	#endif

	return color;
}`;

const lightInvoke = (normal: string, eyeDirection: string, lightDirection: string, lightColor: string, albedo: string, metalness: string, roughness: string, iblEnabledMacro: string, brdfMap: string, environmentDiffuseMap: string, environmentSpecularMap: string) => `
#ifdef ${iblEnabledMacro}
	pbrLight(${normal}, ${eyeDirection}, ${lightDirection}, ${lightColor}, ${albedo}, ${metalness}, ${roughness}, ${brdfMap}, ${environmentDiffuseMap}, ${environmentSpecularMap})
#else
	pbrLight(${normal}, ${eyeDirection}, ${lightDirection}, ${lightColor}, ${albedo}, ${metalness}, ${roughness})
#endif
`;

export { lightDeclare, lightInvoke }