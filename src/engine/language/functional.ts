const map = <T, U>(optional: T | undefined, converter: (input: T) => U) => {
  return optional !== undefined ? converter(optional) : undefined;
};

const range = <T>(length: number, generator: (index: number) => T) => {
  return new Array(length).fill(0).map((_, index) => generator(index));
};

export { map, range };
