const enum Endian {
	Big,
	Little
}

interface FormatConstructor<T> {
	new(request: XMLHttpRequest): T;

	readonly responseType: XMLHttpRequestResponseType;
}

class Format<T> {
	public readonly data: T;

	protected constructor(data: T) {
		this.data = data;
	}
}

class BinaryFormat extends Format<Uint8Array> {
	public static readonly responseType = "arraybuffer";

	public constructor(request: XMLHttpRequest) {
		super(new Uint8Array(request.response));
	}
}

class JSONFormat extends Format<any> {
	public static readonly responseType = "json";

	public constructor(request: XMLHttpRequest) {
		super(request.response);
	}
}

class StringFormat extends Format<string> {
	public static readonly responseType = "text";

	public constructor(request: XMLHttpRequest) {
		super(request.responseText);
	}
}

class BinaryReader {
	private readonly buffer: Uint8Array;
	private readonly endian: Endian;

	private offset: number;

	public constructor(buffer: Uint8Array, endian: Endian) {
		this.buffer = buffer;
		this.endian = endian;
		this.offset = 0;
	}

	public getLength() {
		return this.buffer.byteLength;
	}

	public getOffset() {
		return this.offset;
	}

	public readFloat32() {
		let b1: number;
		let b2: number;
		let b3: number;
		let b4: number;

		if (this.endian === Endian.Big) {
			b1 = this.readInt8u();
			b2 = this.readInt8u();
			b3 = this.readInt8u();
			b4 = this.readInt8u();
		}
		else {
			b4 = this.readInt8u();
			b3 = this.readInt8u();
			b2 = this.readInt8u();
			b1 = this.readInt8u();
		}

		const exponent = ((b1 << 1) & 0xFF) | (b2 >> 7);
		const sign = ((b2 & 0x7F) << 16) | (b3 << 8) | b4;

		if (exponent === 0 && sign === 0)
			return 0.0;
		else if (exponent === 255)
			return sign == 0 ? Infinity : NaN;

		return (1 - 2 * (b1 >> 7)) * (1 + sign * Math.pow(2, -23)) * Math.pow(2, exponent - 127);
	}

	public readInt8u() {
		return this.buffer[this.offset++];
	}

	public readInt16u() {
		const b1 = this.readInt8u();
		const b2 = this.readInt8u();

		return this.endian === Endian.Big
			? b1 * 256 + b2
			: b1 + b2 * 256;
	}

	public readInt32u() {
		const b1 = this.readInt8u();
		const b2 = this.readInt8u();
		const b3 = this.readInt8u();
		const b4 = this.readInt8u();

		return this.endian === Endian.Big
			? b1 * 16777216 + b2 * 65536 + b3 * 256 + b4
			: b1 + b2 * 256 + b3 * 65536 + b4 * 16777216;
	}

	public readStringZero() {
		let string = "";

		while (true) {
			const char = this.readInt8u();

			if (char === 0 || char === undefined)
				return string;

			string += String.fromCharCode(char);
		}
	}

	public skip(count: number) {
		this.offset += Math.max(count, 0);
	}
}

const readURL = async <T>(format: FormatConstructor<Format<T>>, url: string) => {
	return new Promise<T>((resolve, reject) => {
		const request = new XMLHttpRequest();

		request.open("GET", url, true);
		request.responseType = format.responseType;

		request.onabort = event => reject(`request aborted on ${url}`);
		request.onerror = event => reject(`request failed on ${url}`);
		request.onload = event => resolve(new format(request).data);

		request.send(null);
	});
};

export { BinaryReader, BinaryFormat, Endian, JSONFormat, StringFormat, readURL };
