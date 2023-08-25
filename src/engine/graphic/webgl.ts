import { map, range } from "../language/functional";
import { Matrix3, Matrix4 } from "../math/matrix";
import {
  Filter,
  Interpolation,
  Material,
  Mesh,
  Model,
  Polygon,
  Texture,
  Wrap,
  defaultFilter,
} from "./model";
import { Vector2, Vector3, Vector4 } from "../math/vector";
import { GlBuffer, GlContext, indexBuffer } from "./webgl/resource";
import { GlPolygon } from "./webgl/renderers/objects/polygon";
import { Disposable } from "../language/lifecycle";
import {
  GlTexture,
  GlTextureFormat,
  GlTextureType,
  renderbufferConfigure,
  renderbufferCreate,
  textureCreate,
} from "./webgl/texture";
import {
  GlShader,
  GlShaderAttribute,
  GlShaderDirectives,
  shader,
  shaderAttribute,
} from "./webgl/shader";

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

type GlGeometry = {
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
};

type GlLibrary = {
  materials: Map<Material, GlMaterial>;
};

type GlMaterial = {
  albedoFactor: number[];
  albedoMap: GlTexture | undefined;
  emissiveFactor: number[];
  emissiveMap: GlTexture | undefined;
  glossFactor: number[];
  glossMap: GlTexture | undefined;
  heightMap: GlTexture | undefined;
  heightParallaxBias: number;
  heightParallaxScale: number;
  metalnessMap: GlTexture | undefined;
  metalnessStrength: number;
  normalMap: GlTexture | undefined;
  occlusionMap: GlTexture | undefined;
  occlusionStrength: number;
  roughnessMap: GlTexture | undefined;
  roughnessStrength: number;
  shininess: number;
};

type GlMaterialExtractor = (material: GlMaterial) => GlTexture | undefined;

type GlMesh<TPolygon> = {
  children: GlMesh<TPolygon>[];
  primitives: GlPrimitive<TPolygon>[];
  transform: Matrix4;
};

type GlModel<TPolygon> = {
  library: GlLibrary | undefined;
  meshes: GlMesh<TPolygon>[];
};

type GlModelConfiguration = {
  isDynamic?: boolean;
  library?: GlLibrary;
};

type GlObject<TPolygon> = {
  matrix: Matrix4;
  model: GlModel<TPolygon>;
};

type GlPainter<TScene> = {
  paint(target: GlTarget, scene: TScene): void;
};

type GlPrimitive<TPolygon> = {
  index: GlBuffer;
  material: GlMaterial;
  polygon: TPolygon;
};

type GlRenderer<TScene> = Disposable & {
  render(target: GlTarget, scene: TScene): void;
  resize(width: number, height: number): void;
};

type GlRuntime = Disposable & {
  createShader: (
    vertexShaderSource: string,
    fragmentShaderSource: string,
    directives: GlShaderDirectives
  ) => GlShader;
  context: GlContext;
};

type GlScene<TSceneState, TObject> = {
  objects: Iterable<TObject>;
  state: TSceneState;
};

const colorBlack = { x: 0, y: 0, z: 0, w: 0 };
const colorWhite = { x: 1, y: 1, z: 1, w: 1 };

const defaultMaterial: GlMaterial = {
  albedoFactor: Vector4.toArray(colorWhite),
  albedoMap: undefined,
  emissiveFactor: Vector4.toArray(colorBlack),
  emissiveMap: undefined,
  glossFactor: Vector4.toArray(colorWhite),
  glossMap: undefined,
  heightMap: undefined,
  heightParallaxBias: 0,
  heightParallaxScale: 0,
  metalnessMap: undefined,
  metalnessStrength: 0,
  normalMap: undefined,
  occlusionMap: undefined,
  occlusionStrength: 0,
  roughnessMap: undefined,
  roughnessStrength: 0,
  shininess: 30,
};

const materialExtractors: GlMaterialExtractor[] = [
  (material) => material.albedoMap,
  (material) => material.emissiveMap,
  (material) => material.glossMap,
  (material) => material.heightMap,
  (material) => material.metalnessMap,
  (material) => material.normalMap,
  (material) => material.occlusionMap,
  (material) => material.roughnessMap,
];

const createRuntime = (context: GlContext): GlRuntime => {
  const blackTexture = textureCreate(
    context,
    undefined,
    GlTextureType.Quad,
    1,
    1,
    GlTextureFormat.RGBA8,
    defaultFilter,
    new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1)
  );

  const whiteTexture = textureCreate(
    context,
    undefined,
    GlTextureType.Quad,
    1,
    1,
    GlTextureFormat.RGBA8,
    defaultFilter,
    new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1)
  );

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
      blackTexture.dispose();
      whiteTexture.dispose();
    },
    createShader: (vertexShaderSource, fragmentShaderSource, directives) => {
      return shader(
        context,
        useProgram,
        { blackTexture, whiteTexture },
        vertexShaderSource,
        fragmentShaderSource,
        directives
      );
    },
    context,
  };
};

