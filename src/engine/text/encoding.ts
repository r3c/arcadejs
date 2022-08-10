interface Codec {
	decode(buffer: ArrayBuffer): string,
	encode(plain: string): ArrayBuffer
}

class ASCIICodec implements Codec {
	public decode(buffer: ArrayBuffer): string {
		return String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer)));
	}

	public encode(plain: string): ArrayBuffer {
		const arrayBuffer = new ArrayBuffer(plain.length);
		const bufferView = new Uint8Array(arrayBuffer);

		for (let i = 0; i < plain.length; ++i)
			bufferView[i] = plain.charCodeAt(i);

		return arrayBuffer;
	}
}

export { ASCIICodec, Codec }