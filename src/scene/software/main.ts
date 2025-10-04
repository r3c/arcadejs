import {
  type Application,
  ApplicationConfigurator,
  createSelect,
  declare,
} from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { Context2DScreen } from "../../engine/graphic/screen";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import {} from "../../engine/graphic/mesh";
import { Vector2 } from "../../engine/math/vector";
import { createOrbitCamera } from "../../engine/stage/camera";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
  createSoftwareRenderer,
} from "../../engine/graphic/renderer";

/*
 ** What changed?
 ** - Constant mesh data structure is now loaded from a JSON file
 ** - Mesh #1 defines per-vertex color used to interpolate face colors
 ** - Mesh #2 defines ambient map used to interpolate face texture
 ** - Method update simplified and uses shared camera code
 */

const configurator = {
  mode: createSelect("render", ["Wire", "Color", "Texture"], 1),
};

type Configuration = typeof configurator extends ApplicationConfigurator<
  infer T
>
  ? T
  : never;

const applicationBuilder = async (
  screen: Context2DScreen
): Promise<Application<Configuration>> => {
  const input = new Input(screen.canvas);
  const camera = createOrbitCamera(
    {
      getRotate: () => input.fetchMove(Pointer.Grab),
      getMove: () => input.fetchMove(Pointer.Drag),
      getZoom: () => input.fetchZoom(),
    },
    { x: 0, y: 0, z: -5 },
    Vector2.zero
  );
  const cubeWithColor = await loadMeshFromJson("model/cube-color/mesh.json");
  const cubeWithTexture = await loadMeshFromJson("model/cube/mesh.json");
  const projection = Matrix4.fromIdentity();

  let renderer: SoftwareRenderer | undefined = undefined;

  return {
    async change(configuration) {
      const { mode } = configuration;
      const mesh = mode === 2 ? cubeWithTexture : cubeWithColor;

      renderer = createSoftwareRenderer(
        mode === 0 ? SoftwareDrawMode.Wire : SoftwareDrawMode.Default
      );

      renderer.append({ mesh });
    },

    release() {},

    render() {
      renderer?.render(screen, {
        projection,
        view: camera.viewMatrix,
      });
    },

    resize(size) {
      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
      renderer?.resize(size);
    },

    update(dt) {
      camera.update(dt);
    },
  };
};

const process = declare(
  "Software rendering",
  Context2DScreen,
  applicationBuilder,
  configurator
);

export { process };
