import { type Application, declare } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/screen";
import {
  SoftwareDrawMode,
  createSoftwareRenderer,
} from "../../engine/graphic/renderer";
import { Matrix4 } from "../../engine/math/matrix";

const applicationBuilder = async (
  screen: Context2DScreen
): Promise<Application<unknown>> => {
  const renderer = createSoftwareRenderer(screen, SoftwareDrawMode.Default);
  const scene = {
    projection: Matrix4.identity,
    view: Matrix4.identity,
  };

  return {
    async change() {},

    dispose() {},

    render() {
      renderer.render(scene);
    },

    resize() {},
    update() {},
  };
};

const process = declare(
  "Blank screen",
  Context2DScreen,
  applicationBuilder,
  {}
);

export { process };
