import * as screen from "../library/screen";

const tick = () => {
	const context = screen.context;

	context.fillStyle = 'red';
	context.fillRect(0, 0, screen.width, screen.height);
};

export { tick };
