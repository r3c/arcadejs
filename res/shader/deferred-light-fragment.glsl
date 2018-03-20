#ifdef GL_ES
precision highp float;
#endif

uniform mat4 inverseProjectionMatrix;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndReflection;

uniform bool applyDiffuse;
uniform bool applySpecular;
uniform vec3 lightPosition;
uniform float lightRadius;

varying vec3 lightPositionCamera;

vec3 getLight(in vec3 albedo, in float reflection, in float shininess, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection) {
	float lightAngle = dot(normal, lightDirection);
	vec3 lightColor = vec3(0, 0, 0);

	if (lightAngle > 0.0) {
		if (applyDiffuse) {
			// Apply diffuse lightning
			vec3 lightDiffuseColor = vec3(0.6, 0.6, 0.6);
			float lightDiffusePower = lightAngle;

			lightColor += albedo * lightDiffuseColor * lightDiffusePower;
		}

		if (applySpecular) {
			// Apply specular lightning
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

			vec3 lightSpecularColor = vec3(1.0, 1.0, 1.0);
			float lightSpecularPower = pow(lightSpecularCosine, shininess) * reflection;

			lightColor += albedo * lightSpecularColor * lightSpecularPower;
		}
	}

	return lightColor;
}

vec3 getNormal(in vec2 coord) {
	return normalize(texture2D(normalAndReflection, coord).rgb * 2.0 - 1.0);
}

vec3 getPoint(in vec2 coord) {
	float depthClip = texture2D(depth, coord).r;
	vec4 pointClip = vec4(coord, depthClip, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	// Unpack geometry properties
	vec2 coord = vec2(gl_FragCoord.x / 800.0, gl_FragCoord.y / 600.0); // FIXME: hard-coded

	// Read geometry in camera space from buffers
	vec3 normal = getNormal(coord);
	vec3 point = getPoint(coord);

	// Read material properties from buffers
	vec3 albedo = texture2D(albedoAndShininess, coord).rgb;
	float reflection = texture2D(normalAndReflection, coord).a;
	float shininess = 1.0 / texture2D(albedoAndShininess, coord).a - 1.0;

	// Compute lightning
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - (lightDistance * lightDistance) / (lightRadius * lightRadius), 0.0);

	vec3 color = getLight(albedo, reflection, shininess, normal, eyeDirection, lightDirection) * lightPower;

	gl_FragColor = vec4(color, 1.0);
}
