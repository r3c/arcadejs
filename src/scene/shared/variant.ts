import * as functional from "../../engine/language/functional";
import * as io from "../../engine/io";

const enumerate = (options: { [name: string]: boolean }) => {
	const names: string[] = [];

	for (const name in options) {
		names.push(name);
	}

	return functional.range(Math.pow(2, names.length), i =>
		names.map((name, index) => (i & Math.pow(2, index)) ? name : "").filter(name => name !== ""));
};

const index = (options: { [name: string]: boolean }) => {
	let index = 0;
	let shift = 0;

	for (const name in options) {
		index += (options[name] ? 1 : 0) << shift;
		shift += 1;
	}

	return index;
};

export { enumerate, index }