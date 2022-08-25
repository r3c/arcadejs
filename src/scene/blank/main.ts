import { declare, runtime } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import * as software from "../../engine/graphic/software";

interface State {
  renderer: software.Renderer;
}

const prepare = () =>
  runtime(Context2DScreen, undefined, async (screen) => ({
    renderer: new software.Renderer(screen),
  }));

const render = (state: State) => {
  state.renderer.clear();
};

const process = declare("Blank screen", {
  prepare,
  render,
  update: () => {},
});

export { process };
