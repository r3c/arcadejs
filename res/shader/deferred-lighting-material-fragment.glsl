#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D light;

uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform vec4 specularColor;
uniform sampler2D specularMap;

uniform bool useHeightMap;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 fragColor;

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirection, float parallaxScale, float parallaxBias) {
	if (useHeightMap) {
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirection.xy / eyeDirection.z;
	}
	else {
		return initialCoord;
	}
}

void main(void) {
	// Read light properties from texture buffers
	vec2 bufferCoord = vec2(gl_FragCoord.x / 800.0, gl_FragCoord.y / 600.0); // FIXME: hard-coded
	vec4 lightSample = -log2(texture(light, bufferCoord));

	vec3 lightDiffuse = lightSample.rgb;
	vec3 lightSpecular = lightSample.rgb * lightSample.a;

	// Read material properties from uniforms
	vec3 eyeDirection = normalize(-point);
	vec3 eyeDirectionFace = vec3(dot(eyeDirection, tangent), dot(eyeDirection, bitangent), dot(eyeDirection, normal));
	vec2 parallaxCoord = getCoord(coord, eyeDirectionFace, 0.04, 0.02);

	vec4 materialDiffuse = diffuseColor * texture(diffuseMap, parallaxCoord);
	vec4 materialSpecular = specularColor * texture(specularMap, parallaxCoord);

	// Emit final fragment color
	fragColor = vec4(materialDiffuse.rgb * lightDiffuse + materialSpecular.rgb * lightSpecular, 1.0);
}
