import * as controller from "../engine/controller";
import * as display from "../engine/display";

const container = document.getElementById("render");

if (container === null)
	throw new Error("missing screen container");

const screen = new display.Screen(container);
const input = new controller.Input(screen.canvas);

export { input, screen };
