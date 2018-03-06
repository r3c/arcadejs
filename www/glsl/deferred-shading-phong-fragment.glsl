uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndReflection;

uniform bool applyDiffuse;
uniform bool applySpecular;

uniform vec3 lightColor;
uniform vec3 lightPosition;
uniform float lightRadius;

in vec3 lightPositionCamera;

layout(location=0) out vec4 fragColor;

float decodeInteger(in float encoded) {
	return encoded * 256.0;
}

vec3 decodeNormal(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}

vec3 getLight(in vec3 normal, in vec3 lightDirection, in vec3 eyeDirection, in float specularColor, in float shininess) {
	float lightAngle = dot(normal, lightDirection);
	vec3 lightOutput = vec3(0, 0, 0);

	if (lightAngle > 0.0) {
		// Apply diffuse lightning
		if (applyDiffuse) {
			float lightPowerDiffuse = lightAngle;

			lightOutput += lightColor * lightPowerDiffuse;
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

			float lightPowerSpecular = pow(lightSpecularCosine, shininess) * specularColor;

			lightOutput += lightColor * lightPowerSpecular;
		}
	}

	return lightOutput;
}

vec3 getPoint(in float depthClip) {
	vec4 pointClip = vec4(gl_FragCoord.xy / viewportSize, depthClip, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

	// Read samples from texture buffers
	vec4 albedoAndShininessSample = texelFetch(albedoAndShininess, bufferCoord, 0);
	vec4 depthSample = texelFetch(depth, bufferCoord, 0);
	vec4 normalAndReflectionSample = texelFetch(normalAndReflection, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;
	vec3 normal = decodeNormal(normalAndReflectionSample.rg);
	float specularColor = normalAndReflectionSample.a;
	float shininess = decodeInteger(albedoAndShininessSample.a);

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(depthSample.r);

	// Compute lightning
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - lightDistance / lightRadius, 0.0);

	vec3 light = getLight(normal, lightDirection, eyeDirection, specularColor, shininess) * lightPower;

	fragColor = vec4(albedo * light, 1.0);
}
