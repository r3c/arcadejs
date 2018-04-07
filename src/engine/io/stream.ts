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

class BinaryFormat extends Format<ArrayBuffer> {
	public static readonly responseType = "arraybuffer";

	public constructor(request: XMLHttpRequest) {
		super(request.response);
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
	private readonly little: boolean;
	private readonly view: DataView;

	private offset: number;

	public constructor(buffer: ArrayBuffer, endian: Endian, offset?: number, length?: number) {
		this.little = endian === Endian.Little;
		this.offset = 0;
		this.view = new DataView(buffer, offset, length);
	}

	public getLength() {
		return this.view.byteLength;
	}

	public getOffset() {
		return this.offset;
	}

	public readBuffer(length: number) {
		const begin = this.skip(length);

		return this.view.buffer.slice(begin, length);
	}

	public readBufferZero() {
		const begin = this.offset;

		while (true) {
			const value = this.view.getInt8(this.offset++);

			if (value === 0)
				return this.view.buffer.slice(begin, this.offset - begin - 1);
		}
	}

	public readFloat32() {
		return this.view.getFloat32(this.skip(4), this.little);
	}

	public readInt8u() {
		return this.view.getUint8(this.skip(1));
	}

	public readInt16u() {
		return this.view.getUint16(this.skip(2), this.little);
	}

	public readInt32u() {
		return this.view.getUint32(this.skip(4), this.little);
	}
	public skip(count: number) {
		const current = this.offset;

		this.offset += Math.max(count, 0);

		return current;
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
