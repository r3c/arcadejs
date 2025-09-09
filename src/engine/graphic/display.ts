import { MutableVector2, Vector2 } from "../math/vector";

class Screen {
  public readonly canvas: HTMLCanvasElement;

  private readonly resizeHandlers: Set<(size: Vector2) => void>;
  private readonly size: MutableVector2;

  private pixelRatio: number;

  protected constructor(container: HTMLElement) {
    const canvas = document.createElement("canvas");

    container.appendChild(canvas);

    canvas.tabIndex = 0;
    canvas.focus();
    canvas.onclick = () => canvas.focus();

    this.canvas = canvas;
    this.pixelRatio = 2;
    this.resizeHandlers = new Set<() => void>();
    this.size = Vector2.fromZero();

    this.resize();
  }

  public addResizeHandler(resizeHandler: (size: Vector2) => void): () => void {
    this.resizeHandlers.add(resizeHandler);

    resizeHandler(this.size);

    return () => this.resizeHandlers.delete(resizeHandler);
  }

  public getSize(): Vector2 {
    return this.size;
  }

  public requestFullscreen() {
    this.canvas.requestFullscreen?.();
  }

  public resize() {
    const height = Math.ceil(this.canvas.clientHeight * this.pixelRatio);
    const width = Math.ceil(this.canvas.clientWidth * this.pixelRatio);

    if (width === this.size.x && height === this.size.y) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.size.x = width;
    this.size.y = height;

    for (const resizeHandler of this.resizeHandlers) {
      resizeHandler(this.size);
    }
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

    const contextOrNull = this.canvas.getContext("webgl2", {
      premultipliedAlpha: false,
    });

    if (contextOrNull === null) {
      throw Error("cannot get WebGL context");
    }

    this.context = contextOrNull;
  }
}

export { Context2DScreen, Screen, WebGLScreen };
