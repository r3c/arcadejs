import * as controller from "../library/controller";
import * as display from "../library/display";

const screen = new display.Screen(document);
const input = new controller.Input(screen.canvas);

export { input, screen };
