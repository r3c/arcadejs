const mapOptional = <TInput, TOutput>(
  optional: TInput | undefined,
  converter: (input: TInput) => TOutput
) => {
  return optional !== undefined ? converter(optional) : undefined;
};

export { mapOptional };
