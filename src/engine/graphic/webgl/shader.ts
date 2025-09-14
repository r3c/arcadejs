import { Disposable } from "../../language/lifecycle";
import { Matrix3, Matrix4 } from "../../math/matrix";
import { Vector2, Vector3, Vector4 } from "../../math/vector";
import { GlBuffer, GlContext } from "./resource";
import { GlTexture } from "./texture";

type GlShaderAttribute = {
  buffer: GlBuffer;
  stride: number;
};

type GlBinder<TState> = (state: TState) => void;

type GlBinderMap<TState> = Map<string, GlBinder<TState>>;

type GlShaderBinding<TState> = {
  bind: (state: TState) => void;
  setAttribute: (
    name: string,
    getter: (state: TState) => GlShaderAttribute | undefined
  ) => void;
  setUniform: <TValue>(
    name: string,
    accessor: GlShaderUniform<TState, TValue>
  ) => void;
};

type GlShaderDefault = {
  textureBlack: GlTexture;
  textureNormal: GlTexture;
  textureWhite: GlTexture;
};

type GlShader = Disposable & {
  declare: <TState>() => GlShaderBinding<TState>;
};

type GlShaderFunction<
  TDeclare extends Record<string, unknown>,
  TInvoke extends Record<string, string>
> = {
  declare: (parameters: TDeclare) => string;
  invoke: (parameters: TInvoke) => string;
};

type GlShaderUniform<TState, TValue> = {
  allocateTexture: boolean;
  createValue: (gl: GlContext) => TValue;
  readValue: (
    state: TState,
    currentValue: TValue,
    defaultValue: GlShaderDefault
  ) => TValue;
  setUniform: (
    gl: GlContext,
    location: WebGLUniformLocation,
    value: TValue,
    textureIndex: number
  ) => void;
};

const compileShader = (
  gl: GlContext,
  shaderType: number,
  source: string
): WebGLShader => {
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
};

const createAttribute = (
  buffer: GlBuffer,
  stride: number
): GlShaderAttribute => {
  return { buffer, stride };
};

const createShader = (
  gl: GlContext,
  useProgram: (program: WebGLProgram) => void,
  shaderDefault: GlShaderDefault,
  vertexShaderSource: string,
  fragmentShaderSource: string
): GlShader => {
  const program = gl.createProgram();

  if (program === null) {
    throw Error("could not create program");
  }

  try {
    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      shaderHeader + vertexShaderSource
    );

    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      shaderHeader + fragmentShaderSource
    );

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
  } catch (e) {
    gl.deleteProgram(program);

    throw e;
  }

  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);

    gl.deleteProgram(program);

    throw Error(`could not link program: ${error}`);
  }

  let textureIndex = 0;

  return {
    declare: <TState>(): GlShaderBinding<TState> => {
      const allocateTextureIndex = () => textureIndex++;
      const attributes: GlBinderMap<TState> = new Map();
      const uniforms: GlBinderMap<TState> = new Map();

      return {
        bind: (state) => {
          useProgram(program);

          for (const binding of attributes.values()) {
            binding(state);
          }

          for (const binding of uniforms.values()) {
            binding(state);
          }
        },

        setAttribute: (name, getter) => {
          if (attributes.has(name)) {
            throw new Error(`cannot set attribute "${name}" twice`);
          }

          const location = gl.getAttribLocation(program, name);

          if (location === -1) {
            throw Error(`cound not find location of attribute "${name}"`);
          }

          attributes.set(name, (state: TState) => {
            const attribute = getter(state);

            if (attribute === undefined) {
              throw Error(`undefined geometry attribute "${name}"`);
            }

            const { buffer, stride } = attribute;

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
            gl.vertexAttribPointer(
              location,
              stride,
              buffer.type,
              false,
              buffer.bytesPerElement * stride,
              0
            );
            gl.enableVertexAttribArray(location);
          });
        },

        setUniform: (name, accessor) => {
          if (uniforms.has(name)) {
            throw new Error(`cannot set uniform "${name}" twice`);
          }

          const { allocateTexture, createValue, readValue, setUniform } =
            accessor;
          const currentValue = createValue(gl);
          const textureIndex = allocateTexture ? allocateTextureIndex() : 0;

          const location = gl.getUniformLocation(program, name);

          if (location === null) {
            throw Error(`cound not find location of uniform "${name}"`);
          }

          uniforms.set(name, (state: TState) => {
            const uniform = readValue(state, currentValue, shaderDefault);

            setUniform(gl, location, uniform, textureIndex);
          });
        },
      };
    },
    dispose: () => {
      gl.deleteProgram(program);
    },
  };
};

