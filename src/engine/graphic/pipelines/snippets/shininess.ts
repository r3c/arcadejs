const decodeDeclare = () => `
float shininessDecode(in float encoded) {
	return 1.0 / encoded;
}`;

const decodeInvoke = (encoded: string) => `shininessDecode(${encoded})`;

const encodeDeclare = () => `
float shininessEncode(in float decoded) {
	return 1.0 / max(decoded, 1.0);
}`;

const encodeInvoke = (decoded: string) => `shininessEncode(${decoded})`;

export { decodeDeclare, decodeInvoke, encodeDeclare, encodeInvoke };
