import * as screen from "../library/screen";

let tick = () => {
	let context = screen.context;

	context.fillStyle = 'red';
	context.fillRect(0, 0, screen.width, screen.height);
};

export { tick };
