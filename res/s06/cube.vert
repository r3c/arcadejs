#ifdef GL_ES
precision highp float;
#endif

attribute vec4 color;
attribute vec2 coord;
attribute vec3 normal;
attribute vec3 point;

uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;

varying vec4 vColor;
varying vec3 vCamera;
varying vec2 vCoord;
varying vec3 vNormal;
varying vec3 vPoint;

void main(void) {
	vec3 normalWorld = normalMatrix * normal;
	vec4 pointWorld = modelViewMatrix * vec4(point, 1.0);

	vCamera = -pointWorld.xyz;
	vColor = color;
	vCoord = coord;
	vNormal = normalWorld;
	vPoint = pointWorld.xyz;

	gl_Position = projectionMatrix * pointWorld;
}
