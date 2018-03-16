const decodeDeclare = `
float decodeShininess(in float encoded) {
	return 1.0 / encoded;
}`;

const decodeInvoke = (encoded: string) =>
	`decodeShininess(${encoded})`;

const encodeDeclare = `
float encodeShininess(in float decoded) {
	return 1.0 / max(decoded, 1.0);
}`;

const encodeInvoke = (decoded: string) =>
	`encodeShininess(${decoded})`;

export { decodeDeclare, decodeInvoke, encodeDeclare, encodeInvoke }