const perturbDeclare = (enable: string) => `
vec2 heightParallax(in vec2 coord, in sampler2D heightMap, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in vec3 t, in vec3 b, in vec3 n) {
	#ifdef ${enable}
		vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n)));

		vec2 coordParallax = coord + (texture(heightMap, coord).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
	#else
		vec2 coordParallax = coord;
	#endif

	return coordParallax;
}`;

const perturbInvoke = (coord: string, heightMap: string, eyeDirection: string, parallaxScale: string, parallaxBias: string, t: string, b: string, n: string) =>
	`heightParallax(${coord}, ${heightMap}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${t}, ${b}, ${n})`;

export { perturbDeclare, perturbInvoke }