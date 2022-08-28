interface Codec {
  decode(buffer: ArrayBuffer): string;
  encode(plain: string): ArrayBuffer;
}

const asciiCodec: Codec = {
  decode(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((value) => String.fromCharCode(value))
      .join("");
  },

  encode(plain: string): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(plain.length);
    const bufferView = new Uint8Array(arrayBuffer);

    for (let i = 0; i < plain.length; ++i) {
      bufferView[i] = plain.charCodeAt(i);
    }

    return arrayBuffer;
  },
};

export { type Codec, asciiCodec };
