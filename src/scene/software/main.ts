import {
  type Application,
  ApplicationConfigurator,
  createSelect,
  declare,
} from "../../engine/application";
import { Gamepad, Pointer } from "../../engine/io/gamepad";
import { createCanvasScreen, Screen } from "../../engine/graphic/screen";
import { Releasable } from "../../engine/io/resource";
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
  mode: createSelect("Pencil Mode", ["Wire", "Color", "Texture"], 1),
};

type Configuration =
  typeof configurator extends ApplicationConfigurator<infer T> ? T : never;

type State = Releasable & {
  renderer: SoftwareRenderer;
};

const createApplication = async (
  screen: Screen<CanvasRenderingContext2D>,
  gamepad: Gamepad,
): Promise<Application<Configuration, State>> => {
  const camera = createOrbitCamera(
    {
      getRotate: () => gamepad.fetchMove(Pointer.Grab),
      getMove: () => gamepad.fetchMove(Pointer.Drag),
      getZoom: () => gamepad.fetchZoom(),
    },
    { x: 0, y: 0, z: -5 },
    Vector2.zero,
  );
  const context = screen.getContext();
  const cubeWithColor = await loadMeshFromJson("model/cube-color/mesh.json");
  const cubeWithTexture = await loadMeshFromJson("model/cube/mesh.json");
  const projection = Matrix4.fromIdentity();

  return {
    async configure(configuration) {
      const { mode } = configuration;
      const mesh = mode === 2 ? cubeWithTexture : cubeWithColor;
      const drawMode =
        mode === 0 ? SoftwareDrawMode.Wire : SoftwareDrawMode.Default;
      const renderer = createSoftwareRenderer(drawMode);

      renderer.addSubject({ mesh });
      renderer.setSize(screen.getSize());

      return {
        renderer,
        release: () => {},
      };
    },

    release() {},

    render(state) {
      state.renderer.render(context, {
        projection,
        view: camera.viewMatrix,
      });
    },

    resize(state, size) {
      state.renderer.setSize(size);

      projection.setFromPerspective(Math.PI / 4, size.x / size.y, 0.1, 100);
    },

    update(_state, dt) {
      camera.update(dt);
    },
  };
};

const process = declare(
  "Software rendering",
  createCanvasScreen,
  createApplication,
  configurator,
);

export { process };
