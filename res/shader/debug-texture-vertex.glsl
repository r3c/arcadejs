#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec3 points;

out vec2 coord;

void main(void) {
	coord = coords;

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(points, 1.0);
}
