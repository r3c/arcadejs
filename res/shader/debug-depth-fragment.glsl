#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D ambientMap;

varying vec2 coord;

void main(void) {
	gl_FragColor = vec4(texture2D(ambientMap, coord).rrr, 1.0);
}
