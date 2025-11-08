import { type Application, declare } from "../../engine/application";
import { type Screen, createCanvasScreen } from "../../engine/graphic/screen";
import {
  SoftwareDrawMode,
  createSoftwareRenderer,
} from "../../engine/graphic/renderer";
import { Matrix4 } from "../../engine/math/matrix";

const createApplication = async (
  screen: Screen<CanvasRenderingContext2D>
): Promise<Application<unknown>> => {
  const context = screen.getContext();
  const renderer = createSoftwareRenderer(SoftwareDrawMode.Default);
  const scene = {
    projection: Matrix4.identity,
    view: Matrix4.identity,
  };

  return {
    async setConfiguration() {},

    release() {},

    render() {
      renderer.render(context, scene);
    },

    setSize() {},
    update() {},
  };
};

const process = declare(
  "Blank screen",
  createCanvasScreen,
  createApplication,
  {}
);

export { process };
