#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform mat4 inverseProjectionMatrix;

uniform sampler2D depth;
uniform sampler2D normalAndSpecular;

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

vec3 getLightDiffuse(in vec3 normal, in vec3 lightDirection) {
	float lightAngle = dot(normal, lightDirection);

	if (lightAngle > 0.0 && applyDiffuse) {
		float lightPowerDiffuse = lightAngle;

		return lightColor * lightPowerDiffuse;
	}

	return vec3(0.0, 0.0, 0.0);
}

float getLightSpecular(in vec3 normal, in vec3 lightDirection, in vec3 eyeDirection, in float reflection, in float shininess) {
	float lightAngle = dot(normal, lightDirection);

	if (lightAngle > 0.0 && applySpecular) {
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

		return pow(lightSpecularCosine, shininess) * reflection;
	}

	return 0.0;
}

vec3 getPoint(in vec2 coord) {
	float depthClip = texture(depth, coord).r;
	vec4 pointClip = vec4(coord, depthClip, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	vec2 coord = vec2(gl_FragCoord.x / 800.0, gl_FragCoord.y / 600.0); // FIXME: hard-coded

	// Read samples from texture buffers
	vec4 normalAndSpecularSample = texture(normalAndSpecular, coord);

	// Decode geometry and material properties from samples
	vec3 normal = decodeNormal(normalAndSpecularSample.rg);
	float reflection = normalAndSpecularSample.a;
	float shininess = decodeInteger(normalAndSpecularSample.b);

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(coord);

	// Compute lightning power
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - lightDistance / lightRadius, 0.0);

	// Emit lighting parameters
	fragColor = vec4(
		getLightDiffuse(normal, lightDirection) * lightPower,
		getLightSpecular(normal, lightDirection, eyeDirection, reflection, shininess) * lightPower
	);
}
