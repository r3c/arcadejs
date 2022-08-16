const decodeDeclare = (): string => `
float shininessDecode(in float encoded) {
	return 1.0 / encoded;
}`;

const decodeInvoke = (encoded: string): string => `shininessDecode(${encoded})`;

const encodeDeclare = (): string => `
float shininessEncode(in float decoded) {
	return 1.0 / max(decoded, 1.0);
}`;

const encodeInvoke = (decoded: string): string => `shininessEncode(${decoded})`;

export { decodeDeclare, decodeInvoke, encodeDeclare, encodeInvoke };
