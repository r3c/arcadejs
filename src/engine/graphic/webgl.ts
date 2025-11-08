import { range } from "../language/iterable";
import { TextureSampler, Interpolation, Wrap, defaultSampler } from "./mesh";
import { Vector2, Vector4 } from "../math/vector";
import { GlBuffer, GlContext } from "./webgl/resource";
import { Releasable } from "../io/resource";
import {
  GlRenderbuffer,
  GlTexture,
  GlTextureFormat,
  GlTextureType,
  createRenderbuffer,
  createTexture,
} from "./webgl/texture";
import { GlShader, GlShaderSource, createShader } from "./webgl/shader";

type GlAttachment = {
  clear(): void;
  renderbuffer: GlRenderbuffer | undefined;
  textures: GlTexture[];
};

const createAttachment = (): GlAttachment => {
  let renderbuffer: GlRenderbuffer | undefined = undefined;
  let textures: GlTexture[] = [];

  return {
    clear() {
      if (renderbuffer !== undefined) {
        renderbuffer.release();
        renderbuffer = undefined;
      }

      for (const texture of textures) {
        texture.release();
      }

      textures = [];
    },

    renderbuffer,
    textures,
  };
};

enum GlAttachementTarget {
  Color,
  Depth,
}

type GlDrawMode =
  | WebGL2RenderingContext["TRIANGLES"]
  | WebGL2RenderingContext["LINES"];

type GlRuntime = Releasable & {
  createShader: (source: GlShaderSource) => GlShader;
  context: GlContext;
};

const createRuntime = (context: GlContext): GlRuntime => {
  const createConstantTexture = (color: Vector4) =>
    createTexture(
      context,
      GlTextureType.Quad,
      { x: 1, y: 1 },
      GlTextureFormat.RGBA8,
      defaultSampler,
      new ImageData(
        new Uint8ClampedArray(
          Vector4.toArray(
            Vector4.fromSource(color, ["scale", 255], ["map", Math.floor])
          )
        ),
        1,
        1
      )
    );

  const textureBlack = createConstantTexture({ x: 0, y: 0, z: 0, w: 0 });
  const textureNormal = createConstantTexture({ x: 0.5, y: 0.5, z: 1, w: 1 });
  const textureWhite = createConstantTexture({ x: 1, y: 1, z: 1, w: 1 });
  const shaderDefault = { textureBlack, textureNormal, textureWhite };

  let currentProgram: WebGLProgram | undefined = undefined;

  // Forward call to `gl.useProgram` if given program is not already active
  // (may be premature optimization e.g. duplicate of underlying implementation)
  const useProgram = (program: WebGLProgram): void => {
    if (currentProgram !== program) {
      context.useProgram(program);
    }
  };

  return {
    release: () => {
      textureBlack.release();
      textureNormal.release();
      textureWhite.release();
    },
    createShader: (source) =>
      createShader(context, useProgram, shaderDefault, source),
    context,
  };
};

const loadTextureCube = (
  gl: GlContext,
  facePositiveX: ImageData,
  faceNegativeX: ImageData,
  facePositiveY: ImageData,
  faceNegativeY: ImageData,
  facePositiveZ: ImageData,
  faceNegativeZ: ImageData,
  filter?: TextureSampler
): GlTexture => {
  return createTexture(
    gl,
    GlTextureType.Cube,
    { x: facePositiveX.width, y: facePositiveX.height },
    GlTextureFormat.RGBA8,
    filter ?? defaultSampler,
    [
      facePositiveX,
      faceNegativeX,
      facePositiveY,
      faceNegativeY,
      facePositiveZ,
      faceNegativeZ,
    ]
  );
};

const loadTextureQuad = (
  gl: GlContext,
  image: ImageData,
  filter?: TextureSampler
): GlTexture => {
  return createTexture(
    gl,
    GlTextureType.Quad,
    { x: image.width, y: image.height },
    GlTextureFormat.RGBA8,
    filter ?? defaultSampler,
    image
  );
};

type GlTarget = {
  clear(): void;
  draw(mode: GlDrawMode, indexBuffer: GlBuffer): void;
  setColorClear(color: Vector4): void;
  setDepthClear(depth: number): void;
  setSize(size: Vector2): void;
};

type GlFramebufferTarget = GlTarget &
  Releasable & {
    setColorRenderbuffer(format: GlTextureFormat): GlRenderbuffer;
    setColorTexture(format: GlTextureFormat, type: GlTextureType): GlTexture;
    setDepthRenderbuffer(format: GlTextureFormat): GlRenderbuffer;
    setDepthTexture(format: GlTextureFormat, type: GlTextureType): GlTexture;
  };

type GlScreenTarget = GlTarget;

