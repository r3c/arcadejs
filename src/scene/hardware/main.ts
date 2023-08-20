import { type Application, declare, configure } from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { loadModelFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import { Camera } from "../view";
import {
  GlModel,
  GlPainter,
  GlTarget,
  runtimeCreate,
  loadModel,
  GlMaterial,
  GlGeometry,
} from "../../engine/graphic/webgl";
import { BatchPainter } from "../../engine/graphic/webgl/painters/batch";
import { GlPolygon } from "../../engine/graphic/webgl/renderers/objects/polygon";
import { shaderUniform } from "../../engine/graphic/webgl/shader";
import { SingularScene } from "../../engine/graphic/webgl/painters/singular";

/*
 ** What changed?
 ** - Rendering target is now a WebGL context instead of a 2D one
 ** - Shaders are defined to replace software projection and rasterization steps
 */

const vsSource = `
in vec2 coordinate;
in vec4 position;
in vec4 tint;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out vec2 fragCoordinate;
out vec4 fragTint;

void main(void) {
	fragCoordinate = coordinate;
	fragTint = tint;

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * position;
}`;

const fsSource = `
in vec2 fragCoordinate;
in vec4 fragTint;

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;

layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = fragTint * albedoFactor * texture(albedoMap, fragCoordinate);
}`;

type ApplicationState = {
  camera: Camera;
  gl: WebGLRenderingContext;
  input: Input;
  model: GlModel<GlPolygon>;
  painter: GlPainter<SingularScene<SceneState, GlPolygon>>;
  projectionMatrix: Matrix4;
  target: GlTarget;
};

type SceneState = {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const configuration = {
  useTexture: true,
};

const application: Application<WebGLScreen, ApplicationState> = {
  async prepare(screen) {
    const runtime = runtimeCreate(screen.context);
    const shader = runtime.shader(vsSource, fsSource, {});
    const tweak = configure(configuration);

    const geometryBinding = shader.declare<GlGeometry>();

    geometryBinding.setUniform(
      "modelMatrix",
      shaderUniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
    );

    const polygonBinding = shader.declare<GlPolygon>();

    polygonBinding.setAttribute("coordinate", ({ coordinate }) => coordinate);
    polygonBinding.setAttribute("position", ({ position }) => position);
    polygonBinding.setAttribute("tint", ({ tint }) => tint);

    const materialBinding = shader.declare<GlMaterial>();

    materialBinding.setUniform(
      "albedoFactor",
      shaderUniform.numberArray4(({ albedoFactor }) => albedoFactor)
    );
    materialBinding.setUniform(
      "albedoMap",
      shaderUniform.whiteQuadTexture(({ albedoMap }) =>
        tweak.useTexture ? albedoMap : undefined
      )
    );

    const sceneBinding = shader.declare<SceneState>();

    sceneBinding.setUniform(
      "projectionMatrix",
      shaderUniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      shaderUniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
    );

    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      gl: runtime.context,
      input: new Input(screen.canvas),
      model: loadModel(
        runtime,
        await loadModelFromJson("model/cube/mesh.json")
      ),
      painter: new BatchPainter(
        sceneBinding,
        geometryBinding,
        materialBinding,
        polygonBinding
      ),
      projectionMatrix: Matrix4.identity,
      screen,
      target: new GlTarget(
        screen.context,
        screen.getWidth(),
        screen.getHeight()
      ),
    };
  },

  render(state) {
    const { camera, gl, model, painter, projectionMatrix, target } = state;

    const viewMatrix = Matrix4.fromCustom(
      ["translate", camera.position],
      ["rotate", { x: 1, y: 0, z: 0 }, camera.rotation.x],
      ["rotate", { x: 0, y: 1, z: 0 }, camera.rotation.y]
    );

    const cube = {
      matrix: Matrix4.identity,
      model,
      state: undefined,
    };

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.cullFace(gl.BACK);

    target.clear(0);

    painter.paint(target, {
      objects: [cube],
      state: {
        projectionMatrix,
        viewMatrix,
      },
      viewMatrix,
    });
  },

  resize(state, screen) {
    state.projectionMatrix = Matrix4.fromPerspective(
      45,
      screen.getRatio(),
      0.1,
      100
    );

    state.target.resize(screen.getWidth(), screen.getHeight());
  },

  update(state, dt) {
    state.camera.move(state.input, dt);
  },
};

const process = declare("Basic hardware rendering", WebGLScreen, application);

export { process };
