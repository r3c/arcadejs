import { Releasable } from "../../io/resource";
import { createHashLookup } from "../../language/lookup";
import { Matrix3, Matrix4 } from "../../math/matrix";
import { Vector2, Vector3, Vector4 } from "../../math/vector";
import { GlBuffer, GlContext } from "./resource";
import { GlTexture } from "./texture";

type GlShader = Releasable & {
  declare: <TState>() => GlShaderBinding<TState>;
};

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
    getter: (state: TState) => GlShaderAttribute | undefined,
  ) => void;
  setUniform: <TValue, TUniform>(
    name: string,
    accessor: GlShaderUniform<TState, TValue, TUniform>,
  ) => void;
};

type GlShaderFallback = {
  cubeBlack: GlTexture;
  quadBlack: GlTexture;
  quadNormal: GlTexture;
  quadWhite: GlTexture;
};

/**
 * Language-level invokable function.
 */
type GlShaderFunction<TInvoke> = (invoke: TInvoke) => GlShaderSnippet;

/**
 * Language-level source code reference within another source code element.
 */
type GlShaderRequire = {
  source: string;
  symbol: Symbol;
};

/**
 * Language-level compilable source code.
 */
type GlShaderSnippet = {
  requires: readonly GlShaderRequire[];
  source: string;
};

/**
 * Language-level program input with sources for each pipeline stage.
 */
type GlShaderSource = {
  fragment: GlShaderSnippet;
  vertex: GlShaderSnippet;
};

/**
 * Language-level function template, create functions based on some compile-time arguments.
 */
type GlShaderTemplate<TDeclare, TInvoke> = (
  declare: TDeclare,
) => GlShaderFunction<TInvoke>;

/**
 * Program-level uniform accessor.
 */
type GlShaderUniform<TState, TValue, TUniform> = {
  allocateTexture: boolean;
  allocateValue: (gl: GlContext) => TValue;
  readUniform: (
    state: TState,
    buffer: TValue,
    fallback: GlShaderFallback,
  ) => TUniform;
  setUniform: (
    gl: GlContext,
    location: WebGLUniformLocation,
    value: TUniform,
    textureIndex: number,
  ) => void;
};

/**
 * Language-level element that can be embedded inside a snippet.
 */
type GlShaderVariable = GlShaderSnippet | number | string;

