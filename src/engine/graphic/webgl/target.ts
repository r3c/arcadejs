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

type GlCubeTextureAttachment = {
  activateFace(face: number): void;
  texture: GlTexture;
};

type GlQuadTextureAttachment = {
  texture: GlTexture;
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
    setColorCubeTextures(formats: GlFormat[]): GlCubeTextureAttachment[];
    setColorQuadTextures(formats: GlFormat[]): GlQuadTextureAttachment[];
    setColorRenderbuffer(format: GlFormat): GlRenderbuffer;
    setDepthCubeTexture(format: GlFormat): GlCubeTextureAttachment;
    setDepthQuadTexture(format: GlFormat): GlQuadTextureAttachment;
    setDepthRenderbuffer(format: GlFormat): GlRenderbuffer;
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

    setColorCubeTextures(formats) {
      const attachment = WebGL2RenderingContext["COLOR_ATTACHMENT0"];
      const textures = createTextures(gl, viewSize, formats, GlMap.Cube);

      colorAttachment.setTextures(textures);

      // Configure draw buffers
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.drawBuffers(range(textures.length).map((i) => attachment + i));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Return attachments
      return textures.map((texture, textureIndex) => {
        const activateFace = (faceIndex: number) =>
          activateTexture(
            gl,
            framebuffer,
            attachment + textureIndex,
            WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_X"] + faceIndex,
            texture,
          );

        activateFace(0);

        return { activateFace, texture };
      });
    },

    setColorQuadTextures(formats) {
      const attachment = WebGL2RenderingContext["COLOR_ATTACHMENT0"];
      const textures = createTextures(gl, viewSize, formats, GlMap.Quad);

      colorAttachment.setTextures(textures);

      // Configure & activate draw buffers
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.drawBuffers(range(textures.length).map((i) => attachment + i));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      for (let i = 0; i < textures.length; ++i) {
        activateTexture(
          gl,
          framebuffer,
          attachment + i,
          WebGL2RenderingContext["TEXTURE_2D"],
          textures[i],
        );
      }

      // Return attachments
      return textures.map((texture) => ({ texture }));
    },

    setColorRenderbuffer(format) {
      const renderbuffer = attachRenderbuffer(
        gl,
        viewSize,
        framebuffer,
        format,
        WebGL2RenderingContext["COLOR_ATTACHMENT0"],
      );

      colorAttachment.setRenderbuffer(renderbuffer);

      return renderbuffer;
    },

    setDepthClear(depth: number) {
      depthClear = depth;
    },

    setDepthCubeTexture(format) {
      const attachment = WebGL2RenderingContext["DEPTH_ATTACHMENT"];
      const textures = createTextures(gl, viewSize, [format], GlMap.Cube);
      const texture = textures[0];

      depthAttachment.setTextures(textures);

      // Activate first face and return attachment
      const activateFace = (faceIndex: number) =>
        activateTexture(
          gl,
          framebuffer,
          attachment,
          WebGL2RenderingContext["TEXTURE_CUBE_MAP_POSITIVE_X"] + faceIndex,
          texture,
        );

      activateFace(0);

      return { activateFace, texture };
    },

    setDepthQuadTexture(format) {
      const attachment = WebGL2RenderingContext["DEPTH_ATTACHMENT"];
      const textures = createTextures(gl, viewSize, [format], GlMap.Quad);
      const texture = textures[0];

      depthAttachment.setTextures(textures);

      // Activate and return attachment
      activateTexture(
        gl,
        framebuffer,
        attachment,
        WebGL2RenderingContext["TEXTURE_2D"],
        texture,
      );

      return { texture };
    },

    setDepthRenderbuffer(format) {
      const renderbuffer = attachRenderbuffer(
        gl,
        viewSize,
        framebuffer,
        format,
        WebGL2RenderingContext["DEPTH_ATTACHMENT"],
      );

      depthAttachment.setRenderbuffer(renderbuffer);

      return renderbuffer;
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
  attachment: GLenum,
): GlRenderbuffer => {
  // Create renderbuffer attachment
  const renderbuffer = createRenderbuffer(gl, viewSize, format, 1);

  // Bind attachment to framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    attachment,
    gl.RENDERBUFFER,
    renderbuffer.handle,
  );

  checkFramebuffer(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return renderbuffer;
};

const activateTexture = (
  gl: WebGL2RenderingContext,
  framebuffer: WebGLFramebuffer,
  attachment: GLenum,
  textureTarget: GLenum,
  texture: GlTexture,
): void => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    attachment,
    textureTarget,
    texture.handle,
    0,
  );

  checkFramebuffer(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const createTextures = (
  gl: WebGL2RenderingContext,
  size: Vector2,
  formats: GlFormat[],
  map: GlMap,
) => {
  // Create new texture attachment
  const filter = {
    magnifier: Interpolation.Nearest,
    minifier: Interpolation.Nearest,
    mipmap: false,
    wrap: Wrap.Clamp,
  };

  return formats.map((format) =>
    createTexture(gl, map, size, format, filter, undefined),
  );
};

export {
  type GlCubeTextureAttachment,
  type GlFramebufferTarget,
  type GlQuadTextureAttachment,
  type GlScreenTarget,
  type GlTarget,
  GlFormat,
  GlMap,
  GlPencil,
  createFramebufferTarget,
  createScreenTarget,
};
