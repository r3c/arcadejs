import { Vector2 } from "../math/vector";

type Screen<TContext> = {
  fullscreen: () => void;
  getContext: () => TContext;
  getSize: () => Vector2;
  onResize: (handler: (size: Vector2) => void) => void;
  resize: () => void;
};

type ScreenConstructor<TContext> = (
  canvas: HTMLCanvasElement
) => Screen<TContext>;

const createScreen = <TContext>(
  canvas: HTMLCanvasElement,
  context: TContext
): Screen<TContext> => {
  canvas.tabIndex = 0;
  canvas.focus();
  canvas.onclick = () => canvas.focus();

  const pixelRatio = 2;
  const size = Vector2.fromZero();

  let onResize = (_: Vector2) => {};

  return {
    fullscreen() {
      canvas.requestFullscreen();
    },

    getContext() {
      return context;
    },

    getSize() {
      return size;
    },

    onResize(handler) {
      onResize = handler;
    },

    resize() {
      const height = Math.ceil(canvas.clientHeight * pixelRatio);
      const width = Math.ceil(canvas.clientWidth * pixelRatio);

      if (width === size.x && height === size.y) {
        return;
      }

      canvas.width = width;
      canvas.height = height;
      size.x = width;
      size.y = height;

      onResize(size);
    },
  };
};

const createCanvasScreen = (
  canvas: HTMLCanvasElement
): Screen<CanvasRenderingContext2D> => {
  const context = canvas.getContext("2d");

  if (context === null) {
    throw Error("cannot get 2d context");
  }

  return createScreen(canvas, context);
};

const createWebGLScreen = (
  canvas: HTMLCanvasElement
): Screen<WebGL2RenderingContext> => {
  const context = canvas.getContext("webgl2", {
    premultipliedAlpha: false,
  });

  if (context === null) {
    throw Error("cannot get WebGL context");
  }

  return createScreen(canvas, context);
};

export {
  type Screen,
  type ScreenConstructor,
  createCanvasScreen,
  createWebGLScreen,
};
