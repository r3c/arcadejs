#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform int format;
uniform int select;

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
	vec4 encoded;
	vec4 raw = texture(source, coord);

	// Read 4 bytes, 1 possible configuration
	if (select == 0)
		encoded = raw;

	// Read 3 bytes, 2 possible configurations
	else if (select == 1)
		encoded = vec4(raw.rgb, 1.0);
	else if (select == 2)
		encoded = vec4(raw.gba, 1.0);

	// Read 2 bytes, 3 possible configurations
	else if (select == 3)
		encoded = vec4(raw.rg, raw.rg);
	else if (select == 4)
		encoded = vec4(raw.gb, raw.gb);
	else if (select == 5)
		encoded = vec4(raw.ba, raw.ba);

	// Read 1 byte, 4 possible configurations
	else if (select == 6)
		encoded = vec4(raw.r);
	else if (select == 7)
		encoded = vec4(raw.g);
	else if (select == 8)
		encoded = vec4(raw.b);
	else if (select == 9)
		encoded = vec4(raw.a);

	// Format output
	if (format == 0)
		fragColor = encoded;
	else if (format == 1)
		fragColor = vec4(encoded.rgb, 1.0);
	else if (format == 2)
		fragColor = vec4(encoded.rrr, 1.0);
	else if (format == 3)
		fragColor = vec4(decodeNormalSpheremap(encoded.rg), 1.0);
	else if (format == 4)
		fragColor = vec4(-log2(encoded.rgb), 1.0);
}
