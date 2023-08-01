import {
  type Runtime,
  type Tweak,
  configure,
  declare,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { Context2DScreen } from "../../engine/graphic/display";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import * as model from "../../engine/graphic/model";
import { DrawMode, Renderer } from "../../engine/graphic/software";
import { Vector3 } from "../../engine/math/vector";
import * as view from "../view";

/*
 ** What changed?
 ** - Constant mesh data structure is now loaded from a JSON file
 ** - Mesh #1 defines per-vertex color used to interpolate face colors
 ** - Mesh #2 defines ambient map used to interpolate face texture
 ** - Method update simplified and uses shared camera code
 */

interface Configuration {
  useTexture: boolean;
}

interface State {
  camera: view.Camera;
  cubeWithColor: model.Model;
  cubeWithTexture: model.Model;
  input: Input;
  projection: Matrix4;
  renderer: Renderer;
  tweak: Tweak<Configuration>;
}

const configuration = {
  useTexture: false,
};

const runtime: Runtime<Context2DScreen, State> = {
  async prepare(screen) {
    const renderer = new Renderer(screen);
    const tweak = configure(configuration);

    return {
      camera: new view.Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      cubeWithColor: await loadModelFromJson("model/cube-color/mesh.json"),
      cubeWithTexture: await loadModelFromJson("model/cube/mesh.json"),
      input: new Input(screen.canvas),
      projection: Matrix4.createIdentity(),
      renderer: renderer,
      tweak: tweak,
    };
  },

  render(state) {
    const {
      camera,
      cubeWithColor,
      cubeWithTexture,
      projection,
      renderer,
      tweak,
    } = state;

    const view = Matrix4.createIdentity()
      .translate(camera.position)
      .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
      .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

    const model = tweak.useTexture ? cubeWithTexture : cubeWithColor;

    renderer.clear();
    renderer.draw(model, projection, view, DrawMode.Default);
  },

  resize(state, screen) {
    state.projection = Matrix4.createPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );
  },

  update(state) {
    state.camera.move(state.input);
  },
};

const application = declare("Software rendering", Context2DScreen, runtime);

export { application };
