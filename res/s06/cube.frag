#ifdef GL_ES
precision highp float;
#endif

struct Light
{
	bool enabled;
	vec3 position;
};

uniform vec4 colorBase;
uniform sampler2D colorMap;
uniform sampler2D glossMap;
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform float shininess;

uniform Light light0;
uniform Light light1;
uniform Light light2;

uniform bool useAmbient;
uniform bool useDiffuse;
uniform bool useHeightMap;
uniform bool useNormalMap;
uniform bool useSpecular;

varying vec3 camera;
varying vec2 coord;
varying vec3 normal;
varying vec3 point;

varying vec3 light0direction;
varying vec3 light1direction;
varying vec3 light2direction;

vec2 getCoord(in vec2 initialCoord, in vec3 cameraDirection, float parallaxScale, float parallaxBias) {
	float parallaxHeight = texture2D(heightMap, initialCoord).r;

	return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * cameraDirection.xy;
}

vec3 getLight(in vec2 coord, in vec3 normal, in vec3 cameraDirection, in vec3 lightDirection) {
	vec3 lightColor = vec3(0, 0, 0);

	if (useDiffuse) {
		vec3 diffuseLight = vec3(0.6, 0.6, 0.6);
		vec3 diffuseMaterial = texture2D(colorMap, coord).rgb; // FIXME: should use diffuseMap here
		float diffusePower = max(dot(normal, lightDirection), 0.0);

		lightColor += diffuseLight * diffuseMaterial * diffusePower;
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

		vec3 specularLight = vec3(1.0, 1.0, 1.0);
		vec3 specularMaterial = texture2D(colorMap, coord).rgb; // FIXME: should use specularMap here
		float specularPower = pow(specularCosine, shininess) * texture2D(glossMap, coord).r;

		lightColor += specularLight * specularMaterial * specularPower;
	}

	return lightColor;
}

void main(void) {
	vec3 cameraDirection = normalize(camera);
	vec3 lightColor = vec3(0, 0, 0);
	vec3 lightNormal;
	vec2 mapCoord;

	if (useHeightMap)
		mapCoord = getCoord(coord, cameraDirection, 0.04, 0.03);
	else
		mapCoord = coord;

	if (useNormalMap)
		lightNormal = normalize(2.0 * texture2D(normalMap, mapCoord).rgb - 1.0);
	else
		lightNormal = normalize(normal);

	if (useAmbient)
		lightColor += vec3(0.3, 0.3, 0.3) * colorBase.rgb * texture2D(colorMap, mapCoord).rgb;

	if (light0.enabled)
		lightColor += getLight(mapCoord, lightNormal, cameraDirection, normalize(light0direction));

	if (light1.enabled)
		lightColor += getLight(mapCoord, lightNormal, cameraDirection, normalize(light1direction));

	if (light2.enabled)
		lightColor += getLight(mapCoord, lightNormal, cameraDirection, normalize(light2direction));

	gl_FragColor = vec4(lightColor, colorBase.a); // FIXME: alpha shouldn't be used here
}
