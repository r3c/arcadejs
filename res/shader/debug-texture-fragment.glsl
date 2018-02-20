#ifdef GL_ES
precision highp float;
#endif

uniform int format;
uniform int source;

uniform sampler2D texture;

varying vec2 coord;

// Spheremap transform
// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
vec3 decodeNormalSpheremap(in vec2 normalPack) {
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5)) * 0.5 + 0.5;
}

void main(void) {
	vec4 sample = texture2D(texture, coord);

	// Read 1 byte, 4 possible configurations
	if (source >= 6) {
		float value1;

		if (source == 6) {
			value1 = sample.r;
		}
		else if (source == 7) {
			value1 = sample.g;
		}
		else if (source == 8) {
			value1 = sample.b;
		}
		else {
			value1 = sample.a;
		}

		if (format == 0) {
			gl_FragColor = vec4(value1, value1, value1, 1.0);
		}
	}

	// Read 2 bytes, 3 possible configurations
	else if (source >= 3) {
		vec2 value2;

		if (source == 3) {
			value2 = sample.rg;
		}
		else if (source == 4) {
			value2 = sample.gb;
		}
		else {
			value2 = sample.ba;
		}

		if (format == 0) {
			gl_FragColor = vec4(value2, 0.0, 1.0);
		}
		else if (format == 1) {
			gl_FragColor = vec4(decodeNormalSpheremap(value2), 1.0);
		}
	}

	// Read 3 bytes, 2 possible configurations
	else if (source >= 1) {
		vec3 value3;

		if (source == 1) {
			value3 = sample.rgb;
		}
		else {
			value3 = sample.gba;
		}

		gl_FragColor = vec4(value3, 1.0);
	}

	// Read 4 bytes, 1 possible configuration
	else {
		gl_FragColor = sample;
	}
}
