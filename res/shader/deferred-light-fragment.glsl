#ifdef GL_ES
precision highp float;
#endif

uniform mat4 inverseProjectionMatrix;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndReflection;

uniform bool applyDiffuse;
uniform bool applySpecular;

uniform vec3 lightColorDiffuse;
uniform vec3 lightColorSpecular;
uniform vec3 lightPosition;
uniform float lightRadius;

varying vec3 lightPositionCamera;

vec3 getLight(in vec3 albedo, in float reflection, in float shininess, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection) {
	float lightAngle = dot(normal, lightDirection);
	vec3 lightColor = vec3(0, 0, 0);

	if (lightAngle > 0.0) {
		// Apply diffuse lightning
		if (applyDiffuse) {
			float lightPowerDiffuse = lightAngle;

			lightColor += albedo * lightColorDiffuse * lightPowerDiffuse;
		}

		// Apply specular lightning
		if (applySpecular) {
			float lightSpecularCosine;

			if (true) {
				// Blinn-Phong model
				vec3 cameraLightMidway = normalize(eyeDirection + lightDirection);

				lightSpecularCosine = max(dot(normal, cameraLightMidway), 0.0);
			}
			else {
				// Phong model
				vec3 specularReflection = normalize(normal * lightAngle * 2.0 - lightDirection);

				lightSpecularCosine = max(dot(specularReflection, eyeDirection), 0.0);
			}

			float lightPowerSpecular = pow(lightSpecularCosine, shininess) * reflection;

			lightColor += albedo * lightColorSpecular * lightPowerSpecular;
		}
	}

	return lightColor;
}

vec3 getNormal(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}

vec3 getPoint(in vec2 coord) {
	float depthClip = texture2D(depth, coord).r;
	vec4 pointClip = vec4(coord, depthClip, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	vec2 coord = vec2(gl_FragCoord.x / 800.0, gl_FragCoord.y / 600.0); // FIXME: hard-coded

	// Read samples from texture buffers
	vec4 albedoAndShininessSample = texture2D(albedoAndShininess, coord);
	vec4 normalAndReflectionSample = texture2D(normalAndReflection, coord);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;
	vec3 normal = getNormal(normalAndReflectionSample.rg);
	float reflection = normalAndReflectionSample.a;
	float shininess = 1.0 / albedoAndShininessSample.a - 1.0;

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(coord);

	// Compute lightning
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - lightDistance / lightRadius, 0.0);

	vec3 color = getLight(albedo, reflection, shininess, normal, eyeDirection, lightDirection) * lightPower;

	gl_FragColor = vec4(color, 1.0);
}
