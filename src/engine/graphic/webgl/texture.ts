import { Disposable } from "../../language/lifecycle";
import { Filter, Interpolation, Wrap, defaultFilter } from "../model";
import { GlContext } from "./resource";

/**
 * Default texture lookup, used as fallback values.
 */
type GlDefaultTexture = Disposable & {
  blackTexture: GlTexture;
  whiteTexture: GlTexture;
};

/**
 * Disposable WebGL texture, also circumvent native `WebGLTexture` type being
 * defined as an opaque empty object and therefore being compatible with any
 * unrelated object.
 */
type GlTexture = Disposable & {
  handle: WebGLTexture;
};

const enum GlTextureFormat {
  Depth16,
  RGBA8,
}

const enum GlTextureType {
  Quad,
  Cube,
}

type GlNativeFormat = {
  format: number;
  internal: number;
  type: number;
};

const defaultTexture = (gl: GlContext) => {
  const blackTexture = textureCreate(
    gl,
    undefined,
    GlTextureType.Quad,
    1,
    1,
    GlTextureFormat.RGBA8,
    defaultFilter,
    new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1)
  );

  const whiteTexture = textureCreate(
    gl,
    undefined,
    GlTextureType.Quad,
    1,
    1,
    GlTextureFormat.RGBA8,
    defaultFilter,
    new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1)
  );

  const dispose = () => {
    blackTexture.dispose();
    whiteTexture.dispose();
  };

  return {
    dispose,
    blackTexture,
    whiteTexture,
  };
};

/*
 ** Convert texture format into native WebGL format parameters.
 */
const formatGetNative = (
  gl: GlContext,
  format: GlTextureFormat
): GlNativeFormat => {
  switch (format) {
    case GlTextureFormat.Depth16:
      return {
        format: gl.DEPTH_COMPONENT,
        internal: gl.DEPTH_COMPONENT16,
        type: gl.UNSIGNED_SHORT,
      };

    case GlTextureFormat.RGBA8:
      return {
        format: gl.RGBA,
        internal: gl.RGBA8,
        type: gl.UNSIGNED_BYTE,
      };

    default:
      throw Error(`invalid texture format ${format}`);
  }
};

// TODO: avoid configure + render exported functions
const renderbufferConfigure = (
  gl: GlContext,
  renderbuffer: WebGLRenderbuffer,
  width: number,
  height: number,
  format: GlTextureFormat,
  samples: number
) => {
  const nativeFormat = formatGetNative(gl, format);

  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

  if (samples > 1) {
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      nativeFormat.internal,
      width,
      height
    );
  } else {
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      nativeFormat.internal,
      width,
      height
    );
  }

  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  return renderbuffer;
};

// TODO: avoid configure + render exported functions
const renderbufferCreate = (gl: GlContext) => {
  const renderbuffer = gl.createRenderbuffer();

  if (renderbuffer === null) {
    throw Error("could not create renderbuffer");
  }

  return renderbuffer;
};

const textureGetTarget = (gl: GlContext, type: GlTextureType) => {
  switch (type) {
    case GlTextureType.Cube:
      return gl.TEXTURE_CUBE_MAP;

    case GlTextureType.Quad:
      return gl.TEXTURE_2D;

    default:
      throw Error(`unknown texture type ${type}`);
  }
};

const textureGetWrap = (gl: GlContext, wrap: Wrap) => {
  switch (wrap) {
    case Wrap.Clamp:
      return gl.CLAMP_TO_EDGE;

    case Wrap.Mirror:
      return gl.MIRRORED_REPEAT;

    case Wrap.Repeat:
      return gl.REPEAT;

    default:
      throw Error(`unknown texture wrap mode ${wrap}`);
  }
};

const textureCreate = (
  gl: GlContext,
  previousTexture: GlTexture | undefined,
  type: GlTextureType,
  width: number,
  height: number,
  format: GlTextureFormat,
  filter: Filter,
  image: ImageData | ImageData[] | undefined
): GlTexture => {
  const target = textureGetTarget(gl, type);

  let handle: WebGLTexture;

  if (previousTexture === undefined) {
    const newTexture = gl.createTexture();

    if (newTexture === null) {
      throw Error("could not create texture");
    }

    handle = newTexture;
  } else {
    handle = previousTexture.handle;
  }

  gl.bindTexture(target, handle);

  // Define texture format, filtering & wrapping parameters
  const magnifierFilter =
    filter.magnifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
  const minifierFilter =
    filter.minifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
  const mipmapFilter =
    filter.minifier === Interpolation.Linear
      ? gl.NEAREST_MIPMAP_LINEAR
      : gl.NEAREST_MIPMAP_NEAREST;
  const nativeFormat = formatGetNative(gl, format);
  const wrap = textureGetWrap(gl, filter.wrap);

  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magnifierFilter);
  gl.texParameteri(
    target,
    gl.TEXTURE_MIN_FILTER,
    filter !== undefined && filter.mipmap ? mipmapFilter : minifierFilter
  );
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);

  if (image === undefined) {
    gl.texImage2D(
      target,
      0,
      nativeFormat.internal,
      width,
      height,
      0,
      nativeFormat.format,
      nativeFormat.type,
      null
    );
  } else if ((<ImageData>image).data) {
    gl.texImage2D(
      target,
      0,
      nativeFormat.internal,
      width,
      height,
      0,
      nativeFormat.format,
      nativeFormat.type,
      (<ImageData>image).data
    );
  } else if ((<ImageData[]>image).length !== undefined) {
    const images = <ImageData[]>image;

    for (let i = 0; i < 6; ++i) {
      gl.texImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        0,
        nativeFormat.internal,
        width,
        height,
        0,
        nativeFormat.format,
        nativeFormat.type,
        new Uint8Array((<ImageData>images[i]).data)
      );
    }
  }

  if (filter.mipmap) {
    gl.generateMipmap(target);
  }

  gl.bindTexture(target, null);

  return {
    dispose: () => {
      gl.deleteTexture(handle);
    },
    handle,
  };
};

export {
  type GlDefaultTexture,
  type GlTexture,
  GlTextureFormat,
  GlTextureType,
  defaultTexture,
  renderbufferConfigure,
  renderbufferCreate,
  textureCreate,
};
