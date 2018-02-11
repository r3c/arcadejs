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

uniform mat4 shadowProjectionMatrix;
uniform mat4 shadowViewMatrix;

uniform vec3 lightDirection;
uniform bool useNormalMap;

varying vec3 camera;
varying vec2 coord;
varying vec3 normal;
varying vec3 point;

const mat4 texUnitConverter = mat4(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0);

varying vec4 shadowPos;

varying vec3 lightDirectionFinal;

void main(void) {
	vec4 pointWorld = viewMatrix * modelMatrix * vec4(points, 1.0);
	vec3 cameraWorld = -pointWorld.xyz;

	coord = coords;
	point = pointWorld.xyz;

	vec3 n = normalize(normalMatrix * normals);
	vec3 t = normalize(normalMatrix * tangents);
	vec3 b = cross(n, t);

	if (useNormalMap) {
		vec3 lightDirectionCamera = normalize((viewMatrix * vec4(lightDirection, 0.0)).xyz);

		lightDirectionFinal = vec3(dot(lightDirectionCamera, t), dot(lightDirectionCamera, b), dot(lightDirectionCamera, n));

		camera = vec3(dot(cameraWorld, t), dot(cameraWorld, b), dot(cameraWorld, n));
		normal = vec3(0.0, 0.0, 1.0);
	}
	else {
		lightDirectionFinal = normalize((viewMatrix * vec4(lightDirection, 0.0)).xyz);

		camera = cameraWorld;
		normal = n;
	}

	shadowPos =  texUnitConverter * shadowProjectionMatrix * shadowViewMatrix * modelMatrix * vec4(points, 1.0);

	gl_Position = projectionMatrix * pointWorld;
}
