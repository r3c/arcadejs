const decodeDeclare = `
vec3 normalDecode(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}`

const decodeInvoke = (normalPack: string) =>
	`normalDecode(${normalPack})`;

const encodeDeclare = `
vec2 normalEncode(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}`;

const encodeInvoke = (decoded: string) =>
	`normalEncode(${decoded})`;

const perturbDeclare = (enable: string) => `
vec3 normalPerturb(in sampler2D normalMap, in vec2 coord, in vec3 t, in vec3 b, in vec3 n) {
	vec3 normalFace;

	#ifdef ${enable}
		normalFace = normalize(2.0 * texture(normalMap, coord).rgb - 1.0);
	#else
		normalFace = vec3(0.0, 0.0, 1.0);
	#endif
	
	return normalize(normalFace.x * t + normalFace.y * b + normalFace.z * n);
}`;

const perturbInvoke = (normalMap: string, coord: string, t: string, b: string, n: string) =>
	`normalPerturb(${normalMap}, ${coord}, ${t}, ${b}, ${n})`;

export { decodeDeclare, decodeInvoke, encodeDeclare, encodeInvoke, perturbDeclare, perturbInvoke }