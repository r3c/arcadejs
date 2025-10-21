import { Releasable } from "../../io/resource";
import { TextureSampler, Interpolation, Wrap } from "../mesh";
import { GlContext } from "./resource";

type GlStorage = {
  format: number;
  internal: number;
  type: number;
};

type GlTexture = Releasable & {
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

const storages = new Map<GlTextureFormat, GlStorage>([
  [
    GlTextureFormat.Depth16,
    {
      format: WebGL2RenderingContext["DEPTH_COMPONENT"],
      internal: WebGL2RenderingContext["DEPTH_COMPONENT16"],
      type: WebGL2RenderingContext["UNSIGNED_SHORT"],
    },
  ],
  [
    GlTextureFormat.RGBA8,
    {
      format: WebGL2RenderingContext["RGBA"],
      internal: WebGL2RenderingContext["RGBA8"],
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

// TODO: avoid configure + render exported functions
const renderbufferConfigure = (
  gl: GlContext,
  renderbuffer: WebGLRenderbuffer,
  width: number,
  height: number,
  format: GlTextureFormat,
  samples: number
) => {
  const storage = storages.get(format);

  if (storage === undefined) {
    throw Error(`unknown texture format ${format}`);
  }

  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

  if (samples > 1) {
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      storage.internal,
      width,
      height
    );
  } else {
    gl.renderbufferStorage(gl.RENDERBUFFER, storage.internal, width, height);
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

const createTexture = (
  gl: GlContext,
  previousTexture: GlTexture | undefined,
  type: GlTextureType,
  width: number,
  height: number,
  format: GlTextureFormat,
  sampler: TextureSampler,
  image: ImageData | ImageData[] | undefined
): GlTexture => {
  const storage = storages.get(format);

  if (storage === undefined) {
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
    sampler.magnifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
  const minifierFilter =
    sampler.minifier === Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
  const mipmapFilter =
    sampler.minifier === Interpolation.Linear
      ? gl.NEAREST_MIPMAP_LINEAR
      : gl.NEAREST_MIPMAP_NEAREST;

  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magnifierFilter);
  gl.texParameteri(
    target,
    gl.TEXTURE_MIN_FILTER,
    sampler.mipmap ? mipmapFilter : minifierFilter
  );
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);

  if (image === undefined) {
    gl.texImage2D(
      target,
      0,
      storage.internal,
      width,
      height,
      0,
      storage.format,
      storage.type,
      null
    );
  } else if ((<ImageData>image).data) {
    gl.texImage2D(
      target,
      0,
      storage.internal,
      width,
      height,
      0,
      storage.format,
      storage.type,
      (<ImageData>image).data
    );
  } else if ((<ImageData[]>image).length !== undefined) {
    const images = <ImageData[]>image;

    for (let i = 0; i < 6; ++i) {
      gl.texImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        0,
        storage.internal,
        width,
        height,
        0,
        storage.format,
        storage.type,
        new Uint8Array((<ImageData>images[i]).data)
      );
    }
  }

  if (sampler.mipmap) {
    gl.generateMipmap(target);
  }

  gl.bindTexture(target, null);

  return {
    release: () => {
      gl.deleteTexture(handle);
    },
    handle,
  };
};

export {
  type GlTexture,
  GlTextureFormat,
  GlTextureType,
  createTexture,
  renderbufferConfigure,
  renderbufferCreate,
};
