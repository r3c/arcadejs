import * as functional from "../language/functional";
import * as matrix from "../math/matrix";
import * as model from "./model";
import * as vector from "../math/vector";

interface Attachment {
  renderbuffer: AttachmentRenderbuffer | undefined;
  textures: AttachmentTexture[];
}

interface AttachmentRenderbuffer {
  format: TextureFormat;
  handle: WebGLRenderbuffer;
}

interface AttachmentTexture {
  format: TextureFormat;
  handle: WebGLTexture;
}

interface Attribute {
  buffer: WebGLBuffer;
  size: number;
  stride: number;
  type: number;
}

type AttributeBinding<TSource> = (source: TSource) => void;

interface DirectionalLight {
  color: vector.Vector3;
  direction: vector.Vector3;
  shadow: boolean;
}

interface Directive {
  name: string;
  value: number;
}

interface Geometry {
  colors: Attribute | undefined;
  coords: Attribute | undefined;
  count: number;
  indexBuffer: WebGLBuffer;
  indexType: number;
  normals: Attribute | undefined;
  points: Attribute;
  tangents: Attribute | undefined;
}

interface Material {
  albedoFactor: number[];
  albedoMap: WebGLTexture | undefined;
  emissiveFactor: number[];
  emissiveMap: WebGLTexture | undefined;
  glossFactor: number[];
  glossMap: WebGLTexture | undefined;
  heightMap: WebGLTexture | undefined;
  heightParallaxBias: number;
  heightParallaxScale: number;
  id: string;
  metalnessMap: WebGLTexture | undefined;
  metalnessStrength: number;
  normalMap: WebGLTexture | undefined;
  occlusionMap: WebGLTexture | undefined;
  occlusionStrength: number;
  roughnessMap: WebGLTexture | undefined;
  roughnessStrength: number;
  shininess: number;
}

interface Mesh {
  nodes: Node[];
}

interface NativeFormat {
  format: number;
  internal: number;
  type: number;
}

interface Node {
  children: Node[];
  primitives: Primitive[];
  transform: matrix.Matrix4;
}

interface NodeState {
  normalMatrix: Iterable<number>; // FIXME: inconsistent type
  transform: matrix.Matrix4;
}

interface Painter<T> {
  paint(
    target: Target,
    subjects: Iterable<Subject>,
    view: matrix.Matrix4,
    state: T
  ): void;
}

interface Pipeline {
  process(target: Target, transform: Transform, scene: Scene): void;
  resize(width: number, height: number): void;
}

interface PointLight {
  color: vector.Vector3;
  position: vector.Vector3;
  radius: number;
}

interface Primitive {
  geometry: Geometry;
  material: Material;
}

type PropertyBinding<T> = (source: T) => void;

interface Scene {
  ambientLightColor?: vector.Vector3;
  directionalLights?: DirectionalLight[];
  environmentLight?: {
    brdf: WebGLTexture;
    diffuse: WebGLTexture;
    specular: WebGLTexture;
  };
  pointLights?: PointLight[];
  subjects: Subject[];
}

interface Subject {
  matrix: matrix.Matrix4;
  mesh: Mesh;
  noShadow?: boolean;
}

type TextureBinding<T> = (source: T, textureIndex: number) => number;

const enum TextureFormat {
  Depth16,
  RGBA8,
}

const enum TextureType {
  Quad,
  Cube,
}

interface Transform {
  projectionMatrix: matrix.Matrix4;
  viewMatrix: matrix.Matrix4;
}

type UniformMatrixSetter<T> = (
  location: WebGLUniformLocation,
  transpose: boolean,
  value: T
) => void;
type UniformValueSetter<T> = (location: WebGLUniformLocation, value: T) => void;

const colorBlack = { x: 0, y: 0, z: 0, w: 0 };
const colorWhite = { x: 1, y: 1, z: 1, w: 1 };

const bufferConvert = (
  gl: WebGLRenderingContext,
  target: number,
  values: model.Array
) => {
  const buffer = gl.createBuffer();

  if (buffer === null) throw Error("could not create buffer");

  gl.bindBuffer(target, buffer);
  gl.bufferData(target, values, gl.STATIC_DRAW);

  return buffer;
};

