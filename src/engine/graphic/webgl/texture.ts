import { Releasable } from "../../io/resource";
import { range } from "../../language/iterable";
import { Vector2, Vector4 } from "../../math/vector";
import { TextureSampler, Interpolation, Wrap } from "../mesh";
import { GlContext } from "./resource";

type GlEncoding = {
  layout: number;
  storage: number;
  type: number;
};

const enum GlFormat {
  Depth16,
  RGBA8,
}

type GlRenderbuffer = Releasable & {
  handle: WebGLRenderbuffer;
  setSize: (size: Vector2) => void;
};

type GlTexture = Releasable & {
  handle: WebGLTexture;
  setSize: (size: Vector2) => void;
};

type TextureImage = {
  pixels: ArrayBufferView<ArrayBufferLike> | undefined;
  target: GLenum;
};

const encodings = new Map<GlFormat, GlEncoding>([
  [
    GlFormat.Depth16,
    {
      layout: WebGL2RenderingContext["DEPTH_COMPONENT"],
      storage: WebGL2RenderingContext["DEPTH_COMPONENT16"],
      type: WebGL2RenderingContext["UNSIGNED_SHORT"],
    },
  ],
  [
    GlFormat.RGBA8,
    {
      layout: WebGL2RenderingContext["RGBA"],
      storage: WebGL2RenderingContext["RGBA8"],
      type: WebGL2RenderingContext["UNSIGNED_BYTE"],
    },
  ],
]);

const wraps = new Map([
  [Wrap.Clamp, WebGL2RenderingContext["CLAMP_TO_EDGE"]],
  [Wrap.Mirror, WebGL2RenderingContext["MIRRORED_REPEAT"]],
  [Wrap.Repeat, WebGL2RenderingContext["REPEAT"]],
]);

const createColorPixels = (
  size: Vector2,
  format: GlFormat,
  color: Vector4,
): ArrayBufferView<ArrayBufferLike> => {
  switch (format) {
    case GlFormat.RGBA8:
      return new Uint8ClampedArray(
        range(size.x * size.y).flatMap(() =>
          Vector4.toArray(
            Vector4.fromSource(color, ["scale", 255], ["map", Math.floor]),
          ),
        ),
      );

    default:
      throw new Error(`Unsupported format ${format}`);
  }
};

const createEmptyPixels = (
  size: Vector2,
  format: GlFormat,
): ArrayBufferView<ArrayBufferLike> => {
  switch (format) {
    case GlFormat.Depth16:
      return new Uint16Array(range(size.x * size.y).map(() => 0));

    case GlFormat.RGBA8:
      return new Uint8ClampedArray(
        range(size.x * size.y).flatMap(() => [0, 0, 0, 0]),
      );

    default:
      throw new Error(`Unsupported format ${format}`);
  }
};

const createRenderbuffer = (
  gl: GlContext,
  size: Vector2,
  format: GlFormat,
  samples: number,
): GlRenderbuffer => {
  const encoding = encodings.get(format);

  if (encoding === undefined) {
    throw Error(`unknown texture format ${format}`);
  }

  const handle = gl.createRenderbuffer();

  if (handle === null) {
    throw Error("could not create renderbuffer");
  }

  const { storage } = encoding;

  const resize = (size: Vector2): void => {
    gl.bindRenderbuffer(gl.RENDERBUFFER, handle);

    if (samples > 1) {
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        samples,
        storage,
        size.x,
        size.y,
      );
    } else {
      gl.renderbufferStorage(gl.RENDERBUFFER, storage, size.x, size.y);
    }

    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  };

  resize(size);

  return {
    release: () => gl.deleteRenderbuffer(handle),
    setSize: resize,
    handle,
  };
};

/**
 * Shared function for creating empty OpenGL textures or loading them from
 * existing data. Returned object supports a resizing function that only works
 * when creating empty textures: loaded ones must always match size from data.
 */
