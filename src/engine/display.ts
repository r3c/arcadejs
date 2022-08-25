const resizeCanvas = (canvas: HTMLCanvasElement) => {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
};

class Screen {
  public readonly canvas: HTMLCanvasElement;

  protected constructor(container: HTMLElement) {
    const canvas = document.createElement("canvas");

    container.appendChild(canvas);

    canvas.tabIndex = 1;
    canvas.addEventListener("fullscreenchange", () => resizeCanvas(canvas));
    canvas.addEventListener("resize", () => resizeCanvas(canvas));
    canvas.focus();

    resizeCanvas(canvas);

    this.canvas = canvas;
  }

  public getHeight() {
    return this.canvas.clientHeight;
  }

  public getRatio() {
    return this.canvas.clientWidth / this.canvas.clientHeight;
  }

  public getWidth() {
    return this.canvas.clientWidth;
  }

  public goFullscreen() {
    const canvas = <any>this.canvas;

    if (canvas.requestFullscreen !== undefined) canvas.requestFullscreen();
    else if (canvas.mozRequestFullScreen !== undefined)
      canvas.mozRequestFullScreen();
    else if (canvas.webkitRequestFullScreen !== undefined)
      canvas.webkitRequestFullScreen();
  }
}

class Context2DScreen extends Screen {
  public readonly context: CanvasRenderingContext2D;

  public constructor(container: HTMLElement) {
    super(container);

    const contextOrNull = this.canvas.getContext("2d");

    if (contextOrNull === null) {
      throw Error("cannot get 2d context");
    }

    this.context = contextOrNull;
  }
}

class WebGLScreen extends Screen {
  public readonly context: WebGL2RenderingContext;

  public constructor(container: HTMLElement) {
    super(container);

    const contextOrNull = this.canvas.getContext("webgl2");

    if (contextOrNull === null) {
      throw Error("cannot get WebGL context");
    }

    this.context = contextOrNull;
  }
}

export { Context2DScreen, Screen, WebGLScreen };
