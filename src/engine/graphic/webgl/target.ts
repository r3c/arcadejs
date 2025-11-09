import { range } from "../../language/iterable";
import { Interpolation, Wrap } from "../mesh";
import { Vector2, Vector4 } from "../../math/vector";
import { GlBuffer, GlContext } from "./resource";
import { Releasable } from "../../io/resource";
import {
  GlFormat,
  GlMap,
  GlRenderbuffer,
  GlTexture,
  createRenderbuffer,
  createTexture,
} from "./texture";

type GlAttachment = Releasable & {
  setRenderbuffer(renderbuffer: GlRenderbuffer): void;
  setSize(size: Vector2): void;
  setTextures(textures: readonly GlTexture[]): void;
};

const enum GlAttachementTarget {
  Color,
  Depth,
}

type GlAttachmentTexture = {
  format: GlFormat;
  map: GlMap;
};

const enum GlPencil {
  Triangle,
  Wire,
}

type GlTarget = {
  clear(): void;
  draw(mode: GlPencil, indexBuffer: GlBuffer): void;
  setColorClear(color: Vector4): void;
  setDepthClear(depth: number): void;
  setSize(size: Vector2): void;
};

type GlFramebufferTarget = GlTarget &
  Releasable & {
    setColorRenderbuffer(format: GlFormat): GlRenderbuffer;
    setColorTextures(attachmentTextures: GlAttachmentTexture[]): GlTexture[];
    setDepthRenderbuffer(format: GlFormat): GlRenderbuffer;
    setDepthTexture(attachmentTextures: GlAttachmentTexture): GlTexture;
  };

type GlScreenTarget = GlTarget;

const drawModes = new Map<GlPencil, number>([
  [GlPencil.Triangle, WebGL2RenderingContext["TRIANGLES"]],
  [GlPencil.Wire, WebGL2RenderingContext["LINES"]],
]);

const createAttachment = (): GlAttachment => {
  let currentRenderbuffer: GlRenderbuffer | undefined = undefined;
  let currentTextures: readonly GlTexture[] = [];

  const release = () => {
    if (currentRenderbuffer !== undefined) {
      currentRenderbuffer.release();
      currentRenderbuffer = undefined;
    }

    for (const texture of currentTextures) {
      texture.release();
    }

    currentTextures = [];
  };

  return {
    release,
    setRenderbuffer(renderbuffer) {
      release();
      currentRenderbuffer = renderbuffer;
    },
    setSize(size) {
      if (currentRenderbuffer !== undefined) {
        currentRenderbuffer.setSize(size);
      }

      for (const texture of currentTextures) {
        texture.setSize(size);
      }
    },
    setTextures(textures) {
      release();
      currentTextures = textures;
    },
  };
};

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

    draw(pencil, indexBuffer) {
      const drawMode = drawModes.get(pencil);

      if (drawMode === undefined) {
        throw Error(`unknown pencil ${pencil}`);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, viewSize.x, viewSize.y);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
      gl.drawElements(drawMode, indexBuffer.length, indexBuffer.type, 0);
    },

    release() {
      colorAttachment.release();
      depthAttachment.release();
    },

    setColorClear(color) {
      colorClear.set(color);
    },

    setColorRenderbuffer(format) {
      const renderbuffer = attachRenderbuffer(
        gl,
        viewSize,
        framebuffer,
        format,
        GlAttachementTarget.Color
      );

      colorAttachment.setRenderbuffer(renderbuffer);

      return renderbuffer;
    },

    setColorTextures(attachmentTextures) {
      const textures = attachTextures(
        gl,
        viewSize,
        framebuffer,
        attachmentTextures,
        GlAttachementTarget.Color
      );

      colorAttachment.setTextures(textures);

      // Configure draw buffers
      const buffers = range(textures.length).map(
        (i) => gl.COLOR_ATTACHMENT0 + i
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.drawBuffers(buffers);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return textures;
    },

    setDepthClear(depth: number) {
      depthClear = depth;
    },

    setDepthRenderbuffer(format) {
      const renderbuffer = attachRenderbuffer(
        gl,
        viewSize,
        framebuffer,
        format,
        GlAttachementTarget.Depth
      );

      depthAttachment.setRenderbuffer(renderbuffer);

      return renderbuffer;
    },

    setDepthTexture(attachmentTexture) {
      const textures = attachTextures(
        gl,
        viewSize,
        framebuffer,
        [attachmentTexture],
        GlAttachementTarget.Depth
      );

      depthAttachment.setTextures(textures);

      return textures[0];
    },

    setSize(size) {
      colorAttachment.setSize(size);
      depthAttachment.setSize(size);
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

    draw(pencil, indexBuffer) {
      const drawMode = drawModes.get(pencil);

      if (drawMode === undefined) {
        throw Error(`unknown pencil ${pencil}`);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewSize.x, viewSize.y);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
      gl.drawElements(drawMode, indexBuffer.length, indexBuffer.type, 0);
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
  format: GlFormat,
  target: number
): GlRenderbuffer => {
  // Create renderbuffer attachment
  const renderbuffer = createRenderbuffer(gl, viewSize, format, 1);

  // Bind attachment to framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    target,
    gl.RENDERBUFFER,
    renderbuffer.handle
  );

  checkFramebuffer(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return renderbuffer;
};

const attachTextures = (
  gl: WebGL2RenderingContext,
  size: Vector2,
  framebuffer: WebGLFramebuffer,
  attachmentTextures: GlAttachmentTexture[],
  target: GlAttachementTarget
) => {
  // Create new texture attachment
  const filter = {
    magnifier: Interpolation.Nearest,
    minifier: Interpolation.Nearest,
    mipmap: false,
    wrap: Wrap.Clamp,
  };

  const textures: GlTexture[] = [];

  let attachmentIndex = 0;

  for (const { format, map } of attachmentTextures) {
    const attachmentTarget = getAttachment(target, attachmentIndex++);
    const texture = createTexture(gl, map, size, format, filter, undefined);

    // Generate texture targets
    let textureTargets: number[];

    switch (map) {
      case GlMap.Cube:
        textureTargets = range(6).map(
          (i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i
        );

        break;

      case GlMap.Quad:
        textureTargets = [gl.TEXTURE_2D];

        break;

      default:
        throw Error(`invalid map ${map}`);
    }

    // Bind attachment to framebuffer
    for (const textureTarget of textureTargets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        attachmentTarget,
        textureTarget,
        texture.handle,
        0
      );

      checkFramebuffer(gl);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    textures.push(texture);
  }

  return textures;
};

const getAttachment = (target: GlAttachementTarget, index: number) => {
  switch (target) {
    case GlAttachementTarget.Color:
      return WebGL2RenderingContext["COLOR_ATTACHMENT0"] + index;

    case GlAttachementTarget.Depth:
      return WebGL2RenderingContext["DEPTH_ATTACHMENT"] + index;

    default:
      throw Error(`invalid attachment target ${target}`);
  }
};

export {
  type GlAttachmentTexture,
  type GlFramebufferTarget,
  type GlScreenTarget,
  type GlTarget,
  GlFormat,
  GlMap,
  GlPencil,
  createFramebufferTarget,
  createScreenTarget,
};
