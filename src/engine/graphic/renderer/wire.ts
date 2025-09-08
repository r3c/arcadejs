import { Disposable } from "../../language/lifecycle";
import { range } from "../../language/iterable";
import { Matrix4 } from "../../math/matrix";
import { Vector3 } from "../../math/vector";
import { Mesh, Polygon, createFlattenedMesh } from "../mesh";
import { GlRuntime, GlTarget } from "../webgl";
import {
  GlBuffer,
  createStaticArrayBuffer,
  createStaticIndexBuffer,
} from "../webgl/resource";
import {
  GlShader,
  GlShaderAttribute,
  GlShaderBinding,
  createAttribute,
  shaderUniform,
} from "../webgl/shader";
import { Renderer } from "./definition";

type WireModel = {
  index: GlBuffer;
  position: GlShaderAttribute;
  tint: GlShaderAttribute;
};

type WireRenderer = Disposable & Renderer<WireScene, WireSubject, void>;

type WireSubject = {
  modelMatrix: Matrix4;
  wireModel: WireModel;
};

type WireScene = {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const createWireBinding = (
  shader: GlShader
): {
  sceneBinding: GlShaderBinding<WireScene>;
  subjectBinding: GlShaderBinding<WireSubject>;
} => {
  const sceneBinding = shader.declare<WireScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );

  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  const subjectBinding = shader.declare<WireSubject>();

  subjectBinding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );

  subjectBinding.setAttribute(
    "position",
    ({ wireModel }) => wireModel.position
  );
  subjectBinding.setAttribute("tint", ({ wireModel }) => wireModel.tint);

  return { sceneBinding, subjectBinding };
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

  const flat = createFlattenedMesh(mesh);
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

const createWireRenderer = (
  runtime: GlRuntime,
  target: GlTarget
): WireRenderer => {
  const shader = runtime.createShader(wireVertexShader, wireFragmentShader, {});
  const { sceneBinding, subjectBinding } = createWireBinding(shader);
  const subjects = new Map<Symbol, WireSubject>();

  return {
    append(subject) {
      const symbol = Symbol();

      subjects.set(symbol, subject);

      return {
        action: undefined,
        remove: () => subjects.delete(symbol),
      };
    },

    dispose() {
      shader.dispose();
    },

    render(scene: WireScene): void {
      sceneBinding.bind(scene);

      for (const subject of subjects.values()) {
        subjectBinding.bind(subject);

        target.draw(
          0,
          WebGL2RenderingContext["LINES"],
          subject.wireModel.index
        );
      }
    },

    resize() {},
  };
};

export {
  type WireModel,
  type WireRenderer,
  type WireScene,
  createWireRenderer,
  extractMeshNormals,
  extractMeshTangents,
};
