#ifdef GL_ES
precision highp float;
#endif

struct Light
{
	bool enabled;
	vec3 position;
};

varying vec3 vCamera;
varying vec4 vColor;
varying vec2 vCoord;
varying vec3 vNormal;
varying vec3 vPoint;

uniform vec4 colorBase;
uniform sampler2D colorMap;

uniform Light light0;
uniform Light light1;
uniform Light light2;

uniform bool useAmbient;
uniform bool useDiffuse;
uniform bool useSpecular;

vec3 getLight(in vec3 normal, in vec3 cameraDirection, in vec3 lightDirection) {
	vec3 lightColor = vec3(0, 0, 0);

	if (useDiffuse) {
		vec3 diffuseColor = vec3(0.6, 0.6, 0.6);
		float diffusePower = max(dot(normal, lightDirection), 0.0);

		lightColor += diffuseColor * diffusePower;
	}

	if (useSpecular) {
		float specularCosine;

		if (true) {
			// Blinn-Phong model
			vec3 cameraLightMidway = normalize(cameraDirection + lightDirection);

			specularCosine = max(dot(normal, cameraLightMidway), 0.0);
		}
		else {
			// Phong model
			vec3 specularReflection = normalize(normal * dot(normal, lightDirection) * 2.0 - lightDirection);

			specularCosine = max(dot(specularReflection, cameraDirection), 0.0);
		}

		vec3 specularColor = vec3(0.9, 0.9, 0.9);
		float specularPower = pow(specularCosine, 100.0);

		lightColor += specularColor * specularPower;
	}

	return lightColor;
}

void main(void) {
	vec3 lightColor = vec3(0, 0, 0);
	vec3 normal = normalize(vNormal);

	if (useAmbient)
		lightColor += vec3(0.3, 0.3, 0.3);

	if (light0.enabled)
		lightColor += getLight(normal, normalize(vCamera), normalize(light0.position - vPoint));

	if (light1.enabled)
		lightColor += getLight(normal, normalize(vCamera), normalize(light1.position - vPoint));

	if (light2.enabled)
		lightColor += getLight(normal, normalize(vCamera), normalize(light2.position - vPoint));

	gl_FragColor = vColor * colorBase * vec4(lightColor, 1.0) * texture2D(colorMap, vCoord);
}
