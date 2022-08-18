import * as application from "../engine/application";
import * as display from "../engine/display";
import * as software from "../engine/graphic/software";

interface State {
  renderer: software.Renderer;
}

const prepare = () =>
  application.runtime(display.Context2DScreen, undefined, async (screen) => ({
    renderer: new software.Renderer(screen),
  }));

const render = (state: State) => {
  state.renderer.clear();
};

const process = application.declare("Blank screen", {
  prepare,
  render,
});

export { process };
