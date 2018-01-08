import * as controller from "../engine/controller";
import * as display from "../engine/display";

const container = document.getElementById("render");

if (container === null)
	throw new Error("missing screen container");

const screen2d = new display.Context2DScreen(container);
const screen3d = new display.WebGLScreen(container);
const input = new controller.Input(screen2d.canvas);

const select = (show: display.Screen) => {
	for (const hide of [screen2d, screen3d])
		hide.canvas.style.display = 'none';

	show.canvas.style.display = 'block';
};

export { input, screen2d, screen3d, select };
