const getDiffusePowerDeclare = `
float phongGetLightDiffuse(in vec3 normal, in vec3 lightDirection) {
	float lightNormalCosine = dot(normal, lightDirection);

	return clamp(lightNormalCosine, 0.0, 1.0);
}`;

const getDiffusePowerInvoke = (normal: string, lightDirection: string) =>
	`phongGetLightDiffuse(${normal}, ${lightDirection})`;

const getSpecularPowerDeclare = `
float phongGetLightSpecular(in vec3 normal, in vec3 lightDirection, in vec3 eyeDirection, in float shininess) {
	float lightNormalCosine = dot(normal, lightDirection);
	float lightVisible = sqrt(max(lightNormalCosine, 0.0));

	#ifdef LIGHT_MODEL_PHONG_STANDARD
		// Phong model
		vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - lightDirection);

		float lightCosine = max(dot(specularReflection, eyeDirection), 0.0);
	#else
		// Blinn-Phong model
		vec3 cameraLightMidway = normalize(eyeDirection + lightDirection);

		float lightCosine = max(dot(normal, cameraLightMidway), 0.0);
	#endif

	return pow(lightCosine, shininess) * lightVisible;
}`;

const getSpecularPowerInvoke = (normal: string, lightDirection: string, eyeDirection: string, shininess: string) =>
	`phongGetLightSpecular(${normal}, ${lightDirection}, ${eyeDirection}, ${shininess})`;

export { getDiffusePowerDeclare, getDiffusePowerInvoke, getSpecularPowerDeclare, getSpecularPowerInvoke }