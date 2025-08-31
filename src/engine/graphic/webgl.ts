import { range } from "../language/iterable";
import { Matrix3, Matrix4 } from "../math/matrix";
import { TextureSampler, Interpolation, Wrap, defaultSampler } from "./mesh";
import { MutableVector2, Vector2, Vector4 } from "../math/vector";
import { GlBuffer, GlContext } from "./webgl/resource";
import { Disposable } from "../language/lifecycle";
import {
  GlTexture,
  GlTextureFormat,
  GlTextureType,
  renderbufferConfigure,
  renderbufferCreate,
  createTexture,
} from "./webgl/texture";
import { GlShader, GlShaderDirectives, createShader } from "./webgl/shader";

type GlAttachment = {
  renderbuffer: GlAttachmentRenderbuffer | undefined;
  textures: GlAttachmentTexture[];
};

type GlAttachmentRenderbuffer = {
  format: GlTextureFormat;
  handle: WebGLRenderbuffer;
};

enum GlAttachementTarget {
  Color,
  Depth,
}

type GlAttachmentTexture = {
  format: GlTextureFormat;
  handle: GlTexture;
};

type GlDrawMode =
  | WebGL2RenderingContext["TRIANGLES"]
  | WebGL2RenderingContext["LINES"];

// FIXME: delete class once not used anymore
type GlGeometry = {
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
};

type GlPainter<TScene> = {
  paint(target: GlTarget, scene: TScene): void;
};

type GlRuntime = Disposable & {
  createShader: (
    vertexShaderSource: string,
    fragmentShaderSource: string,
    directives: GlShaderDirectives
  ) => GlShader;
  context: GlContext;
};

const createRuntime = (context: GlContext): GlRuntime => {
  const createConstantTexture = (color: Vector4) =>
    createTexture(
      context,
      undefined,
      GlTextureType.Quad,
      1,
      1,
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
    dispose: () => {
      textureBlack.dispose();
      textureNormal.dispose();
      textureWhite.dispose();
    },
    createShader: (vertexShaderSource, fragmentShaderSource, directives) => {
      return createShader(
        context,
        useProgram,
        shaderDefault,
        vertexShaderSource,
        fragmentShaderSource,
        directives
      );
    },
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
    undefined,
    GlTextureType.Cube,
    facePositiveX.width,
    facePositiveX.height,
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
    undefined,
    GlTextureType.Quad,
    image.width,
    image.height,
    GlTextureFormat.RGBA8,
    filter ?? defaultSampler,
    image
  );
};

class GlTarget {
  private readonly gl: GlContext;

  private colorAttachment: GlAttachment;
  private colorClear: Vector4;
  private depthAttachment: GlAttachment;
  private depthClear: number;
  private framebuffers: WebGLFramebuffer[];
  private viewSize: MutableVector2;

  public constructor(gl: GlContext, size: Vector2) {
    this.colorAttachment = { renderbuffer: undefined, textures: [] };
    this.colorClear = { x: 0, y: 0, z: 0, w: 0 };
    this.depthAttachment = { renderbuffer: undefined, textures: [] };
    this.depthClear = 1;
    this.framebuffers = [];
    this.gl = gl;
    this.viewSize = Vector2.fromSource(size);
  }

  public clear(framebufferIndex: number) {
    const gl = this.gl;

    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      framebufferIndex < this.framebuffers.length
        ? this.framebuffers[framebufferIndex]
        : null
    );
    gl.viewport(0, 0, this.viewSize.x, this.viewSize.y);

    gl.clearColor(
      this.colorClear.x,
      this.colorClear.y,
      this.colorClear.z,
      this.colorClear.z
    );
    gl.clearDepth(this.depthClear);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  public dispose() {
    const gl = this.gl;

    GlTarget.clearRenderbufferAttachments(gl, this.colorAttachment);
    GlTarget.clearTextureAttachments(gl, this.depthAttachment);
  }

