import { type Application, declare } from "../../engine/application";
import { Context2DScreen } from "../../engine/graphic/display";
import { Matrix4 } from "../../engine/math/matrix";
import { convertMesh } from "../mesh";
import { Mesh } from "../../engine/graphic/model";
import {
  SoftwareDrawMode,
  SoftwareRenderer,
} from "../../engine/graphic/software";
import { Vector3 } from "../../engine/math/vector";
import { Input } from "../../engine/io/controller";
import { Camera } from "../view";

/*
 ** What changed?
 ** - New "camera" property in state to hold current camera position/rotation
 ** - New "input" instance referenced to read mouse position and button presses
 ** - Method "update" change camera properties depending on input
 ** - Manually modified cube positions replaced by constant structure
 ** - Model loading is done only once instead of once per draw iteration
 */

interface State {
  camera: Camera;
  cube: Mesh;
  input: Input;
  projection: Matrix4;
  renderer: SoftwareRenderer;
}

const cube = convertMesh({
  positions: [
    { x: -1, y: 1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: -1, y: -1, z: -1 },
    { x: -1, y: 1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: -1, y: -1, z: 1 },
  ],
  indices: [
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
  ],
});

const application: Application<Context2DScreen, State, undefined> = {
  async prepare(screen) {
    const renderer = new SoftwareRenderer(screen, SoftwareDrawMode.Wire);

    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      cube,
      input: new Input(screen.canvas),
      projection: Matrix4.identity,
      renderer,
    };
  },

  render(state) {
    const { camera, cube, projection, renderer } = state;

    const view = Matrix4.fromSource(
      Matrix4.identity,
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    renderer.render({
      objects: [{ matrix: Matrix4.identity, mesh: cube }],
      state: { projection: projection, view },
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

  update(state, _, dt) {
    state.camera.move(state.input, dt);
  },
};

const process = declare(
  "Matrix composition",
  Context2DScreen,
  undefined,
  application
);

export { process };
