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

attribute vec2 coords;
attribute vec3 normals;
attribute vec3 points;
attribute vec3 tangents;

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

uniform mat4 shadowProjectionMatrix;
uniform mat4 shadowViewMatrix;

uniform vec3 lightDirection;
uniform bool useNormalMap;

varying vec2 coord; // Texture coordinate
varying vec3 eye; // Direction from point to eye in camera space (normal mapping disabled) or tangent space (normal mapping enabled)
varying vec3 lightDirectionTransformed; // Direction of light in same space than eye vector
varying vec3 normal; // Normal at point in same space than eye vector
varying vec3 shadow; // Light intersection point in camera space

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
