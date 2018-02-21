#ifdef GL_ES
precision highp float;
#endif

uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform sampler2D reflectionMap;
uniform float shininess;

uniform int pass;
uniform bool useHeightMap;
uniform bool useNormalMap;

varying vec3 bitangent;
varying vec2 coord;
varying vec3 normal;
varying vec3 point;
varying vec3 tangent;

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirectionFace, float parallaxScale, float parallaxBias) {
	if (useHeightMap) {
		float parallaxHeight = texture2D(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
	}
	else {
		return initialCoord;
	}
}

vec2 getNormal(in vec3 normal, in vec2 coord) {
	vec3 normalFace;

	if (useNormalMap)
		normalFace = normalize(2.0 * texture2D(normalMap, coord).rgb - 1.0);
	else
		normalFace = vec3(0.0, 0.0, 1.0);

	vec3 modifiedNormal = normalize(normalFace.x * tangent + normalFace.y * bitangent + normalFace.z * normal);

	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(modifiedNormal.xy) * sqrt(-modifiedNormal.z * 0.5 + 0.5) * 0.5 + 0.5;
}

void main(void) {
	vec3 eyeDirection = normalize(-point);
	vec3 eyeDirectionFace = vec3(dot(eyeDirection, tangent), dot(eyeDirection, bitangent), dot(eyeDirection, normal));
	vec2 parallaxCoord = getCoord(coord, eyeDirectionFace, 0.04, 0.02);

	if (pass == 1) {
		// Pass 1: pack ambient color and material shininess
		vec3 albedo = ambientColor.rgb * texture2D(ambientMap, parallaxCoord).rgb;
		float shininessPack = 1.0 / (shininess + 1.0);

		gl_FragColor = vec4(albedo, shininessPack);
	}
	else if (pass == 2) {
		// Pass 2: pack normal and material reflection
		vec2 normalPack = getNormal(normal, parallaxCoord);
		float reflection = texture2D(reflectionMap, parallaxCoord).r;
		float unused = 0.0;

		gl_FragColor = vec4(normalPack, unused, reflection);
	}
}