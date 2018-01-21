
interface BufferConstructor<T> {
	new(request: XMLHttpRequest): T;

	readonly responseType: XMLHttpRequestResponseType;
}

class Request<T> {
	public readonly data: T;

	protected constructor(data: T) {
		this.data = data;
	}
}

class BinaryRequest extends Request<Uint8Array> {
	public static readonly responseType = "arraybuffer";

	public constructor(request: XMLHttpRequest) {
		super(new Uint8Array(request.response));
	}
}

class JSONRequest extends Request<any> {
	public static readonly responseType = "json";

	public constructor(request: XMLHttpRequest) {
		super(request.response);
	}
}

class StringRequest extends Request<string> {
	public static readonly responseType = "text";

	public constructor(request: XMLHttpRequest) {
		super(request.responseText);
	}
}

class BinaryReader {
	private readonly data: Uint8Array;

	public constructor(data: Uint8Array) {
		this.data = data;
	}
}

const readURL = async <T>(buffer: BufferConstructor<Request<T>>, url: string) => {
	return new Promise<T>((resolve, reject) => {
		const request = new XMLHttpRequest();

		request.open("GET", url, true);
		request.responseType = buffer.responseType;

		request.onabort = event => reject(`request aborted on ${url}`);
		request.onerror = event => reject(`request failed on ${url}`);
		request.onload = event => resolve(new buffer(request).data);

		request.send(null);
	});
};

export { BinaryReader, BinaryRequest, JSONRequest, StringRequest, readURL };
