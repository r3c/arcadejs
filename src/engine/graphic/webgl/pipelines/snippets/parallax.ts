const perturbDeclare = (_sampler: string): string => `
vec2 heightParallax(in vec2 coord, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in vec3 t, in vec3 b, in vec3 n) {
	vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n)));

	return coord + (texture(heightMap, coord).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
}`;

const perturbInvoke = (
  coord: string,
  eyeDirection: string,
  parallaxScale: string,
  parallaxBias: string,
  t: string,
  b: string,
  n: string
): string =>
  `heightParallax(${coord}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${t}, ${b}, ${n})`;

export { perturbDeclare, perturbInvoke };
