import * as functional from "../../engine/language/functional";
import * as io from "../../engine/io";

const enumerate = (flags: boolean[]) => {
	return functional.range(Math.pow(2, flags.length), i => flags.map((flag, index) => (i & Math.pow(2, index)) !== 0));
};

const index = (flags: boolean[]) => {
	let index = 0;
	let shift = 0;

	for (const flag of flags) {
		index += (flag ? 1 : 0) << shift;
		shift += 1;
	}

	return index;
};

export { enumerate, index }