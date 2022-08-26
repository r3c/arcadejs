import { type Application, declare } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import * as software from "../../engine/graphic/software";

interface State {
  renderer: software.Renderer;
}

const application: Application<Context2DScreen, State> = {
  async prepare(screen) {
    return {
      renderer: new software.Renderer(screen),
    };
  },

  render(state) {
    state.renderer.clear();
  },

  update() {},
};

const process = declare("Blank screen", Context2DScreen, application);

export { process };