  public draw(
    framebufferIndex: number,
    mode: GlDrawMode,
    indexBuffer: GlBuffer
  ) {
    const gl = this.gl;

    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      framebufferIndex < this.framebuffers.length
        ? this.framebuffers[framebufferIndex]
        : null
    );
    gl.viewport(0, 0, this.viewSize.x, this.viewSize.y);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
    gl.drawElements(mode, indexBuffer.length, indexBuffer.type, 0);
  }

  public resize(size: Vector2) {
    const gl = this.gl;

    for (const attachment of [this.colorAttachment, this.depthAttachment]) {
      // Resize existing renderbuffer attachment if any
      if (attachment.renderbuffer !== undefined) {
        renderbufferConfigure(
          gl,
          attachment.renderbuffer.handle,
          size.x,
          size.y,
          attachment.renderbuffer.format,
          1
        );
      }

      // Resize previously existing texture attachments if any
      for (const texture of attachment.textures) {
        createTexture(
          gl,
          texture.handle,
          GlTextureType.Quad,
          size.x,
          size.y,
          texture.format,
          defaultSampler,
          undefined
        );
      }
    }

    this.viewSize.set(size);
  }

  public setClearColor(r: number, g: number, b: number, a: number) {
    this.colorClear = { x: r, y: g, z: b, w: a };
  }

  public setClearDepth(depth: number) {
    this.depthClear = depth;
  }

  public setupColorRenderbuffer(format: GlTextureFormat) {
    return this.attachRenderbuffer(
      this.colorAttachment,
      format,
      GlAttachementTarget.Color
    );
  }

  public setupColorTexture(format: GlTextureFormat, type: GlTextureType) {
    const texture = this.attachTexture(
      this.colorAttachment,
      format,
      type,
      GlAttachementTarget.Color
    );

    // Configure draw buffers
    const gl = this.gl;

    for (const framebuffer of this.framebuffers) {
      if (framebuffer === undefined) {
        continue;
      }

      const buffers = range(this.colorAttachment.textures.length).map(
        (i) => gl.COLOR_ATTACHMENT0 + i
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.drawBuffers(buffers);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    return texture;
  }

  public setupDepthRenderbuffer(format: GlTextureFormat) {
    return this.attachRenderbuffer(
      this.depthAttachment,
      format,
      GlAttachementTarget.Depth
    );
  }

  public setupDepthTexture(format: GlTextureFormat, type: GlTextureType) {
    return this.attachTexture(
      this.depthAttachment,
      format,
      type,
      GlAttachementTarget.Depth
    );
  }

  private static clearRenderbufferAttachments(
    gl: GlContext,
    attachment: GlAttachment
  ) {
    if (attachment.renderbuffer !== undefined) {
      gl.deleteRenderbuffer(attachment.renderbuffer.handle);

      attachment.renderbuffer = undefined;
    }
  }

  private static clearTextureAttachments(
    gl: GlContext,
    attachment: GlAttachment
  ) {
    for (const texture of attachment.textures) {
      gl.deleteTexture(texture.handle);
    }

    attachment.textures = [];
  }

  private static checkFramebuffer(gl: GlContext) {
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw Error("invalid framebuffer operation");
    }
  }

  private configureFramebuffer(framebufferIndex: number) {
    if (
      this.framebuffers.length > framebufferIndex &&
      this.framebuffers[framebufferIndex] !== undefined
    ) {
      return this.framebuffers[framebufferIndex];
    }

    this.framebuffers.length = Math.max(
      this.framebuffers.length,
      framebufferIndex + 1
    );

    const framebuffer = this.gl.createFramebuffer();

    if (framebuffer === null) {
      throw Error("could not create framebuffer");
    }

    this.framebuffers[framebufferIndex] = framebuffer;

    return framebuffer;
  }

  private attachRenderbuffer(
    attachment: GlAttachment,
    format: GlTextureFormat,
    target: number
  ) {
    const framebuffer = this.configureFramebuffer(0);
    const gl = this.gl;

    // Clear renderbuffer and texture attachments if any
    GlTarget.clearRenderbufferAttachments(gl, attachment);
    GlTarget.clearTextureAttachments(gl, attachment);

    // Create renderbuffer attachment
    const renderbuffer = renderbufferConfigure(
      gl,
      renderbufferCreate(gl),
      this.viewSize.x,
      this.viewSize.y,
      format,
      1
    );

    attachment.renderbuffer = {
      format,
      handle: renderbuffer,
    };

    // Bind attachment to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      target,
      gl.RENDERBUFFER,
      renderbuffer
    );

    GlTarget.checkFramebuffer(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return renderbuffer;
  }

  private attachTexture(
    attachment: GlAttachment,
    format: GlTextureFormat,
    type: GlTextureType,
    framebufferTarget: GlAttachementTarget
  ) {
    const gl = this.gl;

    // Generate texture targets
    let textureTargets: number[];

    switch (type) {
      case GlTextureType.Cube:
        textureTargets = range(6).map(
          (i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i
        );

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

    const texture = createTexture(
      gl,
      undefined,
      type,
      this.viewSize.x,
      this.viewSize.y,
      format,
      filter,
      undefined
    );

    // Bind frame buffers
    for (let i = 0; i < textureTargets.length; ++i) {
      const framebuffer = this.configureFramebuffer(i);
      const textureTarget = textureTargets[i];

      // Clear renderbuffer attachment if any
      GlTarget.clearRenderbufferAttachments(gl, attachment);

      const offset = attachment.textures.push({
        format,
        handle: texture,
      });

      // Bind attachment to framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        this.getAttachment(framebufferTarget, offset - 1),
        textureTarget,
        texture.handle,
        0
      );

      GlTarget.checkFramebuffer(gl);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    return texture;
  }

  private getAttachment(attachementTarget: GlAttachementTarget, index: number) {
    switch (attachementTarget) {
      case GlAttachementTarget.Color:
        return this.gl.COLOR_ATTACHMENT0 + index;

      case GlAttachementTarget.Depth:
        return this.gl.DEPTH_ATTACHMENT + index;

      default:
        throw Error(`invalid attachment target ${attachementTarget}`);
    }
  }
}

export {
  type GlGeometry,
  type GlPainter,
  type GlRuntime,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  createRuntime,
  loadTextureCube,
  loadTextureQuad,
};
