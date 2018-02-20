#ifdef GL_ES
precision highp float;
#endif

attribute vec2 coords;
attribute vec3 points;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

varying vec2 coord;

void main(void) {
	coord = coords;

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(points, 1.0);
}
