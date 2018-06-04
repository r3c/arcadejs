import {
  type Application,
  declare,
  createCheckbox,
} from "../../engine/application";
import { Input } from "../../engine/io/controller";
import { WebGLScreen } from "../../engine/graphic/display";
import { loadMeshFromJson } from "../../engine/graphic/model";
import { Matrix4 } from "../../engine/math/matrix";
import { Vector3 } from "../../engine/math/vector";
import { Camera } from "../view";
import {
  GlGeometry,
  GlPainter,
  GlTarget,
  createRuntime,
} from "../../engine/graphic/webgl";
import {
  ObjectScene,
  createObjectPainter,
} from "../../engine/graphic/webgl/painters/object";
import { shaderUniform } from "../../engine/graphic/webgl/shader";
import {
  GlModel,
  GlPolygon,
  GlMaterial,
  createModel,
} from "../../engine/graphic/webgl/model";

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
  model: GlModel;
  painters: {
    texture: GlPainter<Scene>;
    tint: GlPainter<Scene>;
  };
  projectionMatrix: Matrix4;
  target: GlTarget;
};

type Scene = ObjectScene & {
  projectionMatrix: Matrix4;
};

const configuration = {
  useTexture: createCheckbox("texture", true),
};

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration
> = {
  async prepare(screen) {
    const gl = screen.context;
    const runtime = createRuntime(gl);
    const shader = runtime.createShader(vsSource, fsSource, {});

    const geometryBinding = shader.declare<GlGeometry>();

    geometryBinding.setUniform(
      "modelMatrix",
      shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
    );

    const polygonBinding = shader.declare<GlPolygon>();

    polygonBinding.setAttribute("coordinate", ({ coordinate }) => coordinate);
    polygonBinding.setAttribute("position", ({ position }) => position);
    polygonBinding.setAttribute("tint", ({ tint }) => tint);

    const textureMaterialBinding = shader.declare<GlMaterial>();

    textureMaterialBinding.setUniform(
      "albedoFactor",
      shaderUniform.vector4f(({ diffuseColor }) => diffuseColor)
    );
    textureMaterialBinding.setUniform(
      "albedoMap",
      shaderUniform.tex2dWhite(({ diffuseMap }) => diffuseMap)
    );

    const tintMaterialBinding = shader.declare<GlMaterial>();

    tintMaterialBinding.setUniform(
      "albedoFactor",
      shaderUniform.vector4f(({ diffuseColor }) => diffuseColor)
    );
    tintMaterialBinding.setUniform(
      "albedoMap",
      shaderUniform.tex2dWhite(() => undefined)
    );

    const sceneBinding = shader.declare<Scene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
    );

    return {
      camera: new Camera({ x: 0, y: 0, z: -5 }, Vector3.zero),
      gl,
      input: new Input(screen.canvas),
      model: createModel(gl, await loadMeshFromJson("model/cube/mesh.json")),
      painters: {
        texture: createObjectPainter(
          sceneBinding,
          geometryBinding,
          textureMaterialBinding,
          polygonBinding
        ),
        tint: createObjectPainter(
          sceneBinding,
          geometryBinding,
          tintMaterialBinding,
          polygonBinding
        ),
      },
      projectionMatrix: Matrix4.identity,
      screen,
      target: new GlTarget(gl, screen.getSize()),
    };
  },

  render(state, tweak) {
    const { camera, gl, model, painters, projectionMatrix, target } = state;

    const viewMatrix = Matrix4.fromSource(
      Matrix4.identity,
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

    const painter = tweak.useTexture ? painters.texture : painters.tint;

    painter.paint(target, {
      objects: [cube],
      projectionMatrix,
      viewMatrix,
    });
  },

  resize(state, _, size) {
    state.projectionMatrix = Matrix4.fromIdentity([
      "setPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);

    state.target.resize(size);
  },

  update(state, _, dt) {
    state.camera.move(state.input, dt);
  },
};

const process = declare(
  "Basic hardware rendering",
  WebGLScreen,
  configuration,
  application
);

export { process };
