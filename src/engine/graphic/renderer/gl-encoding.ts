import { Releasable } from "../../io/resource";
import { Matrix4 } from "../../math/matrix";
import { GlRuntime } from "../webgl";
import { GlPencil, GlTarget } from "../webgl/target";
import {
  shaderCase,
  GlShader,
  GlShaderAttribute,
  uniform,
  GlShaderSource,
} from "../webgl/shader";
import { GlBuffer } from "../webgl/resource";
import { GlTexture } from "../webgl/texture";
import { createModel } from "../webgl/model";
import { linearToStandard } from "../webgl/shaders/rgb";
import { normalDecode } from "../webgl/shaders/normal";
import { linearDepth } from "../webgl/shaders/depth";
import { commonMesh } from "../mesh";
import { Renderer } from "./definition";

const enum GlEncodingChannel {
  Identity,
  RedGreenBlue,
  GreenBlueAlpha,
  RedGreen,
  GreenBlue,
  BlueAlpha,
  Red,
  Green,
  Blue,
  Alpha,
}

const enum GlEncodingFormat {
  Identity,
  LinearRGB,
  Monochrome,
  Depth,
  Spheremap,
  Log2RGB,
}

const enum GlEncodingSource {
  Sampler2d,
  SamplerCubeNegativeX,
  SamplerCubePositiveX,
  SamplerCubeNegativeY,
  SamplerCubePositiveY,
  SamplerCubeNegativeZ,
  SamplerCubePositiveZ,
}

type GlEncodingConfiguration = {
  channel: GlEncodingChannel;
  format: GlEncodingFormat;
  source: GlEncodingSource;
  scale?: number;
  zFar: number;
  zNear: number;
};

type GlEncodingRenderer = Releasable & Renderer<GlTarget, GlTexture, void>;

type Scene = {
  coordinate: GlShaderAttribute;
  indexBuffer: GlBuffer;
  modelMatrix: Matrix4;
  position: GlShaderAttribute;
  source: GlTexture;
};

const encodingSources = {
  [GlEncodingSource.Sampler2d]: {
    uniform: uniform.tex2dBlack<Scene>(({ source }) => source),
    type: "sampler2D",
    value: "coord",
  },
  [GlEncodingSource.SamplerCubeNegativeX]: {
    uniform: uniform.tex3d<Scene>(({ source }) => source),
    type: "samplerCube",
    value: "vec3(-1.0, coord.xy * 2.0 - 1.0)",
  },
  [GlEncodingSource.SamplerCubePositiveX]: {
    uniform: uniform.tex3d<Scene>(({ source }) => source),
    type: "samplerCube",
    value: "vec3(+1.0, coord.xy * 2.0 - 1.0)",
  },
  [GlEncodingSource.SamplerCubeNegativeY]: {
    uniform: uniform.tex3d<Scene>(({ source }) => source),
    type: "samplerCube",
    value: "vec3(coord.x * 2.0 - 1.0, -1.0, coord.y * 2.0 - 1.0)",
  },
  [GlEncodingSource.SamplerCubePositiveY]: {
    uniform: uniform.tex3d<Scene>(({ source }) => source),
    type: "samplerCube",
    value: "vec3(coord.x * 2.0 - 1.0, +1.0, coord.y * 2.0 - 1.0)",
  },
  [GlEncodingSource.SamplerCubeNegativeZ]: {
    uniform: uniform.tex3d<Scene>(({ source }) => source),
    type: "samplerCube",
    value: "vec3(coord.xy * 2.0 - 1.0, -1.0)",
  },
  [GlEncodingSource.SamplerCubePositiveZ]: {
    uniform: uniform.tex3d<Scene>(({ source }) => source),
    type: "samplerCube",
    value: "vec3(coord.xy * 2.0 - 1.0, +1.0)",
  },
};

