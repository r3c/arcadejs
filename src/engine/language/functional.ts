const coalesce = <T>(optional: T | undefined, fallback: T) => optional !== undefined ? optional : fallback;
const flatten = <T>(items: T[][]) => new Array<T>().concat(...items);

const map = <T, U>(optional: T | undefined, converter: (input: T) => U) => {
	return optional !== undefined ? converter(optional) : undefined;
};

const range = <T>(length: number, generator: (index: number) => T) => {
	return new Array(length).fill(0).map((value, index) => generator(index));
};

export { coalesce, flatten, map, range }
