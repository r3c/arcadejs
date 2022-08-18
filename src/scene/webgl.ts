import { declare, runtime } from "../engine/application";
import * as controller from "../engine/io/controller";
import * as display from "../engine/display";
import * as load from "../engine/graphic/load";
import { Matrix4 } from "../engine/math/matrix";
import * as painter from "../engine/graphic/painters/singular";
import { Vector3 } from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/graphic/webgl";

/*
 ** What changed?
 ** - Rendering target is now a WebGL context instead of a 2D one
 ** - Shaders are defined to replace software projection and rasterization steps
 */

const vsSource = `
in vec4 colors;
in vec2 coords;
in vec4 points;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out vec4 color;
out vec2 coord;

void main(void) {
	color = colors;
	coord = coords;

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const fsSource = `
in vec4 color;
in vec2 coord;

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;

layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = color * albedoFactor * texture(albedoMap, coord);
}`;

interface SceneState {
  camera: view.Camera;
  gl: WebGLRenderingContext;
  input: controller.Input;
  mesh: webgl.Mesh;
  painter: webgl.Painter<ShaderState>;
  projectionMatrix: Matrix4;
  target: webgl.Target;
}

interface ShaderState {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

const prepare = () =>
  runtime(display.WebGLScreen, undefined, async (screen, input) => {
    const gl = screen.context;
    const shader = new webgl.Shader<ShaderState>(gl, vsSource, fsSource);

    shader.setupAttributePerGeometry("colors", (geometry) => geometry.colors);
    shader.setupAttributePerGeometry("coords", (geometry) => geometry.coords);
    shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

    shader.setupPropertyPerMaterial(
      "albedoFactor",
      (material) => material.albedoFactor,
      (gl) => gl.uniform4fv
    );
    shader.setupTexturePerMaterial(
      "albedoMap",
      undefined,
      webgl.TextureType.Quad,
      (material) => material.albedoMap
    );

    shader.setupMatrixPerNode(
      "modelMatrix",
      (state) => state.transform.toArray(),
      (gl) => gl.uniformMatrix4fv
    );
    shader.setupMatrixPerTarget(
      "projectionMatrix",
      (state) => state.projectionMatrix.toArray(),
      (gl) => gl.uniformMatrix4fv
    );
    shader.setupMatrixPerTarget(
      "viewMatrix",
      (state) => state.viewMatrix.toArray(),
      (gl) => gl.uniformMatrix4fv
    );

    return {
      camera: new view.Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      gl: gl,
      input: input,
      mesh: webgl.loadMesh(gl, await load.fromJSON("./obj/cube/mesh.json")),
      painter: new painter.Painter(shader),
      projectionMatrix: Matrix4.createIdentity(),
      screen: screen,
      target: new webgl.Target(
        screen.context,
        screen.getWidth(),
        screen.getHeight()
      ),
    };
  });

const render = (state: SceneState) => {
  const camera = state.camera;
  const gl = state.gl;
  const target = state.target;

  const viewMatrix = Matrix4.createIdentity()
    .translate(camera.position)
    .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
    .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

  const cube = {
    matrix: Matrix4.createIdentity(),
    mesh: state.mesh,
  };

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  gl.cullFace(gl.BACK);

  target.clear(0);

  state.painter.paint(target, [cube], viewMatrix, {
    projectionMatrix: state.projectionMatrix,
    viewMatrix: viewMatrix,
  });
};

const resize = (state: SceneState, screen: display.WebGLScreen) => {
  state.projectionMatrix = Matrix4.createPerspective(
    45,
    screen.getRatio(),
    0.1,
    100
  );

  state.target.resize(screen.getWidth(), screen.getHeight());
};

const update = (state: SceneState) => {
  state.camera.move(state.input);
};

const process = declare("Basic WebGL rendering", {
  prepare,
  render,
  resize,
  update,
});

export { process };