/*
 ** Find OpenGL type from associated array type.
 ** See: https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/vertexAttribPointer
 */
const bufferGetType = (gl: WebGLRenderingContext, array: model.Array) => {
  if (array instanceof Float32Array) return gl.FLOAT;
  else if (array instanceof Int32Array) return gl.INT;
  else if (array instanceof Uint32Array) return gl.UNSIGNED_INT;
  else if (array instanceof Int16Array) return gl.SHORT;
  else if (array instanceof Uint16Array) return gl.UNSIGNED_SHORT;
  else if (array instanceof Int8Array) return gl.BYTE;
  else if (array instanceof Uint8Array) return gl.UNSIGNED_BYTE;

  throw Error(`unsupported array type for indices`);
};

/*
 ** Convert texture format into native WebGL format parameters.
 */
const formatGetNative = (
  gl: WebGLRenderingContext,
  format: TextureFormat
): NativeFormat => {
  switch (format) {
    case TextureFormat.Depth16:
      if (gl.VERSION < 2 && !gl.getExtension("WEBGL_depth_texture"))
        throw Error("depth texture WebGL extension is not available");

      return {
        format: gl.DEPTH_COMPONENT,
        internal: gl.DEPTH_COMPONENT16,
        type: gl.UNSIGNED_SHORT,
      };

    case TextureFormat.RGBA8:
      return {
        format: gl.RGBA,
        internal: (<any>gl).RGBA8, // FIXME: incomplete @type for WebGL2
        type: gl.UNSIGNED_BYTE,
      };

    default:
      throw Error(`invalid texture format ${format}`);
  }
};

const renderbufferConfigure = (
  gl: WebGLRenderingContext,
  renderbuffer: WebGLRenderbuffer,
  width: number,
  height: number,
  format: TextureFormat,
  samples: number
) => {
  const nativeFormat = formatGetNative(gl, format);

  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

  if (samples > 1)
    (<any>gl).renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      nativeFormat.internal,
      width,
      height
    );
  // FIXME: incomplete @type for WebGL2
  else
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      nativeFormat.internal,
      width,
      height
    );

  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  return renderbuffer;
};

const renderbufferCreate = (gl: WebGLRenderingContext) => {
  const renderbuffer = gl.createRenderbuffer();

  if (renderbuffer === null) throw Error("could not create renderbuffer");

  return renderbuffer;
};

const textureConfigure = (
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  type: TextureType,
  width: number,
  height: number,
  format: TextureFormat,
  filter: model.Filter,
  image: ImageData | ImageData[] | undefined
) => {
  const isPowerOfTwo =
    ((height - 1) & height) === 0 && ((width - 1) & width) === 0;
  const target = textureGetTarget(gl, type);

  gl.bindTexture(target, texture);

  // Define texture format, filtering & wrapping parameters
  const magnifierFilter =
    filter.magnifier === model.Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
  const minifierFilter =
    filter.minifier === model.Interpolation.Linear ? gl.LINEAR : gl.NEAREST;
  const mipmapFilter =
    filter.minifier === model.Interpolation.Linear
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

    for (let i = 0; i < 6; ++i)
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

  if (filter.mipmap && isPowerOfTwo) gl.generateMipmap(target);

  gl.bindTexture(target, null);

  return texture;
};

const textureCreate = (gl: WebGLRenderingContext) => {
  const texture = gl.createTexture();

  if (texture === null) throw Error("could not create texture");

  return texture;
};

const textureGetTarget = (gl: WebGLRenderingContext, type: TextureType) => {
  switch (type) {
    case TextureType.Cube:
      return gl.TEXTURE_CUBE_MAP;

    case TextureType.Quad:
      return gl.TEXTURE_2D;

    default:
      throw Error(`unknown texture type ${type}`);
  }
};

const textureGetWrap = (gl: WebGLRenderingContext, wrap: model.Wrap) => {
  switch (wrap) {
    case model.Wrap.Clamp:
      return gl.CLAMP_TO_EDGE;

    case model.Wrap.Mirror:
      return gl.MIRRORED_REPEAT;

    case model.Wrap.Repeat:
      return gl.REPEAT;

    default:
      throw Error(`unknown texture wrap mode ${wrap}`);
  }
};

