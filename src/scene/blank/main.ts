import { type Runtime, declare, configure } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import * as software from "../../engine/graphic/software";

interface State {
  renderer: software.Renderer;
}

const runtime: Runtime<Context2DScreen, State> = {
  async prepare(screen) {
    configure(undefined); // FIXME: required to clear tweaks, should be called automatically

    return {
      renderer: new software.Renderer(screen),
    };
  },

  render(state) {
    state.renderer.clear();
  },

  resize() {},
  update() {},
};

const application = declare("Blank screen", Context2DScreen, runtime);

export { application };
