import { map, range } from "../language/functional";
import { Matrix3, Matrix4 } from "../math/matrix";
import {
  defaultFilter,
  Filter,
  Interpolation,
  Material,
  Mesh,
  Model,
  Polygon,
  Texture,
  TypedArray,
  Wrap,
} from "./model";
import { Vector3, Vector4 } from "../math/vector";

interface GlAttachment {
  renderbuffer: GlAttachmentRenderbuffer | undefined;
  textures: GlAttachmentTexture[];
}

interface GlAttachmentRenderbuffer {
  format: GlTextureFormat;
  handle: WebGLRenderbuffer;
}

enum GlAttachementTarget {
  Color,
  Depth,
}

interface GlAttachmentTexture {
  format: GlTextureFormat;
  handle: WebGLTexture;
}

interface GlAttribute {
  buffer: WebGLBuffer;
  size: number;
  stride: number;
  type: number;
}

type AttributeBinding<TSource> = (source: TSource) => void;

type GlContext = WebGL2RenderingContext;

interface GlDirectionalLight {
  color: Vector3;
  direction: Vector3;
  shadow: boolean;
}

interface GlDirective {
  name: string;
  value: number;
}

interface GlLibrary {
  defaultMaterial: GlMaterial;
  materials: Map<Material, GlMaterial>;
}

interface GlMaterial {
  albedoFactor: number[];
  albedoMap: WebGLTexture | undefined;
  emissiveFactor: number[];
  emissiveMap: WebGLTexture | undefined;
  glossFactor: number[];
  glossMap: WebGLTexture | undefined;
  heightMap: WebGLTexture | undefined;
  heightParallaxBias: number;
  heightParallaxScale: number;
  metalnessMap: WebGLTexture | undefined;
  metalnessStrength: number;
  normalMap: WebGLTexture | undefined;
  occlusionMap: WebGLTexture | undefined;
  occlusionStrength: number;
  roughnessMap: WebGLTexture | undefined;
  roughnessStrength: number;
  shininess: number;
}

type GlMaterialExtractor = (material: GlMaterial) => WebGLTexture | undefined;

interface GlModel {
  materials: GlMaterial[];
  meshes: GlMesh[];
}

interface GlModelConfiguration {
  isDynamic?: boolean;
  library?: GlLibrary;
}

interface GlMesh {
  children: GlMesh[];
  primitives: GlPrimitive[];
  transform: Matrix4;
}

interface GlMeshState {
  modelMatrix: Matrix4;
  normalMatrix: Matrix3;
}

interface GlNativeFormat {
  format: number;
  internal: number;
  type: number;
}

interface GlPainter<T> {
  paint(
    target: GlTarget,
    subjects: Iterable<GlSubject>,
    view: Matrix4,
    state: T
  ): void;
}

interface GlPipeline {
  process(target: GlTarget, transform: GlTransform, scene: GlScene): void;
  resize(width: number, height: number): void;
}

interface GlPointLight {
  color: Vector3;
  position: Vector3;
  radius: number;
}

interface GlPolygon {
  colors: GlAttribute | undefined;
  coords: GlAttribute | undefined;
  indexCount: number;
  indexBuffer: WebGLBuffer;
  indexType: number;
  normals: GlAttribute | undefined;
  points: GlAttribute;
  tangents: GlAttribute | undefined;
}

type GlPolygonExtractor = (polygon: GlPolygon) => GlAttribute | undefined;

interface GlPrimitive {
  material: GlMaterial;
  polygon: GlPolygon;
}

type PropertyBinding<T> = (source: T) => void;

interface GlScene {
  ambientLightColor?: Vector3;
  directionalLights?: GlDirectionalLight[];
  environmentLight?: {
    brdf: WebGLTexture;
    diffuse: WebGLTexture;
    specular: WebGLTexture;
  };
  pointLights?: GlPointLight[];
  subjects: GlSubject[];
}

interface GlSubject {
  matrix: Matrix4;
  model: GlModel;
  noShadow?: boolean;
}

type GlTextureBinding<T> = (source: T, textureIndex: number) => number;

const enum GlTextureFormat {
  Depth16,
  RGBA8,
}

const enum GlTextureType {
  Quad,
  Cube,
}