const invalidAttributeBinding = (name: string) =>
  Error(`cannot draw mesh with no ${name} attribute when shader expects one`);
const invalidMaterial = (name: string) =>
  Error(`cannot use unknown material "${name}" on mesh`);
const invalidUniformBinding = (name: string) =>
  Error(`cannot draw mesh with no ${name} uniform when shader expects one`);

const loadGeometry = (
  gl: WebGLRenderingContext,
  geometry: model.Geometry,
  materials: { [name: string]: Material },
  defaultMaterial: Material
): Primitive => {
  return {
    geometry: {
      colors: functional.map(geometry.colors, (colors) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, colors.buffer),
        size: colors.stride,
        stride: colors.stride * colors.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, colors.buffer),
      })),
      coords: functional.map(geometry.coords, (coords) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, coords.buffer),
        size: coords.stride,
        stride: coords.stride * coords.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, coords.buffer),
      })),
      count: geometry.indices.length,
      indexBuffer: bufferConvert(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.indices),
      indexType: bufferGetType(gl, geometry.indices),
      normals: functional.map(geometry.normals, (normals) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, normals.buffer),
        size: normals.stride,
        stride: normals.stride * normals.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, normals.buffer),
      })),
      points: {
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, geometry.points.buffer),
        size: geometry.points.stride,
        stride:
          geometry.points.stride * geometry.points.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, geometry.points.buffer),
      },
      tangents: functional.map(geometry.tangents, (tangents) => ({
        buffer: bufferConvert(gl, gl.ARRAY_BUFFER, tangents.buffer),
        size: tangents.stride,
        stride: tangents.stride * tangents.buffer.BYTES_PER_ELEMENT,
        type: bufferGetType(gl, tangents.buffer),
      })),
    },
    material:
      geometry.materialName !== undefined
        ? materials[geometry.materialName] || defaultMaterial
        : defaultMaterial,
  };
};

const loadMaterial = (
  gl: WebGLRenderingContext,
  id: string,
  material: model.Material
) => {
  const toColorMap = (texture: model.Texture) =>
    textureConfigure(
      gl,
      textureCreate(gl),
      TextureType.Quad,
      texture.image.width,
      texture.image.height,
      TextureFormat.RGBA8,
      texture.filter,
      texture.image
    );

  return {
    albedoFactor: vector.Vector4.toArray(material.albedoFactor || colorWhite),
    albedoMap: functional.map(material.albedoMap, toColorMap),
    emissiveFactor: vector.Vector4.toArray(
      material.emissiveFactor || colorBlack
    ),
    emissiveMap: functional.map(material.emissiveMap, toColorMap),
    glossFactor: vector.Vector4.toArray(
      material.glossFactor || material.albedoFactor || colorWhite
    ),
    glossMap: functional.map(material.glossMap, toColorMap),
    heightMap: functional.map(material.heightMap, toColorMap),
    heightParallaxBias: functional.coalesce(material.heightParallaxBias, 0),
    heightParallaxScale: functional.coalesce(material.heightParallaxScale, 0),
    id: id,
    metalnessMap: functional.map(material.metalnessMap, toColorMap),
    metalnessStrength: functional.coalesce(material.metalnessStrength, 0),
    normalMap: functional.map(material.normalMap, toColorMap),
    occlusionMap: functional.map(material.occlusionMap, toColorMap),
    occlusionStrength: functional.coalesce(material.occlusionStrength, 1),
    roughnessMap: functional.map(material.roughnessMap, toColorMap),
    roughnessStrength: functional.coalesce(material.roughnessStrength, 1),
    shininess: functional.coalesce(material.shininess, 30),
  };
};

const loadMesh = (gl: WebGLRenderingContext, mesh: model.Mesh): Mesh => {
  // Create pseudo-unique identifier
  // See: https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
  const guid = () => {
    const s4 = () =>
      Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);

    return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
  };

  const defaultMaterial = loadMaterial(gl, guid(), {});
  const materials: { [name: string]: Material } = {};
  const nodes: Node[] = [];

  for (const name in mesh.materials)
    materials[name] = loadMaterial(gl, guid(), mesh.materials[name]);

  for (const node of mesh.nodes)
    nodes.push(loadNode(gl, node, materials, defaultMaterial));

  return {
    nodes: nodes,
  };
};

