import * as display from "../library/display";
import * as shared from "./shared";

const tick = () => {
	const context = shared.screen.context;

	context.fillStyle = 'red';
	context.fillRect(0, 0, shared.screen.getWidth(), shared.screen.getHeight());
};

export { tick };
