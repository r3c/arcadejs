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

uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;

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
	vec4 pointWorld = modelViewMatrix * vec4(points, 1.0);
	vec3 cameraWorld = -pointWorld.xyz;

	coord = coords;
	point = pointWorld.xyz;

	vec3 n = normalize(normalMatrix * normals);
	vec3 t = normalize(normalMatrix * tangents);
	vec3 b = cross(n, t);

	if (useNormalMap) {
		vec3 light0directionWorld = normalize(light0.position - point);
		vec3 light1directionWorld = normalize(light1.position - point);
		vec3 light2directionWorld = normalize(light2.position - point);

		light0direction = vec3(dot(light0directionWorld, t), dot(light0directionWorld, b), dot(light0directionWorld, n));
		light1direction = vec3(dot(light1directionWorld, t), dot(light1directionWorld, b), dot(light1directionWorld, n));
		light2direction = vec3(dot(light2directionWorld, t), dot(light2directionWorld, b), dot(light2directionWorld, n));

		camera = vec3(dot(cameraWorld, t), dot(cameraWorld, b), dot(cameraWorld, n));
		normal = vec3(0.0, 0.0, 1.0);
	}
	else {
		light0direction = light0.position - point;
		light1direction = light1.position - point;
		light2direction = light2.position - point;

		camera = cameraWorld;
		normal = n;
	}

	gl_Position = projectionMatrix * pointWorld;
}
