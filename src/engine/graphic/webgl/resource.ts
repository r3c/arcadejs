import { Disposable } from "../../language/lifecycle";

type GlArray = Omit<
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array,
  "length"
>;

type GlBuffer = Disposable & {
  allocate: (length: number) => void;
  reset: (data: GlArray, length: number) => void;
  update: (offset: number, data: GlArray, length: number) => void;
  buffer: WebGLBuffer;
  capacity: number;
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

const createBuffer = (
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

  const allocate = (length: number) => {
    const recycle = 10; // FIXME: recycle factor

    if (instance.capacity < length || instance.capacity >= length * recycle) {
      gl.bindBuffer(bufferTarget, buffer);
      gl.bufferData(bufferTarget, data.BYTES_PER_ELEMENT * length, usage);

      instance.capacity = length;
    }

    instance.length = length;
  };

  const dispose = () => {
    gl.deleteBuffer(buffer);
  };

  const reset = (data: GlArray, length: number) => {
    gl.bindBuffer(bufferTarget, buffer);
    gl.bufferData(bufferTarget, data, usage, 0, length);

    instance.capacity = length;
    instance.length = length;
    instance.type = bufferType(gl, data);
  };

  const update = (offset: number, data: GlArray, length: number) => {
    if (offset + length > instance.capacity) {
      throw Error(
        `cannot write at offset ${offset} + length ${length} into a buffer of capacity ${instance.capacity}`
      );
    }

    gl.bindBuffer(bufferTarget, buffer);
    gl.bufferSubData(
      bufferTarget,
      data.BYTES_PER_ELEMENT * offset,
      data,
      0,
      length
    );
  };

  const instance: GlBuffer = {
    allocate,
    dispose,
    reset,
    update,
    buffer,
    capacity: 0,
    length: 0,
    type: gl.BYTE,
  };

  reset(data, length);

  return instance;
};

const createArrayBuffer = (
  gl: GlContext,
  data: GlArray,
  length: number,
  isDynamic: boolean
): GlBuffer => createBuffer(gl, gl.ARRAY_BUFFER, data, length, isDynamic);

const createIndexBuffer = (
  gl: GlContext,
  data: GlArray,
  length: number,
  isDynamic: boolean
): GlBuffer =>
  createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, data, length, isDynamic);

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
  createArrayBuffer,
  createIndexBuffer,
};
