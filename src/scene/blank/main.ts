import { declare } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import * as software from "../../engine/graphic/software";

interface State {
  renderer: software.Renderer;
}

const prepare = async (screen: Context2DScreen) => {
  return {
    renderer: new software.Renderer(screen),
  };
};

const render = (state: State) => {
  state.renderer.clear();
};

const process = declare("Blank screen", Context2DScreen, {
  prepare,
  render,
  update: () => {},
});

export { process };
