import { declare, runtime } from "../../engine/application";
import * as display from "../../engine/display";
import * as software from "../../engine/graphic/software";

interface State {
  renderer: software.Renderer;
}

const prepare = () =>
  runtime(display.Context2DScreen, undefined, async (screen) => ({
    renderer: new software.Renderer(screen),
  }));

const render = (state: State) => {
  state.renderer.clear();
};

const process = declare("Blank screen", {
  prepare,
  render,
});

export { process };
