import { Disposable } from "../../language/lifecycle";

type GlArray =
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

type GlAttribute = Disposable & {
  buffer: GlBuffer;
  size: number;
  stride: number;
};

type GlBuffer = Disposable & {
  set: (data: GlArray) => void;
  buffer: WebGLBuffer;
  count: number;
  type: GlBufferType;
};

type GlBufferTarget =
  | WebGL2RenderingContext["ARRAY_BUFFER"]
  | WebGL2RenderingContext["ELEMENT_ARRAY_BUFFER"];

type GlBufferType =
  | WebGL2RenderingContext["FLOAT"]
  | WebGL2RenderingContext["INT"]
  | WebGL2RenderingContext["UNSIGNED_INT"]
  | WebGL2RenderingContext["SHORT"]
  | WebGL2RenderingContext["UNSIGNED_SHORT"]
  | WebGL2RenderingContext["BYTE"]
  | WebGL2RenderingContext["UNSIGNED_BYTE"];

type GlContext = WebGL2RenderingContext;

const attributeCreate = (
  gl: GlContext,
  source: GlArray,
  stride: number,
  isDynamic: boolean
): GlAttribute => {
  const buffer = bufferCreate(gl, gl.ARRAY_BUFFER, source, isDynamic);

  return {
    dispose: buffer.dispose,
    buffer,
    size: stride,
    stride: stride * source.BYTES_PER_ELEMENT,
  };
};

const bufferCreate = (
  gl: GlContext,
  bufferTarget: GlBufferTarget,
  source: GlArray,
  isDynamic: boolean
): GlBuffer => {
  const buffer = gl.createBuffer();

  if (buffer === null) {
    throw Error("could not create buffer");
  }

  const usage = isDynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;

  gl.bindBuffer(bufferTarget, buffer);
  gl.bufferData(bufferTarget, source, usage);

  const result = {
    dispose: () => {
      gl.deleteBuffer(buffer);
    },
    set: (source: GlArray) => {
      gl.bindBuffer(bufferTarget, buffer);
      gl.bufferData(bufferTarget, source, usage);

      result.count = source.length;
      result.type = bufferType(gl, source);
    },
    buffer,
    count: source.length,
    type: bufferType(gl, source),
  };

  return result;
};

/*
 ** Find OpenGL type from associated array type.
 ** See: https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/vertexAttribPointer
 */
const bufferType = (gl: GlContext, array: GlArray): GlBufferType => {
  if (array instanceof Float32Array) {
    return gl.FLOAT;
  } else if (array instanceof Int32Array) {
    return gl.INT;
  } else if (array instanceof Uint32Array) {
    return gl.UNSIGNED_INT;
  } else if (array instanceof Int16Array) {
    return gl.SHORT;
  } else if (array instanceof Uint16Array) {
    return gl.UNSIGNED_SHORT;
  } else if (array instanceof Int8Array) {
    return gl.BYTE;
  } else if (array instanceof Uint8Array) {
    return gl.UNSIGNED_BYTE;
  }

  throw Error(`unsupported array type for indices`);
};

export {
  type GlAttribute,
  type GlBuffer,
  type GlContext,
  attributeCreate,
  bufferCreate,
};
