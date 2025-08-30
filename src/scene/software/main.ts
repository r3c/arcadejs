import {
  type Application,
  ApplicationConfigurator,
  createSelect,
  declare,
} from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { Context2DScreen } from "../../engine/graphic/display";
import { Mesh, loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import {} from "../../engine/graphic/mesh";
import { Vector2 } from "../../engine/math/vector";
import { Camera, createOrbitCamera } from "../../engine/stage/camera";
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

const configuration = {
  renderMode: createSelect("render", ["Wire", "Color", "Texture"], 1),
};

type ApplicationState = {
  camera: Camera;
  cubeWithColor: Mesh;
  cubeWithTexture: Mesh;
  projection: Matrix4;
  renderer: SoftwareRenderer | undefined;
  screen: Context2DScreen;
};

const application: Application<
  Context2DScreen,
  ApplicationState,
  typeof configuration extends ApplicationConfigurator<infer T> ? T : never
> = {
  async create(screen) {
    const input = new Input(screen.canvas);

    return {
      camera: createOrbitCamera(
        {
          getRotate: () => input.fetchMove(Pointer.Grab),
          getMove: () => input.fetchMove(Pointer.Drag),
          getZoom: () => input.fetchZoom(),
        },
        { x: 0, y: 0, z: -5 },
        Vector2.zero
      ),
      cubeWithColor: await loadMeshFromJson("model/cube-color/mesh.json"),
      cubeWithTexture: await loadMeshFromJson("model/cube/mesh.json"),
      projection: Matrix4.identity,
      renderer: undefined,
      screen,
    };
  },

  async change(state, configuration) {
    const { renderMode } = configuration;

    const mesh = renderMode === 2 ? state.cubeWithTexture : state.cubeWithColor;
    const renderer = createSoftwareRenderer(
      state.screen,
      renderMode === 0 ? SoftwareDrawMode.Wire : SoftwareDrawMode.Default
    );

    renderer.register({ mesh });

    state.renderer = renderer;
  },

  render(state) {
    const { camera, projection, renderer } = state;

    renderer?.render({
      projection,
      view: camera.viewMatrix,
    });
  },

  resize(state, size) {
    state.projection = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);
  },

  update(state, dt) {
    const { camera } = state;

    camera.update(dt);
  },
};

const process = declare(
  "Software rendering",
  Context2DScreen,
  configuration,
  application
);

export { process };
