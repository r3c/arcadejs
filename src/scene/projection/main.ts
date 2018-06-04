import { type Application, declare } from "../../engine/application";
import { Matrix4 } from "../../engine/math/matrix";
import { convertMesh } from "../mesh";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
} from "../../engine/graphic/software";
import { Context2DScreen } from "../../engine/graphic/display";

interface State {
  projection: Matrix4;
  renderer: SoftwareRenderer;
}

const application: Application<Context2DScreen, State, undefined> = {
  async prepare(screen) {
    return {
      projection: Matrix4.identity,
      renderer: new SoftwareRenderer(screen, SoftwareDrawMode.Wire),
    };
  },

  render(state) {
    const { projection, renderer } = state;
    const distance = -5;

    const positions = [
      { x: -1, y: 1, z: distance - 1 },
      { x: 1, y: 1, z: distance - 1 },
      { x: 1, y: -1, z: distance - 1 },
      { x: -1, y: -1, z: distance - 1 },
      { x: -1, y: 1, z: distance + 1 },
      { x: 1, y: 1, z: distance + 1 },
      { x: 1, y: -1, z: distance + 1 },
      { x: -1, y: -1, z: distance + 1 },
    ];

    const indices = [
      { x: 0, y: 1, z: 2 },
      { x: 2, y: 3, z: 0 },
      { x: 4, y: 5, z: 6 },
      { x: 6, y: 7, z: 4 },
      { x: 0, y: 3, z: 7 },
      { x: 7, y: 4, z: 0 },
      { x: 1, y: 2, z: 6 },
      { x: 6, y: 5, z: 1 },
      { x: 0, y: 1, z: 5 },
      { x: 5, y: 4, z: 0 },
      { x: 2, y: 3, z: 7 },
      { x: 7, y: 6, z: 2 },
    ];

    const mesh = convertMesh({ indices, positions });

    renderer.render({
      objects: [{ matrix: Matrix4.identity, mesh }],
      state: { projection, view: Matrix4.identity },
    });
  },

  resize(state, _, size) {
    state.projection = Matrix4.fromIdentity([
      "setPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);
  },

  update() {},
};

const process = declare(
  "Projection to screen",
  Context2DScreen,
  undefined,
  application
);

export { process };