// TODO: move to resource module
const deleteLibrary = (gl: GlContext, library: GlLibrary): void => {
  for (const material of library.materials.values()) {
    deleteMaterial(gl, material);
  }
};

// TODO: move to resource module
const deleteMaterial = (gl: GlContext, material: GlMaterial): void => {
  for (const extractor of materialExtractors) {
    const texture = extractor(material);

    if (texture !== undefined) {
      gl.deleteTexture(texture);
    }
  }
};

// TODO: move to resource module
const deleteMesh = <TPolygon>(
  gl: GlContext,
  mesh: GlMesh<TPolygon>,
  extractor: (polygon: TPolygon) => Iterable<GlShaderAttribute | undefined>
): void => {
  for (const child of mesh.children) {
    deleteMesh(gl, child, extractor);
  }

  for (const { index, polygon } of mesh.primitives) {
    for (const attribute of extractor(polygon)) {
      if (attribute !== undefined) {
        attribute.dispose();
      }
    }

    index.dispose();
  }
};

// TODO: move to resource module
const deleteModel = <TPolygon>(
  gl: GlContext,
  model: GlModel<TPolygon>,
  extractor: (polygon: TPolygon) => Iterable<GlShaderAttribute | undefined>
): void => {
  const { library, meshes } = model;

  if (library !== undefined) {
    for (const material of library.materials.values()) {
      deleteMaterial(gl, material);
    }
  }

  for (const mesh of meshes) {
    deleteMesh(gl, mesh, extractor);
  }
};

const loadLibrary = (gl: GlContext, model: Model): GlLibrary => {
  const materials = new Map<Material, GlMaterial>();
  const textures = new Map<Texture, GlTexture>();

  const loadMesh = (mesh: Mesh): void => {
    for (const child of mesh.children) {
      loadMesh(child);
    }

    for (const { material } of mesh.polygons) {
      if (material === undefined || materials.has(material)) {
        continue;
      }

      materials.set(material, loadMaterial(gl, textures, material));
    }
  };

  for (const mesh of model.meshes) {
    loadMesh(mesh);
  }

  return { materials };
};

const loadMaterial = (
  gl: GlContext,
  textures: Map<Texture, GlTexture>,
  material: Material
): GlMaterial => {
  const toColorMap = (texture: Texture) => {
    let glTexture = textures.get(texture);

    if (glTexture === undefined) {
      glTexture = textureCreate(
        gl,
        undefined,
        GlTextureType.Quad,
        texture.image.width,
        texture.image.height,
        GlTextureFormat.RGBA8,
        texture.filter,
        texture.image
      );

      textures.set(texture, glTexture);
    }

    return glTexture;
  };

  // FIXME: mutualize defaults with `defaultMaterial`
  return {
    albedoFactor: Vector4.toArray(material.albedoFactor ?? colorWhite),
    albedoMap: map(material.albedoMap, toColorMap),
    emissiveFactor: Vector4.toArray(material.emissiveFactor ?? colorBlack),
    emissiveMap: map(material.emissiveMap, toColorMap),
    glossFactor: Vector4.toArray(
      material.glossFactor ?? material.albedoFactor ?? colorWhite
    ),
    glossMap: map(material.glossMap, toColorMap),
    heightMap: map(material.heightMap, toColorMap),
    heightParallaxBias: material.heightParallaxBias ?? 0,
    heightParallaxScale: material.heightParallaxScale ?? 0,
    metalnessMap: map(material.metalnessMap, toColorMap),
    metalnessStrength: material.metalnessStrength ?? 0,
    normalMap: map(material.normalMap, toColorMap),
    occlusionMap: map(material.occlusionMap, toColorMap),
    occlusionStrength: material.occlusionStrength ?? 0,
    roughnessMap: map(material.roughnessMap, toColorMap),
    roughnessStrength: material.roughnessStrength ?? 0,
    shininess: material.shininess ?? 30,
  };
};

/**
 * Load model into given WebGL context. If a previously loaded "recycle" model
 * is passed, every compatible material it contains will be recycled to avoid
 * deleting and loading its textures again, then it will be deleted.
 */
const loadModel = (
  runtime: GlRuntime,
  model: Model,
  config?: GlModelConfiguration
): GlModel<GlPolygon> => {
  const gl = runtime.context;

  let ownedLibrary: GlLibrary | undefined;
  let usedLibrary: GlLibrary;

  if (config?.library !== undefined) {
    ownedLibrary = undefined;
    usedLibrary = config?.library;
  } else {
    ownedLibrary = loadLibrary(gl, model);
    usedLibrary = ownedLibrary;
  }

  const loadMesh = (mesh: Mesh): GlMesh<GlPolygon> => ({
    children: mesh.children.map((child) => loadMesh(child)),
    primitives: mesh.polygons.map((polygon) =>
      loadPrimitive(gl, usedLibrary, polygon, isDynamic)
    ),
    transform: mesh.transform,
  });

  const isDynamic = config?.isDynamic ?? false;
  const meshes = model.meshes.map(loadMesh);

  return { library: ownedLibrary, meshes };
};

