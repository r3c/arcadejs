varying highp vec4 vColor;
varying highp vec2 vCoord;
varying highp vec3 vNormal;

uniform highp vec4 colorBase;
uniform sampler2D colorMap;

uniform highp vec3 lightDirection;
uniform bool lightEnabled;

void main(void) {
	highp vec4 lightColor;

	if (lightEnabled) {
		highp vec3 ambientLightColor = vec3(0.3, 0.3, 0.3);
		highp vec3 diffuseLightColor = vec3(1, 1, 1);
		highp vec3 diffuseLightDirection = normalize(lightDirection);

		highp float directional = max(dot(vNormal, diffuseLightDirection), 0.0);

		lightColor = vec4(ambientLightColor + (diffuseLightColor * directional), 1.0);
	}
	else {
		lightColor = vec4(1, 1, 1, 1);
	}

	gl_FragColor = vColor * colorBase * lightColor * texture2D(colorMap, vCoord);
}
