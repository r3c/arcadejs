import { type Application, declare } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
  createSoftwareRenderer,
} from "../../engine/graphic/renderer";
import { Matrix4 } from "../../engine/math/matrix";

type ApplicationState = {
  renderer: SoftwareRenderer;
};

const application: Application<Context2DScreen, ApplicationState, object> = {
  async create(screen) {
    return {
      renderer: createSoftwareRenderer(screen, SoftwareDrawMode.Default),
    };
  },

  async change() {},

  render(state) {
    state.renderer.render({
      projection: Matrix4.identity,
      view: Matrix4.identity,
    });
  },

  resize() {},
  update() {},
};

const process = declare("Blank screen", Context2DScreen, {}, application);

export { process };