const loadPrimitive = (
  gl: GlContext,
  library: GlLibrary,
  polygon: Polygon,
  isDynamic: boolean
): GlPrimitive<GlPolygon> => {
  const { materials } = library;

  const index = indexBuffer(
    gl,
    new Uint32Array(polygon.indices),
    polygon.indices.length,
    isDynamic
  );

  return {
    index,
    material:
      polygon.material !== undefined
        ? materials.get(polygon.material) ?? defaultMaterial
        : defaultMaterial,
    polygon: {
      coordinate: map(polygon.coordinates, (coordinates) =>
        shaderAttribute(
          gl,
          new Float32Array(coordinates.flatMap(Vector2.toArray)),
          coordinates.length * 2,
          2,
          isDynamic
        )
      ),
      normal: map(polygon.normals, (normals) =>
        shaderAttribute(
          gl,
          new Float32Array(normals.flatMap(Vector3.toArray)),
          normals.length * 3,
          3,
          isDynamic
        )
      ),
      position: shaderAttribute(
        gl,
        new Float32Array(polygon.positions.flatMap(Vector3.toArray)),
        polygon.positions.length * 3,
        3,
        isDynamic
      ),
      tangent: map(polygon.tangents, (tangents) =>
        shaderAttribute(
          gl,
          new Float32Array(tangents.flatMap(Vector3.toArray)),
          tangents.length * 3,
          3,
          isDynamic
        )
      ),
      tint: map(polygon.tints, (tints) =>
        shaderAttribute(
          gl,
          new Float32Array(tints.flatMap(Vector4.toArray)),
          tints.length * 4,
          4,
          isDynamic
        )
      ),
    },
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
  filter?: Filter
): GlTexture => {
  return textureCreate(
    gl,
    undefined,
    GlTextureType.Cube,
    facePositiveX.width,
    facePositiveX.height,
    GlTextureFormat.RGBA8,
    filter ?? defaultFilter,
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
  filter?: Filter
): GlTexture => {
  return textureCreate(
    gl,
    undefined,
    GlTextureType.Quad,
    image.width,
    image.height,
    GlTextureFormat.RGBA8,
    filter ?? defaultFilter,
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
  private viewHeight: number;
  private viewWidth: number;

  public constructor(gl: GlContext, width: number, height: number) {
    this.colorAttachment = { renderbuffer: undefined, textures: [] };
    this.colorClear = colorBlack;
    this.depthAttachment = { renderbuffer: undefined, textures: [] };
    this.depthClear = 1;
    this.framebuffers = [];
    this.gl = gl;
    this.viewHeight = height;
    this.viewWidth = width;
  }

  public clear(framebufferIndex: number) {
    const gl = this.gl;

    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      framebufferIndex < this.framebuffers.length
        ? this.framebuffers[framebufferIndex]
        : null
    );
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);

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

  public draw(framebufferIndex: number, indexBuffer: GlBuffer) {
    const gl = this.gl;

    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      framebufferIndex < this.framebuffers.length
        ? this.framebuffers[framebufferIndex]
        : null
    );
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
    gl.drawElements(gl.TRIANGLES, indexBuffer.length, indexBuffer.type, 0);
  }

  public resize(width: number, height: number) {
    const gl = this.gl;

    for (const attachment of [this.colorAttachment, this.depthAttachment]) {
      // Resize existing renderbuffer attachment if any
      if (attachment.renderbuffer !== undefined) {
        renderbufferConfigure(
          gl,
          attachment.renderbuffer.handle,
          width,
          height,
          attachment.renderbuffer.format,
          1
        );
      }

      // Resize previously existing texture attachments if any
      for (const texture of attachment.textures) {
        textureCreate(
          gl,
          texture.handle,
          GlTextureType.Quad,
          width,
          height,
          texture.format,
          defaultFilter,
          undefined
        );
      }
    }

    this.viewHeight = height;
    this.viewWidth = width;
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

      const buffers = range(
        this.colorAttachment.textures.length,
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
      this.viewWidth,
      this.viewHeight,
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
        textureTargets = range(6, (i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i);

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

    const texture = textureCreate(
      gl,
      undefined,
      type,
      this.viewWidth,
      this.viewHeight,
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
  type GlMaterial,
  type GlMesh,
  type GlModel,
  type GlObject,
  type GlPainter,
  type GlPrimitive,
  type GlRenderer,
  type GlRuntime,
  type GlScene,
  type GlTexture,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  createRuntime,
  deleteLibrary,
  deleteModel,
  loadLibrary,
  loadModel,
  loadTextureCube,
  loadTextureQuad,
  defaultMaterial,
};
