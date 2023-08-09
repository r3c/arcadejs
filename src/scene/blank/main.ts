import { type Application, declare, configure } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
} from "../../engine/graphic/software";
import { Matrix4 } from "../../engine/math/matrix";

interface State {
  renderer: SoftwareRenderer;
}

const application: Application<Context2DScreen, State> = {
  async prepare(screen) {
    configure(undefined); // FIXME: required to clear tweaks, should be called automatically

    return {
      renderer: new SoftwareRenderer(screen, SoftwareDrawMode.Default),
    };
  },

  render(state) {
    state.renderer.render({
      objects: [],
      state: { projection: Matrix4.identity, view: Matrix4.identity },
    });
  },

  resize() {},
  update() {},
};

const process = declare("Blank screen", Context2DScreen, application);

export { process };