const createFramebufferTarget = (gl: GlContext): GlFramebufferTarget => {
  const colorAttachment = createAttachment();
  const colorClear = Vector4.fromZero();
  const depthAttachment = createAttachment();
  const framebuffer = gl.createFramebuffer();

  if (framebuffer === null) {
    throw Error("could not create framebuffer");
  }

  const viewSize = Vector2.fromZero(["setFromXY", 1, 1]);

  let depthClear = 1;

  return {
    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, viewSize.x, viewSize.y);
      gl.clearColor(colorClear.x, colorClear.y, colorClear.z, colorClear.z);
      gl.clearDepth(depthClear);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },

    draw(mode: GlDrawMode, indexBuffer: GlBuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, viewSize.x, viewSize.y);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
      gl.drawElements(mode, indexBuffer.length, indexBuffer.type, 0);
    },

    release() {
      colorAttachment.clear();
      depthAttachment.clear();
    },

    setColorClear(color: Vector4) {
      colorClear.set(color);
    },

    setColorRenderbuffer(format: GlTextureFormat) {
      return attachRenderbuffer(
        gl,
        viewSize,
        framebuffer,
        colorAttachment,
        format,
        GlAttachementTarget.Color
      );
    },

    setColorTexture(format: GlTextureFormat, type: GlTextureType) {
      const texture = attachTexture(
        gl,
        viewSize,
        framebuffer,
        colorAttachment,
        format,
        type,
        GlAttachementTarget.Color
      );

      // Configure draw buffers
      const buffers = range(colorAttachment.textures.length).map(
        (i) => gl.COLOR_ATTACHMENT0 + i
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.drawBuffers(buffers);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return texture;
    },

    setDepthClear(depth: number) {
      depthClear = depth;
    },

    setDepthRenderbuffer(format: GlTextureFormat) {
      return attachRenderbuffer(
        gl,
        viewSize,
        framebuffer,
        depthAttachment,
        format,
        GlAttachementTarget.Depth
      );
    },

    setDepthTexture(format: GlTextureFormat, type: GlTextureType) {
      return attachTexture(
        gl,
        viewSize,
        framebuffer,
        depthAttachment,
        format,
        type,
        GlAttachementTarget.Depth
      );
    },

    setSize(size) {
      for (const attachment of [colorAttachment, depthAttachment]) {
        // Resize existing renderbuffer attachment if any
        if (attachment.renderbuffer !== undefined) {
          attachment.renderbuffer.setSize(size);
        }

        // Resize previously existing texture attachments if any
        for (const texture of attachment.textures) {
          texture.setSize(size);
        }
      }

      viewSize.set(size);
    },
  };
};

const createScreenTarget = (gl: GlContext): GlScreenTarget => {
  const colorClear = Vector4.fromZero();
  const viewSize = Vector2.fromZero();

  let depthClear = 1;

  return {
    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewSize.x, viewSize.y);

      gl.clearColor(colorClear.x, colorClear.y, colorClear.z, colorClear.z);
      gl.clearDepth(depthClear);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },

    draw(mode, indexBuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewSize.x, viewSize.y);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
      gl.drawElements(mode, indexBuffer.length, indexBuffer.type, 0);
    },

    setColorClear(color) {
      colorClear.set(color);
    },

    setDepthClear(depth) {
      depthClear = depth;
    },

    setSize(size) {
      viewSize.set(size);
    },
  };
};

const checkFramebuffer = (gl: WebGL2RenderingContext) => {
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw Error("invalid framebuffer operation");
  }
};

const attachRenderbuffer = (
  gl: WebGL2RenderingContext,
  viewSize: Vector2,
  framebuffer: WebGLFramebuffer,
  attachment: GlAttachment,
  format: GlTextureFormat,
  target: number
): GlRenderbuffer => {
  // Clear renderbuffer and texture attachments if any
  attachment.clear();

  // Create renderbuffer attachment
  attachment.renderbuffer = createRenderbuffer(gl, viewSize, format, 1);

  // Bind attachment to framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    target,
    gl.RENDERBUFFER,
    attachment.renderbuffer.handle
  );

  checkFramebuffer(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return attachment.renderbuffer;
};

const attachTexture = (
  gl: WebGL2RenderingContext,
  viewSize: Vector2,
  framebuffer: WebGLFramebuffer,
  attachment: GlAttachment,
  format: GlTextureFormat,
  type: GlTextureType,
  framebufferTarget: GlAttachementTarget
) => {
  // Clear renderbuffer attachment if any
  attachment.clear();

  // Generate texture targets
  let textureTargets: number[];

  switch (type) {
    case GlTextureType.Cube:
      textureTargets = range(6).map((i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i);

      break;

    case GlTextureType.Quad:
      textureTargets = [gl.TEXTURE_2D];

      break;

    default:
      throw Error(`invalid texture type ${type}`);
  }

  // Create new texture attachment
  const filter = {
    magnifier: Interpolation.Nearest,
    minifier: Interpolation.Nearest,
    mipmap: false,
    wrap: Wrap.Clamp,
  };

  const texture = createTexture(gl, type, viewSize, format, filter, undefined);

  // Bind frame buffers
  for (let i = 0; i < textureTargets.length; ++i) {
    const textureTarget = textureTargets[i];

    const offset = attachment.textures.push(texture);

    // Bind attachment to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      getAttachment(framebufferTarget, offset - 1),
      textureTarget,
      texture.handle,
      0
    );

    checkFramebuffer(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return texture;
};

const getAttachment = (
  attachementTarget: GlAttachementTarget,
  index: number
) => {
  switch (attachementTarget) {
    case GlAttachementTarget.Color:
      return WebGL2RenderingContext["COLOR_ATTACHMENT0"] + index;

    case GlAttachementTarget.Depth:
      return WebGL2RenderingContext["DEPTH_ATTACHMENT"] + index;

    default:
      throw Error(`invalid attachment target ${attachementTarget}`);
  }
};

export {
  type GlFramebufferTarget,
  type GlRuntime,
  type GlScreenTarget,
  type GlTarget,
  GlTextureFormat,
  GlTextureType,
  createRuntime,
  createFramebufferTarget,
  createScreenTarget,
  loadTextureCube,
  loadTextureQuad,
};
