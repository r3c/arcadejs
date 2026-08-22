import { type Application, declare } from "../../engine/application";
import { type Screen, createCanvasScreen } from "../../engine/graphic/screen";
import {
  SoftwareDrawMode,
  createSoftwareRenderer,
} from "../../engine/graphic/renderer";
import { Releasable } from "../../engine/io/resource";
import { Matrix4 } from "../../engine/math/matrix";

const createApplication = async (
  screen: Screen<CanvasRenderingContext2D>,
): Promise<Application<unknown, Releasable>> => {
  const context = screen.getContext();
  const renderer = createSoftwareRenderer(SoftwareDrawMode.Default);
  const scene = {
    projection: Matrix4.identity,
    view: Matrix4.identity,
  };

  return {
    async configure() {
      return { release: () => {} };
    },

    release() {},

    render() {
      renderer.render(context, scene);
    },

    resize() {},
    update() {},
  };
};

const process = declare(
  "Blank screen",
  createCanvasScreen,
  createApplication,
  {},
);

export { process };
