#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform int format;
uniform int scope;

uniform sampler2D source;

in vec2 coord;

layout(location=0) out vec4 fragColor;

// Spheremap transform
// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
vec3 decodeNormalSpheremap(in vec2 normalPack) {
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5)) * 0.5 + 0.5;
}

void main(void) {
	vec4 raw = texture(source, coord);

	// Read 1 byte, 4 possible configurations
	if (scope >= 6) {
		float value1;

		if (scope == 6) {
			value1 = raw.r;
		}
		else if (scope == 7) {
			value1 = raw.g;
		}
		else if (scope == 8) {
			value1 = raw.b;
		}
		else {
			value1 = raw.a;
		}

		if (format == 0) {
			fragColor = vec4(value1, value1, value1, 1.0);
		}
	}

	// Read 2 bytes, 3 possible configurations
	else if (scope >= 3) {
		vec2 value2;

		if (scope == 3) {
			value2 = raw.rg;
		}
		else if (scope == 4) {
			value2 = raw.gb;
		}
		else {
			value2 = raw.ba;
		}

		if (format == 0) {
			fragColor = vec4(value2, 0.0, 1.0);
		}
		else if (format == 1) {
			fragColor = vec4(decodeNormalSpheremap(value2), 1.0);
		}
	}

	// Read 3 bytes, 2 possible configurations
	else if (scope >= 1) {
		vec3 value3;

		if (scope == 1) {
			value3 = raw.rgb;
		}
		else {
			value3 = raw.gba;
		}

		fragColor = vec4(value3, 1.0);
	}

	// Read 4 bytes, 1 possible configuration
	else {
		fragColor = raw;
	}
}
