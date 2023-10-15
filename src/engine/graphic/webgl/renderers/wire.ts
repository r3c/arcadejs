import { range } from "../../../language/iterable";
import { Matrix4 } from "../../../math/matrix";
import { Vector3 } from "../../../math/vector";
import { Renderer } from "../../display";
import { Mesh, Polygon, flattenMesh } from "../../model";
import { GlPainter, GlRuntime, GlTarget } from "../../webgl";
import { WirePainter } from "../painters/wire";
import {
  GlBuffer,
  createStaticArrayBuffer,
  createStaticIndexBuffer,
} from "../resource";
import {
  GlShader,
  GlShaderAttribute,
  createAttribute,
  shaderUniform,
} from "../shader";

type WireModel = {
  index: GlBuffer;
  position: GlShaderAttribute;
  tint: GlShaderAttribute;
};

type WireObject = {
  modelMatrix: Matrix4;
  wireModel: WireModel;
};

type WireScene = {
  objects: Iterable<WireObject>;
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const createWirePainter = (shader: GlShader): GlPainter<WireScene> => {
  const sceneBinding = shader.declare<WireScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );

  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  const wireBinding = shader.declare<WireObject>();

  wireBinding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );

  wireBinding.setAttribute("position", ({ wireModel }) => wireModel.position);
  wireBinding.setAttribute("tint", ({ wireModel }) => wireModel.tint);

  return new WirePainter(
    sceneBinding,
    wireBinding,
    ({ wireModel }) => wireModel.index
  );
};

const extractMeshNormals = (
  gl: WebGL2RenderingContext,
  mesh: Mesh,
  lineLength: number
): WireModel =>
  extractLines(
    gl,
    mesh,
    (polygon) => polygon.normals,
    (n) => Vector3.fromSource(n, ["normalize"], ["scale", lineLength]),
    () => ({ x: 0, y: 1, z: 0 })
  );

const extractMeshTangents = (
  gl: WebGL2RenderingContext,
  mesh: Mesh,
  lineLength: number
): WireModel =>
  extractLines(
    gl,
    mesh,
    (polygon) => polygon.tangents,
    (t) => Vector3.fromSource(t, ["normalize"], ["scale", lineLength]),
    () => ({ x: 1, y: 0, z: 0 })
  );

const extractLines = (
  gl: WebGL2RenderingContext,
  mesh: Mesh,
  extractor: (polygon: Polygon) => Vector3[] | undefined,
  wireLength: (input: Vector3) => Vector3,
  wireTint: (input: Vector3) => Vector3
): WireModel => {
  const index = createStaticIndexBuffer(gl, Uint32Array);
  const positionBuffer = createStaticArrayBuffer(gl, Float32Array);
  const position = createAttribute(positionBuffer, 3);
  const tintBuffer = createStaticArrayBuffer(gl, Float32Array);
  const tint = createAttribute(tintBuffer, 3);

  const flat = flattenMesh(mesh);
  const positionArray = [];
  const tintArray = [];

  for (const polygon of flat.polygons) {
    const positions = polygon.positions;
    const values = extractor(polygon);

    if (values === undefined) {
      continue;
    }

    for (const { x, y, z } of polygon.indices) {
      for (const i of [x, y, z]) {
        const position = Vector3.fromSource(positions[i]);

        positionArray.push(position.x);
        positionArray.push(position.y);
        positionArray.push(position.z);

        position.add(wireLength(values[i]));

        positionArray.push(position.x);
        positionArray.push(position.y);
        positionArray.push(position.z);

        const tint = wireTint(values[i]);

        tintArray.push(tint.x);
        tintArray.push(tint.y);
        tintArray.push(tint.z);
        tintArray.push(tint.x);
        tintArray.push(tint.y);
        tintArray.push(tint.z);
      }
    }
  }

  const nbIndices = positionArray.length / 3;

  index.set(new Uint32Array(range(nbIndices)), nbIndices);
  position.buffer.set(new Float32Array(positionArray), positionArray.length);
  tint.buffer.set(new Float32Array(tintArray), tintArray.length);

  return {
    index,
    position,
    tint,
  };
};

const wireVertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec3 position;
in vec3 tint;

out vec3 lineTint;

void main(void) {
  vec4 pointWorld = modelMatrix * vec4(position, 1.0);
  vec4 pointCamera = viewMatrix * pointWorld;

  lineTint = tint;

  gl_Position = projectionMatrix * pointCamera;
}`;

const wireFragmentShader = `
in vec3 lineTint;

layout(location=0) out vec4 fragColor;

void main(void) {
  fragColor = vec4(lineTint, 1.0);
}`;

class WireRenderer implements Renderer<WireScene> {
  private readonly painter: GlPainter<WireScene>;
  private readonly shader: GlShader;
  private readonly target: GlTarget;

  public constructor(runtime: GlRuntime, target: GlTarget) {
    const shader = runtime.createShader(
      wireVertexShader,
      wireFragmentShader,
      {}
    );

    this.painter = createWirePainter(shader);
    this.shader = shader;
    this.target = target;
  }

  dispose() {
    this.shader.dispose();
  }

  render(scene: WireScene): void {
    this.painter.paint(this.target, scene);
  }

  resize(): void {}
}

export {
  type WireModel,
  type WireObject,
  type WireScene,
  WireRenderer,
  extractMeshNormals,
  extractMeshTangents,
};
