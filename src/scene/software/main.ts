import {
  type Application,
  createSelect,
  declare,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { Context2DScreen } from "../../engine/graphic/display";
import { Mesh, loadMeshFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import {} from "../../engine/graphic/model";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
} from "../../engine/graphic/software";
import { Vector3 } from "../../engine/math/vector";
import { Camera } from "../view";

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
  input: Input;
  projection: Matrix4;
  rendererDefault: SoftwareRenderer;
  rendererWire: SoftwareRenderer;
};

const application: Application<
  Context2DScreen,
  ApplicationState,
  typeof configuration
> = {
  async prepare(screen) {
    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      cubeWithColor: await loadMeshFromJson("model/cube-color/mesh.json"),
      cubeWithTexture: await loadMeshFromJson("model/cube/mesh.json"),
      input: new Input(screen.canvas),
      projection: Matrix4.identity,
      rendererDefault: new SoftwareRenderer(screen, SoftwareDrawMode.Default),
      rendererWire: new SoftwareRenderer(screen, SoftwareDrawMode.Wire),
    };
  },

  render(state, tweak) {
    const {
      camera,
      cubeWithColor,
      cubeWithTexture,
      projection,
      rendererDefault,
      rendererWire,
    } = state;

    const view = Matrix4.fromSource(
      Matrix4.identity,
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    const mesh = tweak.renderMode === 2 ? cubeWithTexture : cubeWithColor;
    const renderer = tweak.renderMode === 0 ? rendererWire : rendererDefault;

    renderer.render({
      objects: [{ matrix: Matrix4.identity, mesh }],
      state: { projection, view },
    });
  },

  resize(state, _, size) {
    state.projection = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);
  },

  update(state, _, dt) {
    state.camera.move(state.input, dt);
  },
};

const process = declare(
  "Software rendering",
  Context2DScreen,
  configuration,
  application
);

export { process };