const createOrLoadTexture = (
  gl: GlContext,
  textureTarget: GLenum,
  size: Vector2,
  format: GlFormat,
  sampler: TextureSampler,
  images: TextureImage[],
): GlTexture => {
  const encoding = encodings.get(format);

  if (encoding === undefined) {
    throw Error(`unknown texture format ${format}`);
  }

  const wrap = wraps.get(sampler.wrap);

  if (wrap === undefined) {
    throw Error(`unknown texture wrap mode ${wrap}`);
  }

  const handle = gl.createTexture();

  if (handle === null) {
    throw Error("could not create texture");
  }

  const { magnifier, minifier, mipmap } = sampler;

  const setSize = (size: Vector2): void => {
    gl.bindTexture(textureTarget, handle);

    // Define texture format, filtering & wrapping parameters
    const minifierMipmapFilter =
      minifier === Interpolation.Linear
        ? gl.NEAREST_MIPMAP_LINEAR
        : gl.NEAREST_MIPMAP_NEAREST;
    const minifierSingleFilter =
      minifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;

    gl.texParameteri(
      textureTarget,
      WebGL2RenderingContext["TEXTURE_MAG_FILTER"],
      magnifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST,
    );
    gl.texParameteri(
      textureTarget,
      WebGL2RenderingContext["TEXTURE_MIN_FILTER"],
      mipmap ? minifierMipmapFilter : minifierSingleFilter,
    );
    gl.texParameteri(
      textureTarget,
      WebGL2RenderingContext["TEXTURE_WRAP_S"],
      wrap,
    );
    gl.texParameteri(
      textureTarget,
      WebGL2RenderingContext["TEXTURE_WRAP_T"],
      wrap,
    );

    // Assign images to targets
    const { layout, storage, type } = encoding;
    const { x, y } = size;

    let emptyPixels: ArrayBufferView<ArrayBufferLike> | undefined = undefined;

    for (const { pixels, target } of images) {
      let imagePixels: ArrayBufferView<ArrayBufferLike>;

      if (pixels !== undefined) {
        imagePixels = pixels;
      } else {
        if (emptyPixels === undefined) {
          emptyPixels = createEmptyPixels(size, format);
        }

        imagePixels = emptyPixels;
      }

      gl.texImage2D(target, 0, storage, x, y, 0, layout, type, imagePixels);
    }

    // Generate mipmap if requested
    if (mipmap) {
      gl.generateMipmap(textureTarget);
    }

    gl.bindTexture(textureTarget, null);
  };

  setSize(size);

  return {
    release: () => gl.deleteTexture(handle),
    setSize,
    handle,
  };
};

/**
 * Create empty cube map texture with resize support.
 */
const createCubeTexture = (
  gl: GlContext,
  size: Vector2,
  format: GlFormat,
  sampler: TextureSampler,
) => {
  return createOrLoadTexture(
    gl,
    WebGL2RenderingContext["TEXTURE_CUBE_MAP"],
    size,
    format,
    sampler,
    [
      {
        pixels: undefined,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_X"],
      },
      {
        pixels: undefined,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_NEGATIVE_X"],
      },
      {
        pixels: undefined,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_Y"],
      },
      {
        pixels: undefined,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_NEGATIVE_Y"],
      },
      {
        pixels: undefined,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_Z"],
      },
      {
        pixels: undefined,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_NEGATIVE_Z"],
      },
    ],
  );
};

/**
 * Create cube map texture from pixels ; can't be resized.
 */
const createCubeTextureFromPixels = (
  gl: GlContext,
  size: Vector2,
  format: GlFormat,
  sampler: TextureSampler,
  xPositivePixels: ArrayBufferView<ArrayBufferLike>,
  xNegativePixels: ArrayBufferView<ArrayBufferLike>,
  yPositivePixels: ArrayBufferView<ArrayBufferLike>,
  yNegativePixels: ArrayBufferView<ArrayBufferLike>,
  zPositivePixels: ArrayBufferView<ArrayBufferLike>,
  zNegativePixels: ArrayBufferView<ArrayBufferLike>,
) =>
  createOrLoadTexture(
    gl,
    WebGL2RenderingContext["TEXTURE_CUBE_MAP"],
    size,
    format,
    sampler,
    [
      {
        pixels: xPositivePixels,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_X"],
      },
      {
        pixels: xNegativePixels,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_NEGATIVE_X"],
      },
      {
        pixels: yPositivePixels,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_Y"],
      },
      {
        pixels: yNegativePixels,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_NEGATIVE_Y"],
      },
      {
        pixels: zPositivePixels,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_Z"],
      },
      {
        pixels: zNegativePixels,
        target: WebGL2RenderingContext["TEXTURE_CUBE_MAP_NEGATIVE_Z"],
      },
    ],
  );

/**
 * Create empty quad texture with resize support.
 */
const createQuadTexture = (
  gl: GlContext,
  size: Vector2,
  format: GlFormat,
  sampler: TextureSampler,
) =>
  createOrLoadTexture(
    gl,
    WebGL2RenderingContext["TEXTURE_2D"],
    size,
    format,
    sampler,
    [{ pixels: undefined, target: WebGL2RenderingContext["TEXTURE_2D"] }],
  );

/**
 * Create quad texture from pixels ; can't be resized.
 */
const createQuadTextureFromPixels = (
  gl: GlContext,
  size: Vector2,
  format: GlFormat,
  sampler: TextureSampler,
  pixels: ArrayBufferView<ArrayBufferLike>,
) =>
  createOrLoadTexture(
    gl,
    WebGL2RenderingContext["TEXTURE_2D"],
    size,
    format,
    sampler,
    [{ pixels, target: WebGL2RenderingContext["TEXTURE_2D"] }],
  );

export {
  type GlRenderbuffer,
  type GlTexture,
  GlFormat,
  createColorPixels,
  createCubeTexture,
  createCubeTextureFromPixels,
  createEmptyPixels,
  createQuadTexture,
  createQuadTextureFromPixels,
  createRenderbuffer,
};
