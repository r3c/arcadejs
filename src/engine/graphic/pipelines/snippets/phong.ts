import * as compiler from "./compiler";
import * as light from "./light";

const lightDeclare = (
  diffuseDirective: string,
  specularDirective: string
): string => `
float phongLightDiffusePower(in ${
  light.sourceTypeResult
} light, in vec3 normal) {
	float lightNormalCosine = dot(normal, light.direction);

	return clamp(lightNormalCosine, 0.0, 1.0);
}

float phongLightSpecularPower(in ${
  light.sourceTypeResult
} light, in float materialGlossiness, in float materialShininess, in vec3 normal, in vec3 eyeDirection) {
	float lightNormalCosine = dot(normal, light.direction);
	float lightVisible = sqrt(max(lightNormalCosine, 0.0));

	#ifdef LIGHT_MODEL_PHONG_STANDARD
		// Phong model
		vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - light.direction);

		float lightCosine = max(dot(specularReflection, eyeDirection), 0.0);
	#else
		// Blinn-Phong model
		vec3 cameraLightMidway = normalize(eyeDirection + light.direction);

		float lightCosine = max(dot(normal, cameraLightMidway), 0.0);
	#endif

	return materialGlossiness * pow(lightCosine, materialShininess) * lightVisible;
}

vec3 phongLight(in ${
  light.sourceTypeResult
} light, in vec3 materialAlbedo, in float materialGlossiness, in float materialShininess, in vec3 normal, in vec3 eyeDirection) {
	return light.power * (
		phongLightDiffusePower(light, normal) * light.color * materialAlbedo * float(${compiler.getDirectiveOrValue(
      diffuseDirective,
      "1.0"
    )}) +
		phongLightSpecularPower(light, materialGlossiness, materialShininess, normal, eyeDirection) * light.color * float(${compiler.getDirectiveOrValue(
      specularDirective,
      "1.0"
    )})
	);
}`;

const lightInvoke = (
  light: string,
  materialAlbedo: string,
  materialGloss: string,
  materialShininess: string,
  normal: string,
  eyeDirection: string
): string =>
  `phongLight(${light}, ${materialAlbedo}, ${materialGloss}, ${materialShininess}, ${normal}, ${eyeDirection})`;

const lightInvokeDiffusePower = (light: string, normal: string): string =>
  `phongLightDiffusePower(${light}, ${normal})`;

const lightInvokeSpecularPower = (
  light: string,
  materialGloss: string,
  materialShininess: string,
  normal: string,
  eyeDirection: string
): string =>
  `phongLightSpecularPower(${light}, ${materialGloss}, ${materialShininess}, ${normal}, ${eyeDirection})`;

export {
  lightDeclare,
  lightInvoke,
  lightInvokeDiffusePower,
  lightInvokeSpecularPower,
};
