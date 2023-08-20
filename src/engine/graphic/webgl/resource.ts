import { Disposable } from "../../language/lifecycle";

type GlArray =
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

type GlBuffer = Disposable & {
  set: (data: GlArray, length: number) => void;
  buffer: WebGLBuffer;
  length: number;
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

const arrayBuffer = (
  gl: GlContext,
  data: GlArray,
  length: number,
  isDynamic: boolean
): GlBuffer => bufferCreate(gl, gl.ARRAY_BUFFER, data, length, isDynamic);

const indexBuffer = (
  gl: GlContext,
  data: GlArray,
  length: number,
  isDynamic: boolean
): GlBuffer =>
  bufferCreate(gl, gl.ELEMENT_ARRAY_BUFFER, data, length, isDynamic);

const bufferCreate = (
  gl: GlContext,
  bufferTarget: GlBufferTarget,
  data: GlArray,
  length: number,
  isDynamic: boolean
): GlBuffer => {
  const buffer = gl.createBuffer();

  if (buffer === null) {
    throw Error("could not create buffer");
  }

  const usage = isDynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
  const set = (data: GlArray, length: number) => {
    if (length > data.length) {
      throw new Error("not enough data in source array");
    }

    gl.bindBuffer(bufferTarget, buffer);
    gl.bufferData(bufferTarget, data, usage, 0, length);

    result.length = length;
    result.type = bufferType(gl, data);
  };

  const result: GlBuffer = {
    dispose: () => {
      gl.deleteBuffer(buffer);
    },
    set,
    buffer,
    length: 0,
    type: gl.BYTE,
  };

  set(data, length);

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
  type GlArray,
  type GlBuffer,
  type GlContext,
  arrayBuffer,
  indexBuffer,
};
