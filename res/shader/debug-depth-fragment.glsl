#ifdef GL_ES
precision highp float;
#endif

uniform int mode;
uniform sampler2D texture;

varying vec2 coord;

void main(void) {
	if (mode == 0) {
		// Show RGB component
		gl_FragColor = vec4(texture2D(texture, coord).rgb, 1.0);
	}
	else if (mode == 1) {
		// Show alpha component
		gl_FragColor = vec4(texture2D(texture, coord).aaa, 1.0);
	}
	else if (mode == 2) {
		// Show depth buffer
		gl_FragColor = vec4(texture2D(texture, coord).rrr, 1.0);
	}
}