interface GlTransform {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

type GlUniformMatrixSetter<T> = (
  location: WebGLUniformLocation,
  transpose: boolean,
  value: T
) => void;

type GlUniformValueSetter<T> = (
  location: WebGLUniformLocation,
  value: T
) => void;

const colorBlack = { x: 0, y: 0, z: 0, w: 0 };
const colorWhite = { x: 1, y: 1, z: 1, w: 1 };

const materialExtractors: GlMaterialExtractor[] = [
  (material) => material.albedoMap,
  (material) => material.emissiveMap,
  (material) => material.glossMap,
  (material) => material.emissiveMap,
  (material) => material.heightMap,
  (material) => material.metalnessMap,
  (material) => material.normalMap,
  (material) => material.occlusionMap,
  (material) => material.roughnessMap,
];

const polygonExtractors: GlPolygonExtractor[] = [
  (polygon) => polygon.colors,
  (polygon) => polygon.coords,
  (polygon) => polygon.normals,
  (polygon) => polygon.points,
  (polygon) => polygon.tangents,
];

const bufferConvert = (
  gl: GlContext,
  target: number,
  values: TypedArray,
  isDynamic: boolean
) => {
  const buffer = gl.createBuffer();

  if (buffer === null) {
    throw Error("could not create buffer");
  }

  gl.bindBuffer(target, buffer);
  gl.bufferData(target, values, isDynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);

  return buffer;
};

/*
 ** Find OpenGL type from associated array type.
 ** See: https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/vertexAttribPointer
 */
const bufferGetType = (gl: GlContext, array: TypedArray) => {
  if (array instanceof Float32Array) return gl.FLOAT;
  else if (array instanceof Int32Array) return gl.INT;
  else if (array instanceof Uint32Array) return gl.UNSIGNED_INT;
  else if (array instanceof Int16Array) return gl.SHORT;
  else if (array instanceof Uint16Array) return gl.UNSIGNED_SHORT;
  else if (array instanceof Int8Array) return gl.BYTE;
  else if (array instanceof Uint8Array) return gl.UNSIGNED_BYTE;

  throw Error(`unsupported array type for indices`);
};

const deleteLibrary = (gl: GlContext, library: GlLibrary): void => {
  for (const material of library.materials.values()) {
    deleteMaterial(gl, material);
  }
};

const deleteMaterial = (gl: GlContext, material: GlMaterial): void => {
  for (const extractor of materialExtractors) {
    const texture = extractor(material);

    if (texture !== undefined) {
      gl.deleteTexture(texture);
    }
  }
};

const deleteMesh = (gl: GlContext, mesh: GlMesh): void => {
  for (const child of mesh.children) {
    deleteMesh(gl, child);
  }

  for (const { polygon } of mesh.primitives) {
    for (const extractor of polygonExtractors) {
      const attribute = extractor(polygon);

      if (attribute !== undefined) {
        gl.deleteBuffer(attribute.buffer);
      }
    }

    gl.deleteBuffer(polygon.indexBuffer);
  }
};

const deleteModel = (gl: GlContext, model: GlModel): void => {
  for (const material of model.materials) {
    deleteMaterial(gl, material);
  }

  for (const mesh of model.meshes) {
    deleteMesh(gl, mesh);
  }
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
      if (gl.VERSION < 2 && !gl.getExtension("WEBGL_depth_texture"))
        throw Error("depth texture WebGL extension is not available");

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

const renderbufferCreate = (gl: GlContext) => {
  const renderbuffer = gl.createRenderbuffer();

  if (renderbuffer === null) {
    throw Error("could not create renderbuffer");
  }

  return renderbuffer;
};

const textureConfigure = (
  gl: GlContext,
  texture: WebGLTexture,
  type: GlTextureType,
  width: number,
  height: number,
  format: GlTextureFormat,
  filter: Filter,
  image: ImageData | ImageData[] | undefined
) => {
  const isPowerOfTwo =
    ((height - 1) & height) === 0 && ((width - 1) & width) === 0;
  const target = textureGetTarget(gl, type);

  gl.bindTexture(target, texture);

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
    filter !== undefined && filter.mipmap && isPowerOfTwo
      ? mipmapFilter
      : minifierFilter
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
    // TODO: remove unwanted wrapping of "pixels" array when https://github.com/KhronosGroup/WebGL/issues/1533 is fixed
    gl.texImage2D(
      target,
      0,
      nativeFormat.internal,
      width,
      height,
      0,
      nativeFormat.format,
      nativeFormat.type,
      new Uint8Array((<ImageData>image).data)
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

  if (filter.mipmap && isPowerOfTwo) {
    gl.generateMipmap(target);
  }

  gl.bindTexture(target, null);

  return texture;
};

const textureCreate = (gl: GlContext) => {
  const texture = gl.createTexture();

  if (texture === null) {
    throw Error("could not create texture");
  }

  return texture;
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

const loadLibrary = (gl: GlContext, model: Model): GlLibrary => {
  const defaultMaterial = loadMaterial(gl, {}); // TODO: share across multiple models
  const materials = new Map<Material, GlMaterial>();

  const loadMesh = (mesh: Mesh): void => {
    for (const child of mesh.children) {
      loadMesh(child);
    }

    for (const { material } of mesh.polygons) {
      if (material === undefined) {
        continue;
      }

      materials.set(material, loadMaterial(gl, material));
    }
  };

  for (const mesh of model.meshes) {
    loadMesh(mesh);
  }

  return { defaultMaterial, materials };
};

const loadMaterial = (gl: GlContext, material: Material): GlMaterial => {
  const toColorMap = (texture: Texture) =>
    textureConfigure(
      gl,
      textureCreate(gl),
      GlTextureType.Quad,
      texture.image.width,
      texture.image.height,
      GlTextureFormat.RGBA8,
      texture.filter,
      texture.image
    );

  return {
    albedoFactor: Vector4.toArray(material.albedoFactor || colorWhite),
    albedoMap: map(material.albedoMap, toColorMap),
    emissiveFactor: Vector4.toArray(material.emissiveFactor || colorBlack),
    emissiveMap: map(material.emissiveMap, toColorMap),
    glossFactor: Vector4.toArray(
      material.glossFactor || material.albedoFactor || colorWhite
    ),
    glossMap: map(material.glossMap, toColorMap),
    heightMap: map(material.heightMap, toColorMap),
    heightParallaxBias: material.heightParallaxBias ?? 0,
    heightParallaxScale: material.heightParallaxScale ?? 0,
    metalnessMap: map(material.metalnessMap, toColorMap),
    metalnessStrength: material.metalnessStrength ?? 0,
    normalMap: map(material.normalMap, toColorMap),
    occlusionMap: map(material.occlusionMap, toColorMap),
    occlusionStrength: material.occlusionStrength ?? 1,
    roughnessMap: map(material.roughnessMap, toColorMap),
    roughnessStrength: material.roughnessStrength ?? 1,
    shininess: material.shininess ?? 30,
  };
};

/**
 * Load model into given WebGL context. If a previously loaded "recycle" model
 * is passed, every compatible material it contains will be recycled to avoid
 * deleting and loading its textures again, then it will be deleted.
 */
const loadModel = (
  gl: GlContext,
  model: Model,
  config?: GlModelConfiguration
): GlModel => {
  const loadMesh = (mesh: Mesh): GlMesh => ({
    children: mesh.children.map((child) => loadMesh(child)),
    primitives: mesh.polygons.map((polygon) =>
      loadPrimitive(gl, library, polygon, isDynamic)
    ),
    transform: mesh.transform,
  });

  let library: GlLibrary;
  let materials: GlMaterial[];

  if (config?.library !== undefined) {
    library = config?.library;
    materials = [];
  } else {
    library = loadLibrary(gl, model);
    materials = [...library.materials.values(), library.defaultMaterial];
  }

  const isDynamic = config?.isDynamic ?? false;
  const meshes = model.meshes.map(loadMesh);

  return { materials, meshes };
};

const loadPrimitive = (
  gl: GlContext,
  library: GlLibrary,
  polygon: Polygon,
  isDynamic: boolean
): GlPrimitive => {
  const { defaultMaterial, materials } = library;

  return {
    material:
      polygon.material !== undefined
        ? materials.get(polygon.material) ?? defaultMaterial
        : defaultMaterial,
    polygon: {
      colors: map(polygon.colors, (colors) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, colors.buffer, isDynamic),
        size: colors.stride,
        stride: colors.stride * colors.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, colors.buffer),
      })),
      coords: map(polygon.coords, (coords) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, coords.buffer, isDynamic),
        size: coords.stride,
        stride: coords.stride * coords.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, coords.buffer),
      })),
      indexCount: polygon.indices.length,
      indexBuffer: bufferConvert(
        gl,
        gl.ELEMENT_ARRAY_BUFFER,
        polygon.indices,
        isDynamic
      ),
      indexType: bufferGetType(gl, polygon.indices),
      normals: map(polygon.normals, (normals) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, normals.buffer, isDynamic),
        size: normals.stride,
        stride: normals.stride * normals.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, normals.buffer),
      })),
      points: {
        buffer: bufferConvert(
          gl,
          gl.ARRAY_BUFFER,
          polygon.points.buffer,
          isDynamic
        ),
        size: polygon.points.stride,
        stride: polygon.points.stride * polygon.points.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, polygon.points.buffer),
      },
      tangents: map(polygon.tangents, (tangents) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, tangents.buffer, isDynamic),
        size: tangents.stride,
        stride: tangents.stride * tangents.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, tangents.buffer),
      })),
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
): WebGLTexture => {
  return textureConfigure(
    gl,
    textureCreate(gl),
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
): WebGLTexture => {
  return textureConfigure(
    gl,
    textureCreate(gl),
    GlTextureType.Quad,
    image.width,
    image.height,
    GlTextureFormat.RGBA8,
    filter ?? defaultFilter,
    image
  );
};

class GlShader<TState> {
  private readonly attributePerGeometryBindings: AttributeBinding<GlPolygon>[];
  private readonly gl: GlContext;
  private readonly program: WebGLProgram;
  private readonly propertyPerMaterialBindings: PropertyBinding<GlMaterial>[];
  private readonly propertyPerNodeBindings: PropertyBinding<GlMeshState>[];
  private readonly propertyPerTargetBindings: PropertyBinding<TState>[];
  private readonly texturePerMaterialBindings: GlTextureBinding<GlMaterial>[];
  private readonly texturePerTargetBindings: GlTextureBinding<TState>[];

  public constructor(
    gl: GlContext,
    vsSource: string,
    fsSource: string,
    directives: GlDirective[] = []
  ) {
    const program = gl.createProgram();

    if (program === null) throw Error("could not create program");

    const header =
      "#version 300 es\n" +
      "#ifdef GL_ES\n" +
      "precision highp float;\n" +
      "#endif\n" +
      directives
        .map((directive) => `#define ${directive.name} ${directive.value}\n`)
        .join("");

    gl.attachShader(
      program,
      GlShader.compile(gl, gl.VERTEX_SHADER, header + vsSource)
    );
    gl.attachShader(
      program,
      GlShader.compile(gl, gl.FRAGMENT_SHADER, header + fsSource)
    );
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);

      gl.deleteProgram(program);

      throw Error(`could not link program: ${error}`);
    }

    this.attributePerGeometryBindings = [];
    this.gl = gl;
    this.propertyPerMaterialBindings = [];
    this.propertyPerNodeBindings = [];
    this.propertyPerTargetBindings = [];
    this.texturePerMaterialBindings = [];
    this.texturePerTargetBindings = [];
    this.program = program;
  }

  public activate() {
    this.gl.useProgram(this.program);
  }

  /*
   ** Assign per-geometry attributes.
   */
  public bindGeometry(geometry: GlPolygon) {
    for (const binding of this.attributePerGeometryBindings) {
      binding(geometry);
    }
  }

  /*
   ** Assign per-material uniforms.
   */
  public bindMaterial(material: GlMaterial, textureIndex: number) {
    for (const binding of this.propertyPerMaterialBindings) {
      binding(material);
    }

    for (const binding of this.texturePerMaterialBindings) {
      textureIndex += binding(material, textureIndex);
    }

    return textureIndex;
  }

  /*
   ** Assign per-node uniforms.
   */
  public bindNode(nodeState: GlMeshState) {
    for (const binding of this.propertyPerNodeBindings) {
      binding(nodeState);
    }
  }

  /*
   ** Assign per-target uniforms.
   */
  public bindTarget(state: TState) {
    let textureIndex = 0;

    for (const binding of this.propertyPerTargetBindings) {
      binding(state);
    }

    for (const binding of this.texturePerTargetBindings) {
      textureIndex += binding(state, textureIndex);
    }

    return textureIndex;
  }

  public clearAttributePerGeometry(name: string) {
    const gl = this.gl;
    const location = this.findAttribute(name);

    this.attributePerGeometryBindings.push(() => {
      gl.disableVertexAttribArray(location);
    });
  }

  public setupAttributePerGeometry(
    name: string,
    getter: (state: GlPolygon) => GlAttribute | undefined
  ) {
    const gl = this.gl;
    const location = this.findAttribute(name);

    this.attributePerGeometryBindings.push((geometry: GlPolygon) => {
      const attribute = getter(geometry);

      if (attribute === undefined)
        throw Error(`undefined geometry attribute "${name}"`);

      gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
      gl.vertexAttribPointer(
        location,
        attribute.size,
        attribute.type,
        false,
        attribute.stride,
        0
      );
      gl.enableVertexAttribArray(location);
    });
  }

  public setupMatrix3PerNode(
    name: string,
    getter: (state: GlMeshState) => Matrix3
  ) {
    this.propertyPerNodeBindings.push(
      this.declareMatrix(
        name,
        9,
        (state, buffer) => getter(state).copyToArray(buffer),
        (gl) => gl.uniformMatrix3fv
      )
    );
  }

  public setupMatrix3PerTarget(
    name: string,
    getter: (state: TState) => Matrix3
  ) {
    this.propertyPerTargetBindings.push(
      this.declareMatrix(
        name,
        9,
        (state, buffer) => getter(state).copyToArray(buffer),
        (gl) => gl.uniformMatrix3fv
      )
    );
  }

  public setupMatrix4PerNode(
    name: string,
    getter: (state: GlMeshState) => Matrix4
  ) {
    this.propertyPerNodeBindings.push(
      this.declareMatrix(
        name,
        16,
        (state, buffer) => getter(state).copyToArray(buffer),
        (gl) => gl.uniformMatrix4fv
      )
    );
  }

  public setupMatrix4PerTarget(
    name: string,
    getter: (state: TState) => Matrix4
  ) {
    this.propertyPerTargetBindings.push(
      this.declareMatrix(
        name,
        16,
        (state, buffer) => getter(state).copyToArray(buffer),
        (gl) => gl.uniformMatrix4fv
      )
    );
  }

  public setupPropertyPerMaterial<TValue>(
    name: string,
    getter: (state: GlMaterial) => TValue,
    assign: (gl: GlContext) => GlUniformValueSetter<TValue>
  ) {
    this.propertyPerMaterialBindings.push(
      this.declareProperty(name, getter, assign)
    );
  }

  public setupPropertyPerTarget<TValue>(
    name: string,
    getter: (state: TState) => TValue,
    assign: (gl: GlContext) => GlUniformValueSetter<TValue>
  ) {
    this.propertyPerTargetBindings.push(
      this.declareProperty(name, getter, assign)
    );
  }

  /*
   ** Declare sampler on shader and bind it to texture on current material. An
   ** optional second boolean uniform can be specified to allow texture to be
   ** left undefined on some materials. In that case this second uniform will
   ** be set to "true" or "false" depending on whether texture is defined or
   ** not. If second uniform is undefined, texture is assumed to be always
   ** defined.
   */
  public setupTexturePerMaterial(
    samplerName: string,
    enabledName: string | undefined,
    type: GlTextureType,
    getter: (state: GlMaterial) => WebGLTexture | undefined
  ) {
    this.texturePerMaterialBindings.push(
      this.declareTexture(samplerName, enabledName, type, getter)
    );
  }

  /*
   ** Declare sampler on shader and bind it to texture on current target. See
   ** method "bindTexturePerMaterial" for details about the optional second
   ** uniform.
   */
  public setupTexturePerTarget(
    samplerName: string,
    enabledName: string | undefined,
    type: GlTextureType,
    getter: (state: TState) => WebGLTexture | undefined
  ) {
    this.texturePerTargetBindings.push(
      this.declareTexture(samplerName, enabledName, type, getter)
    );
  }

  private declareMatrix<TSource>(
    name: string,
    length: number,
    copyToBuffer: (state: TSource, buffer: Float32Array) => void,
    setUniformGetter: (gl: GlContext) => GlUniformMatrixSetter<Float32Array>
  ) {
    const gl = this.gl;
    const location = this.findUniform(name);
    const setUniform = setUniformGetter(gl);
    const buffer = new Float32Array(length);

    return (state: TSource) => {
      copyToBuffer(state, buffer);
      setUniform.call(gl, location, false, buffer);
    };
  }

  private declareProperty<TSource, TValue>(
    name: string,
    propertyGetter: (source: TSource) => TValue,
    setUniformGetter: (gl: GlContext) => GlUniformValueSetter<TValue>
  ) {
    const gl = this.gl;
    const location = this.findUniform(name);
    const setUniform = setUniformGetter(gl);

    return (source: TSource) =>
      setUniform.call(gl, location, propertyGetter(source));
  }

  private declareTexture<TSource>(
    samplerName: string,
    enabledName: string | undefined,
    type: GlTextureType,
    textureGetter: (source: TSource) => WebGLTexture | undefined
  ) {
    const enabledLocation = map(enabledName, (name) => this.findUniform(name));
    const gl = this.gl;
    const samplerLocation = this.findUniform(samplerName);
    const target = textureGetTarget(gl, type);

    if (enabledLocation !== undefined) {
      return (source: TSource, textureIndex: number) => {
        const texture = textureGetter(source);

        if (texture === undefined) {
          gl.uniform1i(enabledLocation, 0);

          return 0;
        }

        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        gl.bindTexture(target, texture);
        gl.uniform1i(enabledLocation, 1);
        gl.uniform1i(samplerLocation, textureIndex);

        return 1;
      };
    } else {
      return (source: TSource, textureIndex: number) => {
        const texture = textureGetter(source);

        if (texture === undefined) {
          throw Error(`missing mandatory texture uniform "${samplerName}"`);
        }

        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        gl.bindTexture(target, texture);
        gl.uniform1i(samplerLocation, textureIndex);

        return 1;
      };
    }
  }

  private findAttribute(name: string) {
    const location = this.gl.getAttribLocation(this.program, name);

    if (location === -1) {
      throw Error(`cound not find location of attribute "${name}"`);
    }

    return location;
  }

  private findUniform(name: string) {
    const location = this.gl.getUniformLocation(this.program, name);

    if (location === null) {
      throw Error(`cound not find location of uniform "${name}"`);
    }

    return location;
  }

  private static compile(gl: GlContext, shaderType: number, source: string) {
    const shader = gl.createShader(shaderType);

    if (shader === null) {
      throw Error(`could not create shader`);
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      const name =
        shaderType === gl.FRAGMENT_SHADER
          ? "fragment"
          : shaderType === gl.VERTEX_SHADER
          ? "vertex"
          : "unknown";
      const pattern = /ERROR: [0-9]+:([0-9]+)/;

      gl.deleteShader(shader);

      const match = error !== null ? pattern.exec(error) : null;

      if (match !== null) {
        const begin = parseInt(match[1]) - 1 - 2;
        const end = begin + 5;

        throw Error(
          `could not compile ${name} shader (${error}) around:\n${source
            .split("\n")
            .slice(Math.max(begin, 0), end)
            .join("\n")}`
        );
      }

      throw Error(
        `could not compile ${name} shader (${error}) in source:\n${source}`
      );
    }

    return shader;
  }
}

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

  public draw(
    framebufferIndex: number,
    indices: WebGLBuffer,
    count: number,
    type: number
  ) {
    const gl = this.gl;

    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      framebufferIndex < this.framebuffers.length
        ? this.framebuffers[framebufferIndex]
        : null
    );
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.drawElements(gl.TRIANGLES, count, type, 0);
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
        textureConfigure(
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

    if (this.colorAttachment.textures !== undefined) {
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
    if (attachment.textures !== undefined) {
      for (const texture of attachment.textures)
        gl.deleteTexture(texture.handle);

      attachment.textures = [];
    }
  }

  private static checkFramebuffer(gl: GlContext) {
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("invalid framebuffer operation");
  }

  private configureFramebuffer(framebufferIndex: number) {
    if (
      this.framebuffers.length > framebufferIndex &&
      this.framebuffers[framebufferIndex] !== undefined
    )
      return this.framebuffers[framebufferIndex];

    this.framebuffers.length = Math.max(
      this.framebuffers.length,
      framebufferIndex + 1
    );

    const framebuffer = this.gl.createFramebuffer();

    if (framebuffer === null) throw Error("could not create framebuffer");

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
      format: format,
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
    const cubeTextureBase = gl.TEXTURE_CUBE_MAP_POSITIVE_X;

    // Generate texture targets
    let textureTargets: number[];

    switch (type) {
      case GlTextureType.Cube:
        textureTargets = range(6, (i) => cubeTextureBase + i);

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

    const texture = textureConfigure(
      gl,
      textureCreate(gl),
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
        format: format,
        handle: texture,
      });

      // Bind attachment to framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        this.getAttachment(framebufferTarget, offset - 1),
        textureTarget,
        texture,
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
  type GlAttribute,
  type GlDirectionalLight,
  type GlDirective,
  type GlMaterial,
  type GlMesh,
  type GlModel,
  type GlPainter,
  type GlPipeline,
  type GlPointLight,
  type GlPolygon,
  type GlScene,
  type GlSubject,
  type GlTransform,
  GlShader,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  deleteLibrary,
  deleteModel,
  loadLibrary,
  loadModel,
  loadTextureCube,
  loadTextureQuad,
};
