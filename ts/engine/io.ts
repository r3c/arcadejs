
interface ReaderConstructor<T> {
	new(request: XMLHttpRequest): T;

	readonly responseType: XMLHttpRequestResponseType;
}

class Reader<T> {
	public readonly data: T;

	protected constructor(data: T) {
		this.data = data;
	}
}

class BinaryReader extends Reader<Uint8Array> {
	public static readonly responseType = "arraybuffer";

	public constructor(request: XMLHttpRequest) {
		super(new Uint8Array(request.response));
	}
}

class StringReader extends Reader<string> {
	public static readonly responseType = "text";

	public constructor(request: XMLHttpRequest) {
		super(request.responseText);
	}
}

class Stream {
	public static async readURL<TReader>(reader: ReaderConstructor<TReader>, url: string) {
		return new Promise<TReader>((resolve, reject) => {
			const request = new XMLHttpRequest();

			request.open("GET", url, true);
			request.responseType = reader.responseType;

			request.onabort = event => reject("request aborted");
			request.onerror = event => reject("request failed");
			request.onload = event => resolve(new reader(request));

			request.send(null);
		});
	}
}

export { BinaryReader, Stream, StringReader };
