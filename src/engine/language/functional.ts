const map = <TInput, TOutput>(
  optional: TInput | undefined,
  converter: (input: TInput) => TOutput
) => {
  return optional !== undefined ? converter(optional) : undefined;
};

const range = <TValue>(
  length: number,
  generator: (index: number) => TValue
) => {
  return new Array(length).fill(0).map((_, index) => generator(index));
};

export { map, range };
