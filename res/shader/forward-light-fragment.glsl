#ifdef GL_ES
precision highp float;
#endif

struct Light
{
	bool enabled;
	vec3 position;
};

uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform sampler2D reflectionMap;
uniform float shininess;
uniform vec4 specularColor;
uniform sampler2D specularMap;

uniform Light light0;
uniform Light light1;
uniform Light light2;

uniform bool useAmbient;
uniform bool useDiffuse;
uniform bool useHeightMap;
uniform bool useNormalMap;
uniform bool useSpecular;

varying vec2 coord;
varying vec3 eye;
varying vec3 normal;
varying vec3 point;

varying vec3 light0Direction;
varying vec3 light1Direction;
varying vec3 light2Direction;

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirection, float parallaxScale, float parallaxBias) {
	if (useHeightMap) {
		float parallaxHeight = texture2D(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirection.xy / eyeDirection.z;
	}
	else {
		return initialCoord;
	}
}

vec3 getLight(in vec2 coord, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection) {
	float lightAngle = dot(normal, lightDirection);
	vec3 lightColor = vec3(0, 0, 0);

	if (lightAngle > 0.0) {
		if (useDiffuse) {
			vec3 diffuseLight = vec3(0.6, 0.6, 0.6);
			vec3 diffuseMaterial = texture2D(diffuseMap, coord).rgb;
			float diffusePower = lightAngle;

			lightColor += diffuseColor.rgb * diffuseLight * diffuseMaterial * diffusePower;
		}

		if (useSpecular) {
			float specularCosine;

			if (true) {
				// Blinn-Phong model
				vec3 cameraLightMidway = normalize(eyeDirection + lightDirection);

				specularCosine = max(dot(normal, cameraLightMidway), 0.0);
			}
			else {
				// Phong model
				vec3 specularReflection = normalize(normal * lightAngle * 2.0 - lightDirection);

				specularCosine = max(dot(specularReflection, eyeDirection), 0.0);
			}

			vec3 specularLight = vec3(1.0, 1.0, 1.0);
			vec3 specularMaterial = texture2D(specularMap, coord).rgb;
			float specularPower = pow(specularCosine, shininess) * texture2D(reflectionMap, coord).r;

			lightColor += specularColor.rgb * specularLight * specularMaterial * specularPower;
		}
	}

	return lightColor;
}

vec3 getNormal(in vec3 initialNormal, in vec2 coord) {
	if (useNormalMap) {
		// Initial normal is always (0, 0, 1) here and can be safely ignored, see vertex shader
		return normalize(2.0 * texture2D(normalMap, coord).rgb - 1.0);
	}
	else {
		return normalize(initialNormal);
	}
}

void main(void) {
	vec3 eyeDirection = normalize(eye);
	vec2 modifiedCoord = getCoord(coord, eyeDirection, 0.04, 0.02);
	vec3 modifiedNormal = getNormal(normal, modifiedCoord);

	vec3 lightColor = vec3(0, 0, 0);

	if (useAmbient)
		lightColor += vec3(0.3, 0.3, 0.3) * ambientColor.rgb * texture2D(ambientMap, modifiedCoord).rgb;

	if (light0.enabled)
		lightColor += getLight(modifiedCoord, modifiedNormal, eyeDirection, normalize(light0Direction));

	if (light1.enabled)
		lightColor += getLight(modifiedCoord, modifiedNormal, eyeDirection, normalize(light1Direction));

	if (light2.enabled)
		lightColor += getLight(modifiedCoord, modifiedNormal, eyeDirection, normalize(light2Direction));

	gl_FragColor = vec4(lightColor, 1.0);
}
