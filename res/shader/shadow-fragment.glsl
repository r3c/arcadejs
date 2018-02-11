#ifdef GL_ES
precision highp float;
#endif

uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform sampler2D reflectionMap;
uniform float shininess;
uniform sampler2D shadowMap;
uniform vec4 specularColor;
uniform sampler2D specularMap;

uniform bool useAmbient;
uniform bool useDiffuse;
uniform bool useHeightMap;
uniform bool useNormalMap;
uniform bool useSpecular;

varying vec3 camera;
varying vec2 coord;
varying vec3 normal;
varying vec3 point;

varying vec4 shadowPos;

varying vec3 lightDirectionFinal;

vec2 getCoord(in vec2 initialCoord, in vec3 cameraDirection, float parallaxScale, float parallaxBias) {
	float parallaxHeight = texture2D(heightMap, initialCoord).r;

	return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * cameraDirection.xy / cameraDirection.z;
}

vec3 getLight(in vec2 coord, in vec3 normal, in vec3 cameraDirection, in vec3 lightDirection) {
	float lightAngle = dot(normal, lightDirection);
	vec3 lightColor = vec3(0, 0, 0);

	if (lightAngle > 0.0) {
		if (useDiffuse) {
			vec3 diffuseLight = vec3(0.8, 0.8, 0.8);
			vec3 diffuseMaterial = texture2D(diffuseMap, coord).rgb;
			float diffusePower = lightAngle;

			lightColor += diffuseColor.rgb * diffuseLight * diffuseMaterial * diffusePower;
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
				vec3 specularReflection = normalize(normal * lightAngle * 2.0 - lightDirection);

				specularCosine = max(dot(specularReflection, cameraDirection), 0.0);
			}

			vec3 specularLight = vec3(1.0, 1.0, 1.0);
			vec3 specularMaterial = texture2D(specularMap, coord).rgb;
			float specularPower = pow(specularCosine, shininess) * texture2D(reflectionMap, coord).r;

			lightColor += specularColor.rgb * specularLight * specularMaterial * specularPower;
		}
	}

	return lightColor;
}

void main(void) {
	vec3 cameraDirection = normalize(camera);
	vec3 lightColor = vec3(0, 0, 0);
	vec3 lightNormal;
	vec2 mapCoord;

	if (useHeightMap)
		mapCoord = getCoord(coord, cameraDirection, 0.04, 0.02);
	else
		mapCoord = coord;

	if (useNormalMap)
		lightNormal = normalize(2.0 * texture2D(normalMap, mapCoord).rgb - 1.0);
	else
		lightNormal = normalize(normal);

	if (useAmbient)
		lightColor += vec3(0.2, 0.2, 0.2) * ambientColor.rgb * texture2D(ambientMap, mapCoord).rgb;

	vec3 depth = shadowPos.xyz / shadowPos.w;

	if (texture2D(shadowMap, depth.xy).r > depth.z)
		lightColor += getLight(mapCoord, lightNormal, cameraDirection, normalize(lightDirectionFinal));

	gl_FragColor = vec4(lightColor, ambientColor.a); // FIXME: alpha shouldn't be used here
}
