import * as display from "../library/display";

const tick = () => {
	const context = display.context;

	context.fillStyle = 'red';
	context.fillRect(0, 0, display.width, display.height);
};

export { tick };
