import { Matrix4 } from "../../../math/matrix";
import { GlRuntime, GlTarget } from "../../webgl";
import {
  GlShader,
  GlShaderAttribute,
  shaderDirective,
  shaderUniform,
} from "../shader";
import { SinglePainter } from "../painters/single";
import { GlBuffer } from "../resource";
import { Renderer } from "../../display";
import { GlTexture } from "../texture";
import { GlModel, createModel } from "../model";
import { linearToStandard } from "../shaders/rgb";
import { normalDecode } from "../shaders/normal";
import { linearDepth } from "../shaders/depth";
import { Vector2 } from "../../../math/vector";
import { commonMesh } from "../../mesh";

const enum DebugTextureEncoding {
  Identity,
  LinearRGB,
  Monochrome,
  Depth,
  Spheremap,
  Log2RGB,
}

const enum DebugTextureChannel {
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

type DebugTextureConfiguration = {
  channel: DebugTextureChannel;
  encoding: DebugTextureEncoding;
  scale?: number;
  zFar: number;
  zNear: number;
};

type DebugTextureScene = {
  coordinate: GlShaderAttribute;
  index: GlBuffer;
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
  #if CHANNEL == ${DebugTextureChannel.Identity}
    encoded = raw;

  // Read 3 bytes, 2 possible configurations
  #elif CHANNEL == ${DebugTextureChannel.RedGreenBlue}
    encoded = vec4(raw.rgb, 1.0);
  #elif CHANNEL == ${DebugTextureChannel.GreenBlueAlpha}
    encoded = vec4(raw.gba, 1.0);

  // Read 2 bytes, 3 possible configurations
  #elif CHANNEL == ${DebugTextureChannel.RedGreen}
    encoded = vec4(raw.rg, raw.rg);
  #elif CHANNEL == ${DebugTextureChannel.GreenBlue}
    encoded = vec4(raw.gb, raw.gb);
  #elif CHANNEL == ${DebugTextureChannel.BlueAlpha}
    encoded = vec4(raw.ba, raw.ba);

  // Read 1 byte, 4 possible configurations
  #elif CHANNEL == ${DebugTextureChannel.Red}
    encoded = vec4(raw.r);
  #elif CHANNEL == ${DebugTextureChannel.Green}
    encoded = vec4(raw.g);
  #elif CHANNEL == ${DebugTextureChannel.Blue}
    encoded = vec4(raw.b);
  #elif CHANNEL == ${DebugTextureChannel.Alpha}
    encoded = vec4(raw.a);
  #endif

  // Format output
  #if ENCODING == ${DebugTextureEncoding.Identity}
    fragColor = encoded;
  #elif ENCODING == ${DebugTextureEncoding.LinearRGB}
    fragColor = vec4(${linearToStandard.invoke("encoded.rgb")}, 1.0);
  #elif ENCODING == ${DebugTextureEncoding.Monochrome}
    fragColor = vec4(encoded.rrr, 1.0);
  #elif ENCODING == ${DebugTextureEncoding.Depth}
    fragColor = vec4(${linearDepth.invoke(
      "encoded.r",
      "float(ZNEAR)",
      "float(ZFAR)"
    )}, 1.0);
  #elif ENCODING == ${DebugTextureEncoding.Spheremap}
    fragColor = vec4(${normalDecode.invoke("encoded.rg")}, 1.0);
  #elif ENCODING == ${DebugTextureEncoding.Log2RGB}
    fragColor = vec4(-log2(encoded.rgb), 1.0);
  #endif
}`;

const createPainter = (shader: GlShader) => {
  const binding = shader.declare<DebugTextureScene>();

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

  return new SinglePainter(binding, ({ index }) => index);
};

const createShader = (
  runtime: GlRuntime,
  configuration: DebugTextureConfiguration
): GlShader => {
  return runtime.createShader(vertexSource, fragmentSource, {
    CHANNEL: shaderDirective.number(configuration.channel),
    ENCODING: shaderDirective.number(configuration.encoding),
    ZFAR: shaderDirective.number(configuration.zFar),
    ZNEAR: shaderDirective.number(configuration.zNear),
  });
};

class DebugTextureRenderer implements Renderer<GlTexture> {
  private readonly painter: SinglePainter<DebugTextureScene>;
  private readonly quad: GlModel;
  private readonly runtime: GlRuntime;
  private readonly scale: number;
  private readonly shader: GlShader;
  private readonly target: GlTarget;

  public constructor(
    runtime: GlRuntime,
    target: GlTarget,
    configuration: DebugTextureConfiguration
  ) {
    const shader = createShader(runtime, configuration);

    this.painter = createPainter(shader);
    this.quad = createModel(runtime.context, commonMesh.quad);
    this.runtime = runtime;
    this.scale = configuration.scale ?? 0.4;
    this.shader = shader;
    this.target = target;
  }

  public dispose() {
    this.quad.dispose();
    this.shader.dispose();
  }

  public render(source: GlTexture) {
    const gl = this.runtime.context;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // FIXME: create dedicated mesh
    const primitive = this.quad.mesh.primitives[0];

    this.painter.paint(this.target, {
      coordinate: primitive.polygon.coordinate!,
      index: primitive.index,
      modelMatrix: Matrix4.fromSource(
        Matrix4.identity,
        ["translate", { x: 1 - this.scale, y: this.scale - 1, z: 0 }],
        ["scale", { x: this.scale, y: this.scale, z: 0 }]
      ),
      position: primitive.polygon.position,
      source,
    });
  }

  public resize(_size: Vector2) {}
}

export { DebugTextureChannel, DebugTextureEncoding, DebugTextureRenderer };
