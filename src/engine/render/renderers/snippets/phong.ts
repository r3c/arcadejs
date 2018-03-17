const ambientDeclare = `
float getLightAmbient() {
	#if LIGHT_MODEL >= LIGHT_MODEL_AMBIENT
		return 1.0;
	#else
		return 0.0;
	#endif
}`;

const ambientInvoke = () => `
getLightAmbient()`;

const diffuseDeclare = `
float getLightDiffuse(in vec3 normal, in vec3 lightDirection) {
	#if LIGHT_MODEL >= LIGHT_MODEL_LAMBERT
		float lightNormalCosine = dot(normal, lightDirection);

		return clamp(lightNormalCosine, 0.0, 1.0);
	#else
		return 0.0;
	#endif
}`;

const diffuseInvoke = (normal: string, lightDirection: string) => `
getLightDiffuse(${normal}, ${lightDirection})
`;

const modelDeclare = `
#define LIGHT_MODEL_AMBIENT 1
#define LIGHT_MODEL_LAMBERT 2
#define LIGHT_MODEL_PHONG 3
`;

const modelName = "LIGHT_MODEL";

const specularDeclare = `
float getLightSpecular(in vec3 normal, in vec3 lightDirection, in vec3 eyeDirection, in float shininess) {
	#if LIGHT_MODEL >= LIGHT_MODEL_PHONG
		float lightNormalCosine = dot(normal, lightDirection);
		float lightVisible = step(0.0, lightNormalCosine);
		float lightSpecularCosine;

		#ifdef LIGHT_MODEL_PHONG_STANDARD
			// Phong model
			vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - lightDirection);

			lightSpecularCosine = max(dot(specularReflection, eyeDirection), 0.0);
		#else
			// Blinn-Phong model
			vec3 cameraLightMidway = normalize(eyeDirection + lightDirection);

			lightSpecularCosine = max(dot(normal, cameraLightMidway), 0.0);
		#endif

		return pow(lightSpecularCosine, shininess) * lightVisible;
	#else
		return 0.0;
	#endif
}`;

const specularInvoke = (normal: string, lightDirection: string, eyeDirection: string, shininess: string) => `
getLightSpecular(${normal}, ${lightDirection}, ${eyeDirection}, ${shininess})
`;

export { ambientDeclare, ambientInvoke, diffuseDeclare, diffuseInvoke, modelDeclare, modelName, specularDeclare, specularInvoke }