const loadNode = (
  gl: WebGLRenderingContext,
  node: model.Node,
  materials: { [name: string]: Material },
  defaultMaterial: Material
): Node => ({
  children: node.children.map((child) =>
    loadNode(gl, child, materials, defaultMaterial)
  ),
  primitives: node.geometries.map((geometry) =>
    loadGeometry(gl, geometry, materials, defaultMaterial)
  ),
  transform: node.transform,
});

const loadTextureCube = (
  gl: WebGLRenderingContext,
  facePositiveX: ImageData,
  faceNegativeX: ImageData,
  facePositiveY: ImageData,
  faceNegativeY: ImageData,
  facePositiveZ: ImageData,
  faceNegativeZ: ImageData,
  filter?: model.Filter
): WebGLTexture => {
  return textureConfigure(
    gl,
    textureCreate(gl),
    TextureType.Cube,
    facePositiveX.width,
    facePositiveX.height,
    TextureFormat.RGBA8,
    functional.coalesce(filter, model.defaultFilter),
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
  gl: WebGLRenderingContext,
  image: ImageData,
  filter?: model.Filter
): WebGLTexture => {
  return textureConfigure(
    gl,
    textureCreate(gl),
    TextureType.Quad,
    image.width,
    image.height,
    TextureFormat.RGBA8,
    functional.coalesce(filter, model.defaultFilter),
    image
  );
};

class Shader<State> {
  private readonly attributePerGeometryBindings: AttributeBinding<Geometry>[];
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly propertyPerMaterialBindings: PropertyBinding<Material>[];
  private readonly propertyPerNodeBindings: PropertyBinding<NodeState>[];
  private readonly propertyPerTargetBindings: PropertyBinding<State>[];
  private readonly texturePerMaterialBindings: TextureBinding<Material>[];
  private readonly texturePerTargetBindings: TextureBinding<State>[];

  public constructor(
    gl: WebGLRenderingContext,
    vsSource: string,
    fsSource: string,
    directives: Directive[] = []
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
      Shader.compile(gl, gl.VERTEX_SHADER, header + vsSource)
    );
    gl.attachShader(
      program,
      Shader.compile(gl, gl.FRAGMENT_SHADER, header + fsSource)
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
  public bindGeometry(geometry: Geometry) {
    for (const binding of this.attributePerGeometryBindings) binding(geometry);
  }

  /*
   ** Assign per-material uniforms.
   */
  public bindMaterial(material: Material, textureIndex: number) {
    for (const binding of this.propertyPerMaterialBindings) binding(material);

    for (const binding of this.texturePerMaterialBindings)
      textureIndex += binding(material, textureIndex);

    return textureIndex;
  }

  /*
   ** Assign per-node uniforms.
   */
  public bindNode(nodeState: NodeState) {
    for (const binding of this.propertyPerNodeBindings) binding(nodeState);
  }

  /*
   ** Assign per-target uniforms.
   */
  public bindTarget(state: State) {
    let textureIndex = 0;

    for (const binding of this.propertyPerTargetBindings) binding(state);

    for (const binding of this.texturePerTargetBindings)
      textureIndex += binding(state, textureIndex);

    return textureIndex;
  }

  public clearAttributePerGeometry(name: string) {
    const gl = this.gl;
    const location = this.findAttribute(name);

    this.attributePerGeometryBindings.push((geometry: Geometry) => {
      gl.disableVertexAttribArray(location);
    });
  }

  public setupAttributePerGeometry(
    name: string,
    getter: (state: Geometry) => Attribute | undefined
  ) {
    const gl = this.gl;
    const location = this.findAttribute(name);

    this.attributePerGeometryBindings.push((geometry: Geometry) => {
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

  public setupMatrixPerNode(
    name: string,
    getter: (state: NodeState) => Iterable<number>,
    assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>
  ) {
    this.propertyPerNodeBindings.push(this.declareMatrix(name, getter, assign));
  }

  public setupMatrixPerTarget(
    name: string,
    getter: (state: State) => Iterable<number>,
    assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>
  ) {
    this.propertyPerTargetBindings.push(
      this.declareMatrix(name, getter, assign)
    );
  }

  public setupPropertyPerMaterial<TValue>(
    name: string,
    getter: (state: Material) => TValue,
    assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>
  ) {
    this.propertyPerMaterialBindings.push(
      this.declareProperty(name, getter, assign)
    );
  }

  public setupPropertyPerTarget<TValue>(
    name: string,
    getter: (state: State) => TValue,
    assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>
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
    type: TextureType,
    getter: (state: Material) => WebGLTexture | undefined
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
    type: TextureType,
    getter: (state: State) => WebGLTexture | undefined
  ) {
    this.texturePerTargetBindings.push(
      this.declareTexture(samplerName, enabledName, type, getter)
    );
  }

  private declareMatrix<TSource>(
    name: string,
    getter: (state: TSource) => Iterable<number>,
    assign: (gl: WebGLRenderingContext) => UniformMatrixSetter<Float32Array>
  ) {
    const gl = this.gl;
    const location = this.findUniform(name);
    const method = assign(gl);

    return (state: TSource) =>
      method.call(gl, location, false, new Float32Array(getter(state)));
  }

  private declareProperty<TSource, TValue>(
    name: string,
    getter: (source: TSource) => TValue,
    assign: (gl: WebGLRenderingContext) => UniformValueSetter<TValue>
  ) {
    const gl = this.gl;
    const location = this.findUniform(name);
    const method = assign(gl);

    return (source: TSource) => method.call(gl, location, getter(source));
  }

  private declareTexture<TSource>(
    samplerName: string,
    enabledName: string | undefined,
    type: TextureType,
    getter: (source: TSource) => WebGLTexture | undefined
  ) {
    const enabledLocation = functional.map(enabledName, (name) =>
      this.findUniform(name)
    );
    const gl = this.gl;
    const samplerLocation = this.findUniform(samplerName);
    const target = textureGetTarget(gl, type);

    if (enabledLocation !== undefined) {
      return (source: TSource, textureIndex: number) => {
        const texture = getter(source);

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
        const texture = getter(source);

        if (texture === undefined)
          throw Error(`missing mandatory texture uniform "${samplerName}"`);

        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        gl.bindTexture(target, texture);
        gl.uniform1i(samplerLocation, textureIndex);

        return 1;
      };
    }
  }

  private findAttribute(name: string) {
    const location = this.gl.getAttribLocation(this.program, name);

    if (location === -1)
      throw Error(`cound not find location of attribute "${name}"`);

    return location;
  }

  private findUniform(name: string) {
    const location = this.gl.getUniformLocation(this.program, name);

    if (location === null)
      throw Error(`cound not find location of uniform "${name}"`);

    return location;
  }

  private static compile(
    gl: WebGLRenderingContext,
    shaderType: number,
    source: string
  ) {
    const shader = gl.createShader(shaderType);

    if (shader === null) throw Error(`could not create shader`);

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

class Target {
  private readonly gl: WebGLRenderingContext;

  private colorAttachment: Attachment;
  private colorClear: vector.Vector4;
  private depthAttachment: Attachment;
  private depthClear: number;
  private framebuffer: WebGLFramebuffer | null;
  private viewHeight: number;
  private viewWidth: number;

  public constructor(gl: WebGLRenderingContext, width: number, height: number) {
    this.colorAttachment = { renderbuffer: undefined, textures: [] };
    this.colorClear = colorBlack;
    this.depthAttachment = { renderbuffer: undefined, textures: [] };
    this.depthClear = 1;
    this.framebuffer = null;
    this.gl = gl;
    this.viewHeight = height;
    this.viewWidth = width;
  }

  public clear() {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
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

    Target.clearRenderbufferAttachments(gl, this.colorAttachment);
    Target.clearTextureAttachments(gl, this.depthAttachment);
  }

  public draw(indices: WebGLBuffer, count: number, type: number) {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.drawElements(gl.TRIANGLES, count, type, 0);
  }

  public resize(width: number, height: number) {
    const gl = this.gl;

    for (const attachment of [this.colorAttachment, this.depthAttachment]) {
      // Resize existing renderbuffer attachment if any
      if (attachment.renderbuffer !== undefined)
        renderbufferConfigure(
          gl,
          attachment.renderbuffer.handle,
          width,
          height,
          attachment.renderbuffer.format,
          1
        );

      // Resize previously existing texture attachments if any
      for (const texture of attachment.textures)
        textureConfigure(
          gl,
          texture.handle,
          TextureType.Quad,
          width,
          height,
          texture.format,
          model.defaultFilter,
          undefined
        );
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

  public setupColorRenderbuffer(format: TextureFormat) {
    return this.attachRenderbuffer(
      this.colorAttachment,
      format,
      this.gl.COLOR_ATTACHMENT0
    );
  }

  public setupColorTexture(format: TextureFormat) {
    const gl = this.gl;
    const texture = this.attachTexture(
      this.colorAttachment,
      format,
      gl.COLOR_ATTACHMENT0
    );

    // Configure draw buffers
    if (this.colorAttachment.textures !== undefined) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

      // FIXME: incomplete @type for WebGL2
      (<any>gl).drawBuffers(
        functional.range(
          this.colorAttachment.textures.length,
          (i) => gl.COLOR_ATTACHMENT0 + i
        )
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    return texture;
  }

  public setupDepthRenderbuffer(format: TextureFormat) {
    return this.attachRenderbuffer(
      this.depthAttachment,
      format,
      this.gl.DEPTH_ATTACHMENT
    );
  }

  public setupDepthTexture(format: TextureFormat) {
    return this.attachTexture(
      this.depthAttachment,
      format,
      this.gl.DEPTH_ATTACHMENT
    );
  }

  private static clearRenderbufferAttachments(
    gl: WebGLRenderingContext,
    attachment: Attachment
  ) {
    if (attachment.renderbuffer !== undefined) {
      gl.deleteRenderbuffer(attachment.renderbuffer.handle);

      attachment.renderbuffer = undefined;
    }
  }

  private static clearTextureAttachments(
    gl: WebGLRenderingContext,
    attachment: Attachment
  ) {
    if (attachment.textures !== undefined) {
      for (const texture of attachment.textures)
        gl.deleteTexture(texture.handle);

      attachment.textures = [];
    }
  }

  private static checkFramebuffer(gl: WebGLRenderingContext) {
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("invalid framebuffer operation");
  }

  private attachFramebuffer() {
    if (this.framebuffer !== null) return this.framebuffer;

    const framebuffer = this.gl.createFramebuffer();

    if (framebuffer === null) throw Error("could not create framebuffer");

    this.framebuffer = framebuffer;

    return framebuffer;
  }

  private attachRenderbuffer(
    attachment: Attachment,
    format: TextureFormat,
    target: number
  ) {
    const framebuffer = this.attachFramebuffer();
    const gl = this.gl;

    // Clear renderbuffer and texture attachments if any
    Target.clearRenderbufferAttachments(gl, attachment);
    Target.clearTextureAttachments(gl, attachment);

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

    Target.checkFramebuffer(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return renderbuffer;
  }

  private attachTexture(
    attachment: Attachment,
    format: TextureFormat,
    target: number
  ) {
    const framebuffer = this.attachFramebuffer();
    const gl = this.gl;

    // Reset renderbuffer attachment if any
    Target.clearRenderbufferAttachments(gl, attachment);

    // Create and append new texture attachment
    const filter = {
      magnifier: model.Interpolation.Nearest,
      minifier: model.Interpolation.Nearest,
      mipmap: false,
      wrap: model.Wrap.Clamp,
    };

    const texture = textureConfigure(
      gl,
      textureCreate(gl),
      TextureType.Quad,
      this.viewWidth,
      this.viewHeight,
      format,
      filter,
      undefined
    );

    const offset = attachment.textures.push({
      format: format,
      handle: texture,
    });

    // Bind attachment to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      target + offset - 1,
      gl.TEXTURE_2D,
      texture,
      0
    );

    Target.checkFramebuffer(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return texture;
  }
}

export {
  Attribute,
  Painter,
  DirectionalLight,
  Directive,
  TextureFormat,
  Geometry,
  Material,
  Mesh,
  Node,
  PointLight,
  Pipeline,
  Scene,
  Shader,
  Subject,
  Target,
  TextureType,
  Transform,
  loadMesh,
  loadTextureCube,
  loadTextureQuad,
};
