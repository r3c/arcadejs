
class Screen {
	public readonly canvas: HTMLCanvasElement;
	public readonly context: CanvasRenderingContext2D;

	public constructor(document: HTMLDocument) {
		const canvas = document.createElement('canvas');

		document.body.appendChild(canvas);

		canvas.tabIndex = 1;
		canvas.width = canvas.offsetWidth;
		canvas.height = canvas.offsetHeight;
		canvas.focus();

		const contextOrNull = canvas.getContext('2d');

		if (contextOrNull === null)
			throw Error("cannot get 2d context");

		this.canvas = canvas;
		this.context = contextOrNull;
	}

	public getHeight() {
		return this.canvas.height;
	}

	public getRatio() {
		return this.canvas.width / this.canvas.height;
	}

	public getWidth() {
		return this.canvas.width;
	}
};

export { Screen };