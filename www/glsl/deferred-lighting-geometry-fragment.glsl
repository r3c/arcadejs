#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform sampler2D specularMap;
uniform float shininess;

uniform bool useHeightMap;
uniform bool useNormalMap;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 normalAndSpecular;

float encodeInteger(in float decoded) {
	return decoded / 256.0;
}

vec2 encodeNormal(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirectionFace, float parallaxScale, float parallaxBias) {
	if (useHeightMap) {
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
	}
	else {
		return initialCoord;
	}
}

vec3 getNormal(in vec3 normal, in vec2 coord) {
	vec3 normalFace;

	if (useNormalMap)
		normalFace = normalize(2.0 * texture(normalMap, coord).rgb - 1.0);
	else
		normalFace = vec3(0.0, 0.0, 1.0);

	return normalize(normalFace.x * tangent + normalFace.y * bitangent + normalFace.z * normal);
}

void main(void) {
	vec3 eyeDirection = normalize(-point);
	vec3 eyeDirectionFace = vec3(dot(eyeDirection, tangent), dot(eyeDirection, bitangent), dot(eyeDirection, normal));
	vec2 parallaxCoord = getCoord(coord, eyeDirectionFace, 0.04, 0.02);

	// Color target: [normal, normal, shininess, specularColor]
	vec2 normalPack = encodeNormal(getNormal(normal, parallaxCoord));
	float specularColor = texture(specularMap, parallaxCoord).r;
	float shininessPack = encodeInteger(shininess);

	normalAndSpecular = vec4(normalPack, shininessPack, specularColor);
}
