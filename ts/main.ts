import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_test";

var current: number | undefined;

const handlers = {
	49: s01.tick,
	50: s02.tick,
	51: s03.tick
};

const setup = (handler: (dt: number) => void) => {
	if (current !== undefined)
		clearInterval(current);

	let last = new Date().getTime();

	current = setInterval(() => {
		const now = new Date().getTime();

		handler(now - last);

		last = now;
	}, 30);
};

document.addEventListener("keyup", (event: KeyboardEvent) => {
	const handler = (<any>handlers)[event.keyCode];

	if (handler === undefined)
		return;

	setup(handler);
});

setup(s01.tick);
