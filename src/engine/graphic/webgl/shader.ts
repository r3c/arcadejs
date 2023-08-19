type GlShaderFunction<TArguments extends any[]> = {
  declare: () => string;
  invoke: (...args: TArguments) => string;
};

export { type GlShaderFunction };
