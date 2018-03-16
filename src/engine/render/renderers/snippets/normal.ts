const decodeDeclare = `
vec3 decodeNormal(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}`

const decodeInvoke = (normalPack: string) => `
decodeNormal(${normalPack})
`;

const encodeDeclare = `
vec2 encodeNormal(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}`;

const encodeInvoke = (decoded: string) => `
encodeNormal(${decoded})`;

export { decodeDeclare, decodeInvoke, encodeDeclare, encodeInvoke }