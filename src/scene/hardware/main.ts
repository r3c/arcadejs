import { type Application, declare, configure } from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import * as painter from "../../engine/graphic/webgl/painters/singular";
import { Vector3 } from "../../engine/math/vector";
import * as view from "../view";
import * as webgl from "../../engine/graphic/webgl";

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
  input: Input;
  model: webgl.GlModel;
  painter: webgl.GlPainter<ShaderState>;
  projectionMatrix: Matrix4;
  target: webgl.GlTarget;
}

interface ShaderState {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

const application: Application<WebGLScreen, SceneState> = {
  async prepare(screen) {
    configure(undefined); // FIXME: required to clear tweaks, should be called automatically

    const gl = screen.context;
    const shader = new webgl.GlShader<ShaderState>(gl, vsSource, fsSource);

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
      webgl.GlTextureType.Quad,
      (material) => material.albedoMap
    );

    shader.setupMatrix4PerNode("modelMatrix", (state) => state.modelMatrix);
    shader.setupMatrix4PerTarget(
      "projectionMatrix",
      (state) => state.projectionMatrix
    );
    shader.setupMatrix4PerTarget("viewMatrix", (state) => state.viewMatrix);

    return {
      camera: new view.Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      gl: gl,
      input: new Input(screen.canvas),
      model: webgl.loadModel(
        gl,
        await loadModelFromJson("model/cube/mesh.json")
      ),
      painter: new painter.SingularPainter(shader),
      projectionMatrix: Matrix4.createIdentity(),
      screen: screen,
      target: new webgl.GlTarget(
        screen.context,
        screen.getWidth(),
        screen.getHeight()
      ),
    };
  },

  render(state) {
    const { camera, gl, model, painter, projectionMatrix, target } = state;

    const viewMatrix = Matrix4.createIdentity()
      .translate(camera.position)
      .rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
      .rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y);

    const cube = {
      matrix: Matrix4.createIdentity(),
      model,
    };

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.cullFace(gl.BACK);

    target.clear(0);

    painter.paint(target, [cube], viewMatrix, {
      projectionMatrix: projectionMatrix,
      viewMatrix: viewMatrix,
    });
  },

  resize(state, screen) {
    state.projectionMatrix = Matrix4.createPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );

    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state) {
    state.camera.move(state.input);
  },
};

const process = declare("Basic hardware rendering", WebGLScreen, application);

export { process };
