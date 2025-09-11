import { Disposable } from "../../language/lifecycle";
import { Matrix4 } from "../../math/matrix";
import { GlRuntime, GlTarget } from "../webgl";
import {
  GlShader,
  GlShaderAttribute,
  shaderDirective,
  shaderUniform,
} from "../webgl/shader";
import { GlBuffer } from "../webgl/resource";
import { GlTexture } from "../webgl/texture";
import { createModel } from "../webgl/model";
import { linearToStandard } from "../webgl/shaders/rgb";
import { normalDecode } from "../webgl/shaders/normal";
import { linearDepth } from "../webgl/shaders/depth";
import { commonMesh } from "../mesh";
import { createGlBindingPainter, Painter } from "../painter";

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

type GlEncodingConfiguration = {
  channel: GlEncodingChannel;
  format: GlEncodingFormat;
  scale?: number;
  zFar: number;
  zNear: number;
};

type GlEncodingPainter = Disposable & Painter<GlTarget, GlTexture>;

type Scene = {
  coordinate: GlShaderAttribute;
  indexBuffer: GlBuffer;
  modelMatrix: Matrix4;
  position: GlShaderAttribute;
  source: GlTexture;
};

const vertexSource = `
uniform mat4 modelMatrix;

in vec2 coordinate;
in vec3 position;

out vec2 coord;

void main(void) {
  coord = coordinate;

  gl_Position = modelMatrix * vec4(position, 1.0);
}`;

const fragmentSource = `
${linearDepth.declare()}
${linearToStandard.declare()}
${normalDecode.declare()}

uniform sampler2D source;

in vec2 coord;

layout(location=0) out vec4 fragColor;

void main(void) {
  vec4 encoded;
  vec4 raw = texture(source, coord);

  // Read 4 bytes, 1 possible configuration
  #if CHANNEL == ${GlEncodingChannel.Identity}
    encoded = raw;

  // Read 3 bytes, 2 possible configurations
  #elif CHANNEL == ${GlEncodingChannel.RedGreenBlue}
    encoded = vec4(raw.rgb, 1.0);
  #elif CHANNEL == ${GlEncodingChannel.GreenBlueAlpha}
    encoded = vec4(raw.gba, 1.0);

  // Read 2 bytes, 3 possible configurations
  #elif CHANNEL == ${GlEncodingChannel.RedGreen}
    encoded = vec4(raw.rg, raw.rg);
  #elif CHANNEL == ${GlEncodingChannel.GreenBlue}
    encoded = vec4(raw.gb, raw.gb);
  #elif CHANNEL == ${GlEncodingChannel.BlueAlpha}
    encoded = vec4(raw.ba, raw.ba);

  // Read 1 byte, 4 possible configurations
  #elif CHANNEL == ${GlEncodingChannel.Red}
    encoded = vec4(raw.r);
  #elif CHANNEL == ${GlEncodingChannel.Green}
    encoded = vec4(raw.g);
  #elif CHANNEL == ${GlEncodingChannel.Blue}
    encoded = vec4(raw.b);
  #elif CHANNEL == ${GlEncodingChannel.Alpha}
    encoded = vec4(raw.a);
  #endif

  // Format output
  #if FORMAT == ${GlEncodingFormat.Identity}
    fragColor = encoded;
  #elif FORMAT == ${GlEncodingFormat.LinearRGB}
    fragColor = vec4(${linearToStandard.invoke("encoded.rgb")}, 1.0);
  #elif FORMAT == ${GlEncodingFormat.Monochrome}
    fragColor = vec4(encoded.rrr, 1.0);
  #elif FORMAT == ${GlEncodingFormat.Depth}
    fragColor = vec4(${linearDepth.invoke(
      "encoded.r",
      "float(ZNEAR)",
      "float(ZFAR)"
    )}, 1.0);
  #elif FORMAT == ${GlEncodingFormat.Spheremap}
    fragColor = vec4(${normalDecode.invoke("encoded.rg")}, 1.0);
  #elif FORMAT == ${GlEncodingFormat.Log2RGB}
    fragColor = vec4(-log2(encoded.rgb), 1.0);
  #endif
}`;

const createPainter = (shader: GlShader) => {
  const binding = shader.declare<Scene>();

  binding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  binding.setAttribute("position", ({ position }) => position);
  binding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );
  binding.setUniform(
    "source",
    shaderUniform.tex2dBlack(({ source }) => source)
  );

  return createGlBindingPainter(binding, ({ indexBuffer }) => indexBuffer);
};

const createShader = (
  runtime: GlRuntime,
  configuration: GlEncodingConfiguration
): GlShader => {
  return runtime.createShader(vertexSource, fragmentSource, {
    CHANNEL: shaderDirective.number(configuration.channel),
    FORMAT: shaderDirective.number(configuration.format),
    ZFAR: shaderDirective.number(configuration.zFar),
    ZNEAR: shaderDirective.number(configuration.zNear),
  });
};

const createGlEncodingPainter = (
  runtime: GlRuntime,
  configuration: GlEncodingConfiguration
): GlEncodingPainter => {
  const shader = createShader(runtime, configuration);
  const painter = createPainter(shader);
  const quad = createModel(runtime.context, commonMesh.quad);
  const scale = configuration.scale ?? 0.4;

  const modelMatrix = Matrix4.fromSource(
    Matrix4.identity,
    ["translate", { x: 1 - scale, y: scale - 1, z: 0 }],
    ["scale", { x: scale, y: scale, z: 0 }]
  );

  return {
    dispose() {
      quad.dispose();
      shader.dispose();
    },

    paint(target, scene) {
      const gl = runtime.context;

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      // FIXME: create dedicated mesh
      const { indexBuffer, polygon } = quad.mesh.primitives[0];
      const { coordinate, position } = polygon;

      if (coordinate !== undefined) {
        painter.paint(target, {
          coordinate,
          indexBuffer,
          modelMatrix,
          position,
          source: scene,
        });
      }
    },
  };
};

export {
  type GlEncodingConfiguration,
  type GlEncodingPainter,
  GlEncodingChannel,
  GlEncodingFormat,
  createGlEncodingPainter,
};
