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
import { Vector2, Vector3, Vector4 } from "../math/vector";

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
  handle: GlTexture;
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
}

type GlMaterialExtractor = (material: GlMaterial) => GlTexture | undefined;

interface GlModel {
  library: GlLibrary | undefined;
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

interface GlScene {
  ambientLightColor?: Vector3;
  directionalLights?: GlDirectionalLight[];
  environmentLight?: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
  pointLights?: GlPointLight[];
  subjects: GlSubject[];
}

interface GlSubject {
  matrix: Matrix4;
  model: GlModel;
  noShadow?: boolean;
}

type GlTexture = WebGLTexture;

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

type GlUniformAccessor<TState, TValue> = {
  createValue: (gl: GlContext) => TValue;
  readValue: (value: TValue, state: TState) => TValue;
  setUniform: (
    gl: GlContext,
    location: WebGLUniformLocation,
    value: TValue
  ) => void;
};

type GlUniform<TState> = (state: TState) => void;

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

const booleanScalarUniform = <TState>(
  getter: (state: TState) => boolean
): GlUniformAccessor<TState, number> => ({
  createValue: () => 0,
  readValue: (_, state) => (getter(state) ? 1 : 0),
  setUniform: (g, l, v) => g.uniform1i(l, v),
});

const numberArray4Uniform = <TState>(
  getter: (state: TState) => number[]
): GlUniformAccessor<TState, number[]> => ({
  createValue: () => [],
  readValue: (_, state) => getter(state),
  setUniform: (g, l, v) => g.uniform4fv(l, v),
});

const numberMatrix3Uniform = <TState>(
  getter: (state: TState) => Matrix3
): GlUniformAccessor<TState, Float32Array> => {
  return {
    createValue: () => new Float32Array(9),
    readValue: (value, state) => {
      const matrix = getter(state);

      value[0] = matrix.v00;
      value[1] = matrix.v01;
      value[2] = matrix.v02;
      value[3] = matrix.v10;
      value[4] = matrix.v11;
      value[5] = matrix.v12;
      value[6] = matrix.v20;
      value[7] = matrix.v21;
      value[8] = matrix.v22;

      return value;
    },
    setUniform: (g, l, v) => g.uniformMatrix3fv(l, false, v),
  };
};

const numberMatrix4Uniform = <TState>(
  getter: (state: TState) => Matrix4
): GlUniformAccessor<TState, Float32Array> => ({
  createValue: () => new Float32Array(16),
  readValue: (value, state) => {
    const matrix = getter(state);

    value[0] = matrix.v00;
    value[1] = matrix.v01;
    value[2] = matrix.v02;
    value[3] = matrix.v03;
    value[4] = matrix.v10;
    value[5] = matrix.v11;
    value[6] = matrix.v12;
    value[7] = matrix.v13;
    value[8] = matrix.v20;
    value[9] = matrix.v21;
    value[10] = matrix.v22;
    value[11] = matrix.v23;
    value[12] = matrix.v30;
    value[13] = matrix.v31;
    value[14] = matrix.v32;
    value[15] = matrix.v33;

    return value;
  },
  setUniform: (g, l, v) => g.uniformMatrix4fv(l, false, v),
});

const numberScalarUniform = <TState>(
  getter: (state: TState) => number
): GlUniformAccessor<TState, number> => ({
  createValue: () => 0,
  readValue: (_, state) => getter(state),
  setUniform: (g, l, v) => g.uniform1f(l, v),
});

const numberVector2Uniform = <TState>(
  getter: (state: TState) => Vector2
): GlUniformAccessor<TState, Float32Array> => ({
  createValue: () => new Float32Array(2),
  readValue: (value, state) => {
    const vector = getter(state);

    value[0] = vector.x;
    value[1] = vector.y;

    return value;
  },
  setUniform: (g, l, v) => g.uniform2fv(l, v),
});

const numberVector3Uniform = <TState>(
  getter: (state: TState) => Vector3
): GlUniformAccessor<TState, Float32Array> => ({
  createValue: () => new Float32Array(3),
  readValue: (value, state) => {
    const vector = getter(state);

    value[0] = vector.x;
    value[1] = vector.y;
    value[2] = vector.z;

    return value;
  },
  setUniform: (g, l, v) => g.uniform3fv(l, v),
});

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
  if (model.library !== undefined) {
    for (const material of model.library.materials.values()) {
      deleteMaterial(gl, material);
    }

    deleteMaterial(gl, model.library.defaultMaterial);
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
  texture: GlTexture,
  type: GlTextureType,
  width: number,
  height: number,
  format: GlTextureFormat,
  filter: Filter,
  image: ImageData | ImageData[] | undefined
): GlTexture => {
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

  const defaultMaterial = loadMaterial(gl, textures, {}); // TODO: share across multiple models

  for (const mesh of model.meshes) {
    loadMesh(mesh);
  }

  return { defaultMaterial, materials };
};

const loadMaterial = (
  gl: GlContext,
  textures: Map<Texture, GlTexture>,
  material: Material
): GlMaterial => {
  const toColorMap = (texture: Texture) => {
    let glTexture = textures.get(texture);

    if (glTexture === undefined) {
      glTexture = textureConfigure(
        gl,
        textureCreate(gl),
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
  let ownedLibrary: GlLibrary | undefined;
  let usedLibrary: GlLibrary;

  if (config?.library !== undefined) {
    ownedLibrary = undefined;
    usedLibrary = config?.library;
  } else {
    ownedLibrary = loadLibrary(gl, model);
    usedLibrary = ownedLibrary;
  }

  const loadMesh = (mesh: Mesh): GlMesh => ({
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
): GlTexture => {
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
): GlTexture => {
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
  private readonly texturePerMaterialBindings: GlTextureBinding<GlMaterial>[];
  private readonly texturePerTargetBindings: GlTextureBinding<TState>[];
  private readonly uniformPerMaterial: Map<string, GlUniform<GlMaterial>>;
  private readonly uniformPerMesh: Map<string, GlUniform<GlMeshState>>;
  private readonly uniformPerTarget: Map<string, GlUniform<TState>>;

  public constructor(
    gl: GlContext,
    vsSource: string,
    fsSource: string,
    directives: GlDirective[] = []
  ) {
    const program = gl.createProgram();

    if (program === null) {
      throw Error("could not create program");
    }

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
    this.uniformPerMaterial = new Map();
    this.uniformPerMesh = new Map();
    this.uniformPerTarget = new Map();
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
    for (const binding of this.uniformPerMaterial.values()) {
      binding(material);
    }

    for (const binding of this.texturePerMaterialBindings) {
      textureIndex += binding(material, textureIndex);
    }

    return textureIndex;
  }

  /*
   ** Assign per-mesh uniforms.
   */
  public bindMesh(meshState: GlMeshState) {
    for (const binding of this.uniformPerMesh.values()) {
      binding(meshState);
    }
  }

  /*
   ** Assign per-target uniforms.
   */
  public bindTarget(state: TState) {
    let textureIndex = 0;

    for (const binding of this.uniformPerTarget.values()) {
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

  public setUniformPerMaterial<TValue>(
    name: string,
    accessor: GlUniformAccessor<GlMaterial, TValue>
  ) {
    this.setUniform(this.uniformPerMaterial, name, accessor);
  }

  public setUniformPerMesh<TValue>(
    name: string,
    accessor: GlUniformAccessor<GlMeshState, TValue>
  ) {
    this.setUniform(this.uniformPerMesh, name, accessor);
  }

  public setUniformPerTarget<TValue>(
    name: string,
    accessor: GlUniformAccessor<TState, TValue>
  ) {
    this.setUniform(this.uniformPerTarget, name, accessor);
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
    getter: (state: GlMaterial) => GlTexture | undefined
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
    getter: (state: TState) => GlTexture | undefined
  ) {
    this.texturePerTargetBindings.push(
      this.declareTexture(samplerName, enabledName, type, getter)
    );
  }

  private setUniform<TState, TValue>(
    target: Map<string, GlUniform<TState>>,
    name: string,
    accessor: GlUniformAccessor<TState, TValue>
  ): void {
    if (target.has(name)) {
      throw new Error(`cannot set uniform "${name}" twice`);
    }

    const { createValue, readValue, setUniform } = accessor;
    const gl = this.gl;
    const location = this.findUniform(name);
    const value = createValue(gl);

    target.set(name, (state: TState) => {
      const uniform = readValue(value, state);

      setUniform(gl, location, uniform);
    });
  }

  private declareTexture<TSource>(
    samplerName: string,
    enabledName: string | undefined,
    type: GlTextureType,
    textureGetter: (source: TSource) => GlTexture | undefined
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
  booleanScalarUniform,
  deleteLibrary,
  deleteModel,
  loadLibrary,
  loadModel,
  loadTextureCube,
  loadTextureQuad,
  numberArray4Uniform,
  numberMatrix3Uniform,
  numberMatrix4Uniform,
  numberScalarUniform,
  numberVector2Uniform,
  numberVector3Uniform,
};
