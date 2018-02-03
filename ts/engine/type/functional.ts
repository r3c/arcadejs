const coalesce = <T>(optional: T | undefined, fallback: T) => optional !== undefined ? optional : fallback;
const flatten = <T>(items: T[][]) => new Array<T>().concat(...items);
const map = <T, U>(optional: T | undefined, converter: (input: T) => U) => optional !== undefined ? converter(optional) : undefined;

export { coalesce, flatten, map }
