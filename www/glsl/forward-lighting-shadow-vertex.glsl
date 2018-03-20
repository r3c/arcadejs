#version 300 es

#ifdef GL_ES
precision highp float;
#endif

const mat4 texUnitConverter = mat4(
	0.5, 0.0, 0.0, 0.0,
	0.0, 0.5, 0.0, 0.0,
	0.0, 0.0, 0.5, 0.0,
	0.5, 0.5, 0.5, 1.0
);

struct Light
{
	bool enabled;
	vec3 position;
};

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

uniform mat4 shadowProjectionMatrix;
uniform mat4 shadowViewMatrix;

uniform vec3 lightDirection;
uniform bool useNormalMap;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space (normal mapping disabled) or tangent space (normal mapping enabled)
out vec3 lightDirectionTransformed; // Direction of light in same space than eye vector
out vec3 normal; // Normal at point in same space than eye vector
out vec3 shadow; // Light intersection point in camera space

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

void main(void) {
	vec4 point = viewMatrix * modelMatrix * vec4(points, 1.0);

	vec3 pointCamera = point.xyz;
	vec3 eyeDirectionCamera = -pointCamera;
	vec4 shadowVector = texUnitConverter * shadowProjectionMatrix * shadowViewMatrix * modelMatrix * vec4(points, 1.0);

	coord = coords;
	shadow = shadowVector.xyz;

	vec3 n = normalize(normalMatrix * normals);
	vec3 t = normalize(normalMatrix * tangents);
	vec3 b = cross(n, t);

	if (useNormalMap) {
		vec3 lightDirectionCamera = normalize(toCameraDirection(lightDirection));

		lightDirectionTransformed = vec3(dot(lightDirectionCamera, t), dot(lightDirectionCamera, b), dot(lightDirectionCamera, n));

		eye = vec3(dot(eyeDirectionCamera, t), dot(eyeDirectionCamera, b), dot(eyeDirectionCamera, n));
		normal = vec3(0.0, 0.0, 1.0);
	}
	else {
		lightDirectionTransformed = normalize(toCameraDirection(lightDirection));

		eye = eyeDirectionCamera;
		normal = n;
	}

	gl_Position = projectionMatrix * point;
}
