const decodeDeclare = `
vec3 normalDecode(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}`

const decodeInvoke = (normalPack: string) => `
normalDecode(${normalPack})`;

const encodeDeclare = `
vec2 normalEncode(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}`;

const encodeInvoke = (decoded: string) => `
normalEncode(${decoded})`;

const modifyEnable = "USE_NORMAL_MAP";

const modifyDeclare = `
vec3 normalModify(in vec3 initialNormal, in sampler2D normalMap, in vec2 coord) {
	#ifdef ${modifyEnable}
		// Initial normal is always (0, 0, 1) here and can be safely ignored, see vertex shader
		return normalize(2.0 * texture(normalMap, coord).rgb - 1.0);
	#else
		return normalize(initialNormal);
	#endif
}`;

const modifyInvoke = (normal: string, normalMap: string, coord: string) => `
normalModify(${normal}, ${normalMap}, ${coord})`;

export { decodeDeclare, decodeInvoke, encodeDeclare, encodeInvoke, modifyDeclare, modifyEnable, modifyInvoke }