const textureUniform = <TState>(
  primaryGetter: (state: TState) => GlTexture | undefined,
  defaultGetter: (defaultValue: GlShaderDefault) => GlTexture,
  target: GlContext["TEXTURE_2D"] | GlContext["TEXTURE_CUBE_MAP"]
): GlShaderUniform<TState, { target: number; texture: GlTexture }> => ({
  allocateTexture: true,
  createValue: () => ({ target, texture: { dispose: () => {}, handle: {} } }),
  readValue: (state, { target }, defaultValue) => ({
    target,
    texture: primaryGetter(state) ?? defaultGetter(defaultValue),
  }),
  setUniform: (gl, location, { target, texture }, textureIndex) => {
    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    gl.bindTexture(target, texture.handle);
    gl.uniform1i(location, textureIndex);
  },
});

const shaderCondition = (
  condition: boolean,
  whenTrue: string,
  whenFalse?: string
): string => (condition ? whenTrue : whenFalse ?? "");

const shaderSwitch = <T>(value: T, ...pairs: [T, string][]): string => {
  const pair = pairs.find(([comparand]) => comparand === value);

  if (pair !== undefined) {
    return pair[1];
  }

  throw new Error(`no pair found matching ${value}`);
};

const shaderUniform = {
  boolean: <TState>(
    getter: (state: TState) => boolean
  ): GlShaderUniform<TState, number> => ({
    allocateTexture: false,
    createValue: () => 0,
    readValue: (state) => (getter(state) ? 1 : 0),
    setUniform: (g, l, v) => g.uniform1i(l, v),
  }),

  matrix3f: <TState>(
    getter: (state: TState) => Matrix3
  ): GlShaderUniform<TState, Float32Array> => {
    return {
      allocateTexture: false,
      createValue: () => new Float32Array(9),
      readValue: (state, value) => {
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
  },

  matrix4f: <TState>(
    getter: (state: TState) => Matrix4
  ): GlShaderUniform<TState, Float32Array> => ({
    allocateTexture: false,
    createValue: () => new Float32Array(16),
    readValue: (state, value) => {
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
  }),

  number: <TState>(
    getter: (state: TState) => number
  ): GlShaderUniform<TState, number> => ({
    allocateTexture: false,
    createValue: () => 0,
    readValue: (state) => getter(state),
    setUniform: (g, l, v) => g.uniform1f(l, v),
  }),

  tex2dBlack: <TState>(getter: (state: TState) => GlTexture | undefined) =>
    textureUniform(
      getter,
      ({ textureBlack }) => textureBlack,
      WebGL2RenderingContext["TEXTURE_2D"]
    ),

  tex2dNormal: <TState>(getter: (state: TState) => GlTexture | undefined) =>
    textureUniform(
      getter,
      ({ textureNormal }) => textureNormal,
      WebGL2RenderingContext["TEXTURE_2D"]
    ),

  tex2dWhite: <TState>(getter: (state: TState) => GlTexture | undefined) =>
    textureUniform(
      getter,
      ({ textureWhite }) => textureWhite,
      WebGL2RenderingContext["TEXTURE_2D"]
    ),

  tex3d: <TState>(getter: (state: TState) => GlTexture | undefined) =>
    textureUniform(
      getter,
      () => {
        throw new Error("undefined cube texture");
      },
      WebGL2RenderingContext["TEXTURE_CUBE_MAP"]
    ),

  vector2f: <TState>(
    getter: (state: TState) => Vector2
  ): GlShaderUniform<TState, Float32Array> => ({
    allocateTexture: false,
    createValue: () => new Float32Array(2),
    readValue: (state, value) => {
      const vector = getter(state);

      value[0] = vector.x;
      value[1] = vector.y;

      return value;
    },
    setUniform: (g, l, v) => g.uniform2fv(l, v),
  }),

  vector3f: <TState>(
    getter: (state: TState) => Vector3
  ): GlShaderUniform<TState, Float32Array> => ({
    allocateTexture: false,
    createValue: () => new Float32Array(3),
    readValue: (state, value) => {
      const vector = getter(state);

      value[0] = vector.x;
      value[1] = vector.y;
      value[2] = vector.z;

      return value;
    },
    setUniform: (g, l, v) => g.uniform3fv(l, v),
  }),

  vector4f: <TState>(
    getter: (state: TState) => Vector4
  ): GlShaderUniform<TState, Float32Array> => ({
    allocateTexture: false,
    createValue: () => new Float32Array(4),
    readValue: (state, value) => {
      const vector = getter(state);

      value[0] = vector.x;
      value[1] = vector.y;
      value[2] = vector.z;
      value[3] = vector.w;

      return value;
    },
    setUniform: (g, l, v) => g.uniform4fv(l, v),
  }),
};

const shaderHeader =
  "#version 300 es\n" +
  "#ifdef GL_ES\n" +
  "precision highp float;\n" +
  "#endif\n";

export {
  type GlShader,
  type GlShaderAttribute,
  type GlShaderBinding,
  type GlShaderFunction,
  createAttribute,
  createShader,
  shaderCondition,
  shaderSwitch,
  shaderUniform,
};
