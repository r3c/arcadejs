const perturbDeclare = (forceFlag: string) => `
#ifndef ${forceFlag}
vec2 heightParallax(in vec2 coord, in sampler2D heightMap, in bool heightMapEnabled, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in vec3 t, in vec3 b, in vec3 n) {
	if (heightMapEnabled) {
		vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n)));

		return coord + (texture(heightMap, coord).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
	}
	else {
		return coord;
	}
}
#elif ${forceFlag}
vec2 heightParallax(in vec2 coord, in sampler2D heightMap, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in vec3 t, in vec3 b, in vec3 n) {
	vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n)));

	return coord + (texture(heightMap, coord).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
}
#endif
`;

const perturbInvoke = (forceFlag: string, coord: string, heightMap: string, heightMapEnabled: string, eyeDirection: string, parallaxScale: string, parallaxBias: string, t: string, b: string, n: string) => `
#ifndef ${forceFlag}
	heightParallax(${coord}, ${heightMap}, ${heightMapEnabled}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${t}, ${b}, ${n})
#elif ${forceFlag}
	heightParallax(${coord}, ${heightMap}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${t}, ${b}, ${n})
#else
	${coord}
#endif
`;

export { perturbDeclare, perturbInvoke }