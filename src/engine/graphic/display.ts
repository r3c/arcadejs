type ResizeHandler = (screen: Screen) => void;

class Screen {
  public readonly canvas: HTMLCanvasElement;
  public readonly resizeHandlers: Set<ResizeHandler>;

  protected constructor(container: HTMLElement) {
    const canvas = document.createElement("canvas");
    const resizeHandlers = new Set<ResizeHandler>();

    const onResize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      for (const resizeHandler of resizeHandlers) {
        resizeHandler(this);
      }
    };

    container.appendChild(canvas);

    canvas.tabIndex = 1;
    canvas.addEventListener("fullscreenchange", onResize);
    canvas.addEventListener("resize", onResize);
    canvas.focus();

    onResize();

    this.canvas = canvas;
    this.resizeHandlers = resizeHandlers;
  }

  public addResizeHandler(resizeHandler: ResizeHandler): void {
    this.resizeHandlers.add(resizeHandler);

    resizeHandler(this);
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

  public removeResizeHandler(resizeHandler: ResizeHandler): void {
    this.resizeHandlers.delete(resizeHandler);
  }

  public requestFullscreen() {
    this.canvas.requestFullscreen?.();
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
