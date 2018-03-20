#version 300 es

#ifdef GL_ES
precision highp float;
#endif

layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = vec4(1, 1, 1, 1);
}
