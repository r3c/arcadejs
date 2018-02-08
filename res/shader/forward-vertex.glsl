#ifdef GL_ES
precision highp float;
#endif

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

uniform Light light0;
uniform Light light1;
uniform Light light2;

uniform bool useNormalMap;

varying vec3 camera;
varying vec2 coord;
varying vec3 normal;
varying vec3 point;

varying vec3 light0direction;
varying vec3 light1direction;
varying vec3 light2direction;

void main(void) {
	vec4 pointWorld = viewMatrix * modelMatrix * vec4(points, 1.0);
	vec3 cameraWorld = -pointWorld.xyz;

	coord = coords;
	point = pointWorld.xyz;

	vec3 n = normalize(normalMatrix * normals);
	vec3 t = normalize(normalMatrix * tangents);
	vec3 b = cross(n, t);

	if (useNormalMap) {
		vec3 light0directionCamera = normalize((viewMatrix * vec4(light0.position, 1.0)).xyz - point);
		vec3 light1directionCamera = normalize((viewMatrix * vec4(light1.position, 1.0)).xyz - point);
		vec3 light2directionCamera = normalize((viewMatrix * vec4(light2.position, 1.0)).xyz - point);

		light0direction = vec3(dot(light0directionCamera, t), dot(light0directionCamera, b), dot(light0directionCamera, n));
		light1direction = vec3(dot(light1directionCamera, t), dot(light1directionCamera, b), dot(light1directionCamera, n));
		light2direction = vec3(dot(light2directionCamera, t), dot(light2directionCamera, b), dot(light2directionCamera, n));

		camera = vec3(dot(cameraWorld, t), dot(cameraWorld, b), dot(cameraWorld, n));
		normal = vec3(0.0, 0.0, 1.0);
	}
	else {
		light0direction = (viewMatrix * vec4(light0.position, 1.0)).xyz - point;
		light1direction = (viewMatrix * vec4(light1.position, 1.0)).xyz - point;
		light2direction = (viewMatrix * vec4(light2.position, 1.0)).xyz - point;

		camera = cameraWorld;
		normal = n;
	}

	gl_Position = projectionMatrix * pointWorld;
}
