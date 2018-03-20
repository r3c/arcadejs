#ifdef GL_ES
precision highp float;
#endif

attribute vec2 coords;
attribute vec3 normals;
attribute vec3 points;
attribute vec3 tangents;

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

uniform bool useHeightMap;
uniform bool useNormalMap;

varying vec3 bitangent; // Bitangent at point in camera space
varying vec2 coord; // Texture coordinate
varying vec3 normal; // Normal at point in camera space
varying vec3 point; // Point position in camera space
varying vec3 tangent; // Tangent at point in camera space

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(points, 1.0);
	vec3 eyeDirectionCamera = normalize(-pointCamera.xyz);

	normal = normalize(normalMatrix * normals);
	tangent = normalize(normalMatrix * tangents);

	bitangent = cross(normal, tangent);
	coord = coords;
	point = pointCamera.xyz;

	gl_Position = projectionMatrix * pointCamera;
}
