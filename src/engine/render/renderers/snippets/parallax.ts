const heightEnable = "USE_HEIGHT_MAP";

const heightDeclare = `
vec2 heightParallax(in vec2 coord, in sampler2D heightMap, in vec3 eyeDirection, float parallaxScale, float parallaxBias) {
	#ifdef ${heightEnable}
		float parallaxHeight = texture(heightMap, coord).r;

		return coord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirection.xy / eyeDirection.z;
	#else
		return coord;
	#endif
}`;

const heightInvoke = (coord: string, heightMap: string, eyeDirection: string, parallaxScale: string, parallaxBias: string) => `
heightParallax(${coord}, ${heightMap}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias})`;

export { heightDeclare, heightInvoke, heightEnable }