const compileShader = (
  gl: GlContext,
  shaderType: number,
  source: string,
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
          .join("\n")}`,
      );
    }

    throw Error(
      `could not compile ${name} shader (${error}) in source:\n${source}`,
    );
  }

  return shader;
};

const createAttribute = (
  buffer: GlBuffer,
  stride: number,
): GlShaderAttribute => {
  return { buffer, stride };
};

const createShader = (
  gl: GlContext,
  useProgram: (program: WebGLProgram) => void,
  fallback: GlShaderFallback,
  source: GlShaderSource,
): GlShader => {
  const program = gl.createProgram();

  if (program === null) {
    throw Error("could not create program");
  }

  try {
    const fragmentSource = shaderHeader + expandSnippet(source.fragment);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    const vertexSource = shaderHeader + expandSnippet(source.vertex);
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);

    gl.attachShader(program, fragment);
    gl.attachShader(program, vertex);
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
              0,
            );
            gl.enableVertexAttribArray(location);
          });
        },

        setUniform: (name, accessor) => {
          if (uniforms.has(name)) {
            throw new Error(`cannot set uniform "${name}" twice`);
          }

          const { allocateTexture, allocateValue, readUniform, setUniform } =
            accessor;
          const textureIndex = allocateTexture ? allocateTextureIndex() : 0;
          const value = allocateValue(gl);

          const location = gl.getUniformLocation(program, name);

          if (location === null) {
            throw Error(`cound not find location of uniform "${name}"`);
          }

          uniforms.set(name, (state: TState) => {
            const uniform = readUniform(state, value, fallback);

            setUniform(gl, location, uniform, textureIndex);
          });
        },
      };
    },
    release: () => {
      gl.deleteProgram(program);
    },
  };
};

/**
 * Create a singleton shader function with no declaration parameter that can be
 * directly invoked.
 */
const createSingletonFunction = <TInvoke>(
  require: GlShaderSnippet,
  invocation: (invoke: TInvoke) => string,
): GlShaderFunction<TInvoke> => {
  const requires = [
    ...require.requires,
    { source: require.source, symbol: Symbol() },
  ];

  return (invoke) => ({ requires, source: invocation(invoke) });
};

/**
 * Create a shader function that can be instanciated multiple times with
 * different declared parameters, each creating a unique function.
 */
const createUniqueTemplate = <TDeclare, TInvoke>(
  template: (
    declare: TDeclare,
    unique: string,
  ) => (invoke: TInvoke) => {
    require: GlShaderSnippet;
    source: GlShaderSnippet;
  },
): GlShaderTemplate<TDeclare, TInvoke> => {
  const lookup = createHashLookup<
    TDeclare,
    { symbol: Symbol; unique: string }
  >();

  let counter = 0;

  return (declare) => {
    const { symbol, unique } = lookup.getOrSet(declare, () => ({
      symbol: Symbol(),
      unique: `${counter++}`,
    }));

    const invocation = template(declare, unique);

    return (invoke) => {
      const { require, source } = invocation(invoke);

      return {
        requires: [
          ...require.requires,
          ...source.requires,
          { source: require.source, symbol },
        ],
        source: source.source,
      };
    };
  };
};

const expandSnippet = (snippet: GlShaderSnippet): string => {
  return [...snippet.requires.map(({ source }) => source), snippet.source].join(
    "\n",
  );
};

const shader = (
  strings: TemplateStringsArray,
  ...variables: GlShaderVariable[]
): GlShaderSnippet => {
  const requires: GlShaderRequire[] = [];
  const symbols: Set<Symbol> = new Set();

  let source = "";

  for (let i = 0; i < variables.length; ++i) {
    const variable = variables[i];

    let append: string;

    if (typeof variable === "number" || typeof variable === "string") {
      append = `${variable}`;
    } else {
      for (const require of variable.requires) {
        if (!symbols.has(require.symbol)) {
          requires.push(require);
          symbols.add(require.symbol);
        }
      }

      append = variable.source;
    }

    source += strings[i] + append;
  }

  source += strings[strings.length - 1];

  return { requires, source };
};

const shaderCase = <TKey>(
  value: TKey,
  ...cases: [TKey, GlShaderVariable][]
): GlShaderVariable => {
  const match = cases.find(([comparand]) => comparand === value);

  if (match !== undefined) {
    return match[1];
  }

  throw new Error(`no case found matching ${value}`);
};

const shaderLoop = (
  count: number,
  body: (i: number) => GlShaderVariable,
): GlShaderVariable => {
  let output = shader``;
  let split = "";

  for (let i = 0; i < count; ++i) {
    output = shader`${output}${split}{ ${body(i)} }`;
    split = "\n";
  }

  return output;
};

const shaderWhen = (
  condition: boolean,
  whenTrue: GlShaderVariable,
  whenFalse?: GlShaderVariable,
): GlShaderVariable => (condition ? whenTrue : (whenFalse ?? shader``));

const textureUniform = <TState>(
  getter: (state: TState, fallback: GlShaderFallback) => GlTexture,
  target: GlContext["TEXTURE_2D"] | GlContext["TEXTURE_CUBE_MAP"],
): GlShaderUniform<TState, undefined, GlTexture> => ({
  allocateTexture: true,
  allocateValue: () => undefined,
  readUniform: (state, _, defaultValue) => getter(state, defaultValue),
  setUniform: (gl, location, texture, textureIndex) => {
    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    gl.bindTexture(target, texture.handle);
    gl.uniform1i(location, textureIndex);
  },
});

const uniform = {
  boolean: <TState>(
    getter: (state: TState) => boolean,
  ): GlShaderUniform<TState, number, number> => ({
    allocateTexture: false,
    allocateValue: () => 0,
    readUniform: (state) => (getter(state) ? 1 : 0),
    setUniform: (g, l, v) => g.uniform1i(l, v),
  }),

  matrix3f: <TState>(
    getter: (state: TState) => Matrix3,
  ): GlShaderUniform<TState, Float32Array, Float32Array> => {
    return {
      allocateTexture: false,
      allocateValue: () => new Float32Array(9),
      readUniform: (state, value) => {
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
    getter: (state: TState) => Matrix4,
  ): GlShaderUniform<TState, Float32Array, Float32Array> => ({
    allocateTexture: false,
    allocateValue: () => new Float32Array(16),
    readUniform: (state, value) => {
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
    getter: (state: TState) => number,
  ): GlShaderUniform<TState, number, number> => ({
    allocateTexture: false,
    allocateValue: () => 0,
    readUniform: (state) => getter(state),
    setUniform: (g, l, v) => g.uniform1f(l, v),
  }),

  textureCube: <TState>(
    getter: (state: TState, fallback: GlShaderFallback) => GlTexture,
  ) => textureUniform(getter, WebGL2RenderingContext["TEXTURE_CUBE_MAP"]),

  textureQuad: <TState>(
    getter: (state: TState, fallback: GlShaderFallback) => GlTexture,
  ) => textureUniform(getter, WebGL2RenderingContext["TEXTURE_2D"]),

  vector2f: <TState>(
    getter: (state: TState) => Vector2,
  ): GlShaderUniform<TState, Float32Array, Float32Array> => ({
    allocateTexture: false,
    allocateValue: () => new Float32Array(2),
    readUniform: (state, value) => {
      const vector = getter(state);

      value[0] = vector.x;
      value[1] = vector.y;

      return value;
    },
    setUniform: (g, l, v) => g.uniform2fv(l, v),
  }),

  vector3f: <TState>(
    getter: (state: TState) => Vector3,
  ): GlShaderUniform<TState, Float32Array, Float32Array> => ({
    allocateTexture: false,
    allocateValue: () => new Float32Array(3),
    readUniform: (state, value) => {
      const vector = getter(state);

      value[0] = vector.x;
      value[1] = vector.y;
      value[2] = vector.z;

      return value;
    },
    setUniform: (g, l, v) => g.uniform3fv(l, v),
  }),

  vector4f: <TState>(
    getter: (state: TState) => Vector4,
  ): GlShaderUniform<TState, Float32Array, Float32Array> => ({
    allocateTexture: false,
    allocateValue: () => new Float32Array(4),
    readUniform: (state, value) => {
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

const shaderHeader = `\
#version 300 es
#ifdef GL_ES
precision highp float;
#endif
`;

export {
  type GlShader,
  type GlShaderAttribute,
  type GlShaderBinding,
  type GlShaderFunction,
  type GlShaderSnippet,
  type GlShaderTemplate,
  type GlShaderSource,
  type GlShaderVariable,
  createAttribute,
  createShader,
  createSingletonFunction,
  createUniqueTemplate,
  expandSnippet,
  shader,
  shaderCase,
  shaderLoop,
  shaderWhen,
  uniform,
};
