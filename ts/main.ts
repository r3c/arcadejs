import * as s01 from "./scene/s01_cpu";
import * as s02 from "./scene/s02_test";

var current: number | undefined;

let handlers = {
	49: s01.tick,
	50: s02.tick
};

let setup = (handler: () => void) => {
	if (current !== undefined)
		clearInterval(current);

	current = setInterval(handler, 30);
};

document.addEventListener("keyup", (event: KeyboardEvent) => {
	let handler = (<any>handlers)[event.keyCode];

	if (handler === undefined)
		return;

	setup(handler);
});

setup(s01.tick);