const createSource = (
  configuration: GlEncodingConfiguration,
): GlShaderSource => ({
  vertex: `
uniform mat4 modelMatrix;

in vec2 coordinate;
in vec3 position;

out vec2 coord;

void main(void) {
  coord = coordinate;

  gl_Position = modelMatrix * vec4(position, 1.0);
}`,

  fragment: `
${linearDepth.declare({})}
${linearToStandard.declare({})}
${normalDecode.declare({})}

uniform ${encodingSources[configuration.source].type} source;

in vec2 coord;

layout(location=0) out vec4 fragColor;

void main(void) {
  vec4 raw = texture(source, ${encodingSources[configuration.source].value});

  vec4 encoded = ${shaderCase(
    configuration.channel,

    // Read 4 bytes, 1 possible configuration
    [GlEncodingChannel.Identity, `raw`],

    // Read 3 bytes, 2 possible configurations
    [GlEncodingChannel.RedGreenBlue, `vec4(raw.rgb, 1.0)`],
    [GlEncodingChannel.GreenBlueAlpha, `vec4(raw.gba, 1.0)`],

    // Read 2 bytes, 3 possible configurations
    [GlEncodingChannel.RedGreen, `vec4(raw.rg, raw.rg)`],
    [GlEncodingChannel.GreenBlue, `vec4(raw.gb, raw.gb)`],
    [GlEncodingChannel.BlueAlpha, `vec4(raw.ba, raw.ba)`],

    // Read 1 byte, 4 possible configurations
    [GlEncodingChannel.Red, `vec4(raw.r)`],
    [GlEncodingChannel.Green, `vec4(raw.g)`],
    [GlEncodingChannel.Blue, `vec4(raw.b)`],
    [GlEncodingChannel.Alpha, `vec4(raw.a)`],
  )};

  fragColor = ${shaderCase(
    configuration.format,
    [GlEncodingFormat.Identity, `encoded`],
    [
      GlEncodingFormat.LinearRGB,
      `vec4(${linearToStandard.invoke({ linear: "encoded.rgb" })}, 1.0)`,
    ],
    [GlEncodingFormat.Monochrome, `vec4(encoded.rrr, 1.0)`],
    [
      GlEncodingFormat.Depth,
      `vec4(${linearDepth.invoke({
        depth: "encoded.r",
        zFar: `float(${configuration.zFar})`,
        zNear: `float(${configuration.zNear})`,
      })}, 1.0)`,
    ],
    [
      GlEncodingFormat.Spheremap,
      `vec4(${normalDecode.invoke({ encoded: "encoded.rg" })}, 1.0)`,
    ],
    [GlEncodingFormat.Log2RGB, `vec4(-log2(encoded.rgb), 1.0)`],
  )};
}`,
});

const createBinding = (shader: GlShader, source: GlEncodingSource) => {
  const binding = shader.declare<Scene>();

  binding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  binding.setAttribute("position", ({ position }) => position);
  binding.setUniform(
    "modelMatrix",
    uniform.matrix4f(({ modelMatrix }) => modelMatrix),
  );
  binding.setUniform("source", encodingSources[source].uniform);

  return binding;
};

const createGlEncodingRenderer = (
  runtime: GlRuntime,
  configuration: GlEncodingConfiguration,
): GlEncodingRenderer => {
  const shader = runtime.createShader(createSource(configuration));
  const binding = createBinding(shader, configuration.source);
  const quad = createModel(runtime.context, commonMesh.quad);
  const scale = configuration.scale ?? 0.4;

  const modelMatrix = Matrix4.fromSource(
    Matrix4.identity,
    ["translate", { x: 1 - scale, y: scale - 1, z: 0 }],
    ["scale", { x: scale, y: scale, z: 0 }],
  );

  return {
    addSubject() {
      return () => {};
    },

    release() {
      quad.release();
      shader.release();
    },

    render(target, scene) {
      const gl = runtime.context;

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      // FIXME: create dedicated mesh
      const { indexBuffer, polygon } = quad.mesh.primitives[0];
      const { coordinate, position } = polygon;

      if (coordinate !== undefined) {
        binding.bind({
          coordinate,
          indexBuffer,
          modelMatrix,
          position,
          source: scene,
        });
        target.draw(GlPencil.Triangle, indexBuffer);
      }
    },

    setSize() {},
  };
};

export {
  type GlEncodingConfiguration,
  type GlEncodingRenderer,
  GlEncodingChannel,
  GlEncodingFormat,
  GlEncodingSource,
  createGlEncodingRenderer,
};
