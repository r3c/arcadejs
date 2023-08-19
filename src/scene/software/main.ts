import {
  type Application,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { Context2DScreen } from "../../engine/graphic/display";
import { Model, loadModelFromJson } from "../../engine/graphic/model";
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
  useTexture: false,
  useWire: false,
};

type ApplicationState = {
  camera: Camera;
  cubeWithColor: Model;
  cubeWithTexture: Model;
  input: Input;
  projection: Matrix4;
  rendererDefault: SoftwareRenderer;
  rendererWire: SoftwareRenderer;
  tweak: Tweak<typeof configuration>;
};

const application: Application<Context2DScreen, ApplicationState> = {
  async prepare(screen) {
    const tweak = configure(configuration);

    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      cubeWithColor: await loadModelFromJson("model/cube-color/mesh.json"),
      cubeWithTexture: await loadModelFromJson("model/cube/mesh.json"),
      input: new Input(screen.canvas),
      projection: Matrix4.identity,
      rendererDefault: new SoftwareRenderer(screen, SoftwareDrawMode.Default),
      rendererWire: new SoftwareRenderer(screen, SoftwareDrawMode.Wire),
      tweak,
    };
  },

  render(state) {
    const {
      camera,
      cubeWithColor,
      cubeWithTexture,
      projection,
      rendererDefault,
      rendererWire,
      tweak,
    } = state;

    const view = Matrix4.fromCustom(
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    const model = tweak.useTexture ? cubeWithTexture : cubeWithColor;
    const renderer = tweak.useWire ? rendererWire : rendererDefault;

    renderer.render({
      objects: [{ matrix: Matrix4.identity, model }],
      state: { projection, view },
    });
  },

  resize(state, screen) {
    state.projection = Matrix4.fromPerspective(45, screen.getRatio(), 0.1, 100);
  },

  update(state) {
    state.camera.move(state.input);
  },
};

const process = declare("Software rendering", Context2DScreen, application);

export { process };
