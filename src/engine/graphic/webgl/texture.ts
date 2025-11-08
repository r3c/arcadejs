import { Releasable } from "../../io/resource";
import { Vector2 } from "../../math/vector";
import { TextureSampler, Interpolation, Wrap } from "../mesh";
import { GlContext } from "./resource";

type GlEncoding = {
  layout: number;
  storage: number;
  type: number;
};

type GlRenderbuffer = Releasable & {
  handle: WebGLRenderbuffer;
  setSize: (size: Vector2) => void;
};

type GlTexture = Releasable & {
  handle: WebGLTexture;
  setSize: (size: Vector2) => void;
};

const enum GlTextureFormat {
  Depth16,
  RGBA8,
}

const enum GlTextureType {
  Quad,
  Cube,
}

const encodings = new Map<GlTextureFormat, GlEncoding>([
  [
    GlTextureFormat.Depth16,
    {
      layout: WebGL2RenderingContext["DEPTH_COMPONENT"],
      storage: WebGL2RenderingContext["DEPTH_COMPONENT16"],
      type: WebGL2RenderingContext["UNSIGNED_SHORT"],
    },
  ],
  [
    GlTextureFormat.RGBA8,
    {
      layout: WebGL2RenderingContext["RGBA"],
      storage: WebGL2RenderingContext["RGBA8"],
      type: WebGL2RenderingContext["UNSIGNED_BYTE"],
    },
  ],
]);

const targets = new Map([
  [GlTextureType.Cube, WebGL2RenderingContext["TEXTURE_CUBE_MAP"]],
  [GlTextureType.Quad, WebGL2RenderingContext["TEXTURE_2D"]],
]);

const wraps = new Map([
  [Wrap.Clamp, WebGL2RenderingContext["CLAMP_TO_EDGE"]],
  [Wrap.Mirror, WebGL2RenderingContext["MIRRORED_REPEAT"]],
  [Wrap.Repeat, WebGL2RenderingContext["REPEAT"]],
]);

const createRenderbuffer = (
  gl: GlContext,
  size: Vector2,
  format: GlTextureFormat,
  samples: number
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
        size.y
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

const createTexture = (
  gl: GlContext,
  type: GlTextureType,
  size: Vector2,
  format: GlTextureFormat,
  sampler: TextureSampler,
  image: ImageData | ImageData[] | undefined
): GlTexture => {
  const encoding = encodings.get(format);

  if (encoding === undefined) {
    throw Error(`unknown texture format ${format}`);
  }

  const target = targets.get(type);

  if (target === undefined) {
    throw Error(`unknown texture type ${type}`);
  }

  const wrap = wraps.get(sampler.wrap);

  if (wrap === undefined) {
    throw Error(`unknown texture wrap mode ${wrap}`);
  }

  const handle = gl.createTexture();

  if (handle === null) {
    throw Error("could not create texture");
  }

  const resize = (size: Vector2): void => {
    gl.bindTexture(target, handle);

    // Define texture format, filtering & wrapping parameters
    const magnifierFilter =
      sampler.magnifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
    const minifierMipmapFilter =
      sampler.minifier === Interpolation.Linear
        ? gl.NEAREST_MIPMAP_LINEAR
        : gl.NEAREST_MIPMAP_NEAREST;
    const minifierSingleFilter =
      sampler.minifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
    const minifierFilter = sampler.mipmap
      ? minifierMipmapFilter
      : minifierSingleFilter;

    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magnifierFilter);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, minifierFilter);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);

    const { layout, storage, type } = encoding;
    const { x, y } = size;
    const imageArray = image as ImageData[];
    const imageData = image as ImageData;

    if (image === undefined) {
      gl.texImage2D(target, 0, storage, x, y, 0, layout, type, null);
    } else if (imageData.data !== undefined) {
      gl.texImage2D(target, 0, storage, x, y, 0, layout, type, imageData.data);
    } else if (imageArray.length !== undefined) {
      for (let i = 0; i < 6; ++i) {
        const pixels = new Uint8Array(imageArray[i].data);
        const face = gl.TEXTURE_CUBE_MAP_POSITIVE_X + i;

        gl.texImage2D(face, 0, storage, x, y, 0, layout, type, pixels);
      }
    }

    if (sampler.mipmap) {
      gl.generateMipmap(target);
    }

    gl.bindTexture(target, null);
  };

  resize(size);

  return {
    release: () => gl.deleteTexture(handle),
    setSize: resize,
    handle,
  };
};

export {
  type GlRenderbuffer,
  type GlTexture,
  GlTextureFormat,
  GlTextureType,
  createRenderbuffer,
  createTexture,
};
