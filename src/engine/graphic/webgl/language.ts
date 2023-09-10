type GlShaderFunction<TDeclare extends string[], TInvoke extends any[]> = {
  declare: (...args: TDeclare) => string;
  invoke: (...args: TInvoke) => string;
};

export { type GlShaderFunction };
