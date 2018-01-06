import * as controller from "../library/controller";
import * as display from "../library/display";

const container = document.getElementById("render");

if (container === null)
	throw new Error("missing screen container");

const screen = new display.Screen(container);
const input = new controller.Input(screen.canvas);

export { input, screen };
