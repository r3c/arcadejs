#version 300 es

#ifdef GL_ES
precision highp float;
#endif

struct Light {
	bool enabled;
	vec3 position;
};

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

uniform Light light0;
uniform Light light1;
uniform Light light2;

uniform bool useNormalMap;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space (normal mapping disabled) or tangent space (normal mapping enabled)
out vec3 light0Direction; // Direction of light 0 in same space than eye vector
out vec3 light1Direction; // Direction of light 1 in same space than eye vector
out vec3 light2Direction; // Direction of light 2 in same space than eye vector
out vec3 normal; // Normal at point in same space than eye vector

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 point = viewMatrix * modelMatrix * vec4(points, 1.0);

	vec3 pointCamera = point.xyz;
	vec3 eyeDirectionCamera = normalize(-pointCamera);

	coord = coords;

	vec3 n = normalize(normalMatrix * normals);
	vec3 t = normalize(normalMatrix * tangents);
	vec3 b = cross(n, t);

	if (useNormalMap) {
		vec3 light0DirectionCamera = normalize(toCameraPosition(light0.position) - pointCamera);
		vec3 light1DirectionCamera = normalize(toCameraPosition(light1.position) - pointCamera);
		vec3 light2DirectionCamera = normalize(toCameraPosition(light2.position) - pointCamera);

		light0Direction = vec3(dot(light0DirectionCamera, t), dot(light0DirectionCamera, b), dot(light0DirectionCamera, n));
		light1Direction = vec3(dot(light1DirectionCamera, t), dot(light1DirectionCamera, b), dot(light1DirectionCamera, n));
		light2Direction = vec3(dot(light2DirectionCamera, t), dot(light2DirectionCamera, b), dot(light2DirectionCamera, n));

		eye = vec3(dot(eyeDirectionCamera, t), dot(eyeDirectionCamera, b), dot(eyeDirectionCamera, n));
		normal = vec3(0.0, 0.0, 1.0);
	}
	else {
		light0Direction = toCameraPosition(light0.position) - pointCamera;
		light1Direction = toCameraPosition(light1.position) - pointCamera;
		light2Direction = toCameraPosition(light2.position) - pointCamera;

		eye = eyeDirectionCamera;
		normal = n;
	}

	gl_Position = projectionMatrix * point;
}
