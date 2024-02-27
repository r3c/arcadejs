import { type Application, declare } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
} from "../../engine/graphic/software";
import { Matrix4 } from "../../engine/math/matrix";

type ApplicationState = {
  renderer: SoftwareRenderer;
};

const application: Application<Context2DScreen, ApplicationState, undefined> = {
  async prepare(screen) {
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

const process = declare(
  "Blank screen",
  Context2DScreen,
  undefined,
  application
);

export { process };
