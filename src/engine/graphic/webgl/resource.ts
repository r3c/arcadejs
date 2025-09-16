import { Releasable } from "../../io/resource";

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

type GlArrayConstructor =
  | Float32ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor;

type GlBuffer = Releasable & {
  resize: (length: number) => void;
  set: (data: GlArray, length: number) => void;
  update: (offset: number, data: GlArray, length: number) => void;
  buffer: WebGLBuffer;
  bytesPerElement: number;
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

type GlBufferUsage =
  | WebGL2RenderingContext["DYNAMIC_DRAW"]
  | WebGL2RenderingContext["STATIC_DRAW"];

type GlContext = WebGL2RenderingContext;

const createBuffer = (
  gl: GlContext,
  bufferTarget: GlBufferTarget,
  arrayConstructor: GlArrayConstructor,
  recycleRatio: number,
  usage: GlBufferUsage
): GlBuffer => {
  const buffer = gl.createBuffer();

  if (buffer === null) {
    throw Error("could not create buffer");
  }

  const self: GlBuffer = {
    release: () => {
      gl.deleteBuffer(buffer);
    },
    resize: (length: number) => {
      if (self.capacity < length || self.capacity >= length * recycleRatio) {
        gl.bindBuffer(bufferTarget, buffer);
        gl.bufferData(bufferTarget, self.bytesPerElement * length, usage);

        self.capacity = length;
      }

      self.length = length;
    },
    set: (data: GlArray, length: number) => {
      gl.bindBuffer(bufferTarget, buffer);
      gl.bufferData(bufferTarget, data, usage, 0, length);

      self.bytesPerElement = data.BYTES_PER_ELEMENT;
      self.capacity = length;
      self.length = length;
      self.type = bufferType(gl, data);
    },
    update: (offset: number, data: GlArray, length: number) => {
      if (data.BYTES_PER_ELEMENT !== self.bytesPerElement) {
        throw Error(
          `cannot change buffer with ${self.bytesPerElement} byte(s) per element to ${data.BYTES_PER_ELEMENT}`
        );
      }

      if (offset + length > self.capacity) {
        throw Error(
          `cannot write at offset ${offset} + length ${length} into a buffer of capacity ${self.capacity}`
        );
      }

      gl.bindBuffer(bufferTarget, buffer);
      gl.bufferSubData(
        bufferTarget,
        self.bytesPerElement * offset,
        data,
        0,
        length
      );
    },
    bytesPerElement: arrayConstructor.BYTES_PER_ELEMENT,
    buffer,
    capacity: 0,
    length: 0,
    type: bufferType(gl, new arrayConstructor()),
  };

  return self;
};

const createDynamicArrayBuffer = (
  gl: GlContext,
  arrayConstructor: GlArrayConstructor,
  recycleRatio: number
): GlBuffer =>
  createBuffer(
    gl,
    gl.ARRAY_BUFFER,
    arrayConstructor,
    recycleRatio,
    gl.DYNAMIC_DRAW
  );

const createDynamicIndexBuffer = (
  gl: GlContext,
  arrayConstructor: GlArrayConstructor,
  recycleRatio: number
): GlBuffer =>
  createBuffer(
    gl,
    gl.ELEMENT_ARRAY_BUFFER,
    arrayConstructor,
    recycleRatio,
    gl.DYNAMIC_DRAW
  );

const createStaticArrayBuffer = (
  gl: GlContext,
  arrayConstructor: GlArrayConstructor
): GlBuffer =>
  createBuffer(gl, gl.ARRAY_BUFFER, arrayConstructor, 1, gl.STATIC_DRAW);

const createStaticIndexBuffer = (
  gl: GlContext,
  arrayConstructor: GlArrayConstructor
): GlBuffer =>
  createBuffer(
    gl,
    gl.ELEMENT_ARRAY_BUFFER,
    arrayConstructor,
    1,
    gl.STATIC_DRAW
  );

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
  type GlArrayConstructor,
  type GlBuffer,
  type GlContext,
  createDynamicArrayBuffer,
  createDynamicIndexBuffer,
  createStaticArrayBuffer,
  createStaticIndexBuffer,
};
