attribute vec4 color;
attribute vec2 coord;
attribute vec3 normal;
attribute vec4 point;

uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;

varying highp vec4 vColor;
varying highp vec2 vCoord;
varying highp vec3 vNormal;

void main(void) {
	vColor = color;
	vCoord = coord;
	vNormal = normalMatrix * normal;

	gl_Position = projectionMatrix * modelViewMatrix * point;
}
