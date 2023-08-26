import { Matrix4 } from "../../../math/matrix";
import { model } from "./resources/quad";
import { GlRuntime, GlTarget } from "../../webgl";
import { GlShaderAttribute, shaderDirective, shaderUniform } from "../shader";
import { SinglePainter } from "../painters/single";
import { GlBuffer } from "../resource";
import { Renderer } from "../../display";
import { GlTexture } from "../texture";
import { GlModel, GlPolygon, loadModel } from "../model";

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
uniform sampler2D source;

in vec2 coord;

layout(location=0) out vec4 fragColor;

// Spheremap transform
// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
vec3 decodeNormalSpheremap(in vec2 normalPack) {
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5)) * 0.5 + 0.5;
}

// Linearize depth
// See: http://glampert.com/2014/01-26/visualizing-the-depth-buffer/
vec3 linearizeDepth(in float depth)
{
	float zNear = float(ZNEAR);
	float zFar = float(ZFAR);

	return vec3(2.0 * zNear / (zFar + zNear - depth * (zFar - zNear)));
}

void main(void) {
	vec4 encoded;
	vec4 raw = texture(source, coord);

	// Read 4 bytes, 1 possible configuration
	#if SELECT == 0
		encoded = raw;

	// Read 3 bytes, 2 possible configurations
	#elif SELECT == 1
		encoded = vec4(raw.rgb, 1.0);
	#elif SELECT == 2
		encoded = vec4(raw.gba, 1.0);

	// Read 2 bytes, 3 possible configurations
	#elif SELECT == 3
		encoded = vec4(raw.rg, raw.rg);
	#elif SELECT == 4
		encoded = vec4(raw.gb, raw.gb);
	#elif SELECT == 5
		encoded = vec4(raw.ba, raw.ba);

	// Read 1 byte, 4 possible configurations
	#elif SELECT == 6
		encoded = vec4(raw.r);
	#elif SELECT == 7
		encoded = vec4(raw.g);
	#elif SELECT == 8
		encoded = vec4(raw.b);
	#elif SELECT == 9
		encoded = vec4(raw.a);
	#endif

	// Format output
	#if FORMAT == 0
		fragColor = encoded;
	#elif FORMAT == 1
		fragColor = vec4(encoded.rgb, 1.0);
	#elif FORMAT == 2
		fragColor = vec4(encoded.rrr, 1.0);
	#elif FORMAT == 3
		fragColor = vec4(linearizeDepth(encoded.r), 1.0);
	#elif FORMAT == 4
		fragColor = vec4(decodeNormalSpheremap(encoded.rg), 1.0);
	#elif FORMAT == 5
		fragColor = vec4(-log2(encoded.rgb), 1.0);
	#endif
}`;

type DebugTextureConfiguration = {
  format: DebugTextureFormat;
  scale?: number;
  select: DebugTextureSelect;
  zFar: number;
  zNear: number;
};

const enum DebugTextureFormat {
  Identity,
  Colorful,
  Monochrome,
  Depth,
  Spheremap,
  Logarithm,
}

const enum DebugTextureSelect {
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

type DebugTextureScene = {
  coordinate: GlShaderAttribute;
  index: GlBuffer;
  modelMatrix: Matrix4;
  position: GlShaderAttribute;
  source: GlTexture;
};

const loadPainter = (
  runtime: GlRuntime,
  configuration: DebugTextureConfiguration
) => {
  const shader = runtime.createShader(vertexSource, fragmentSource, {
    FORMAT: shaderDirective.number(configuration.format),
    SELECT: shaderDirective.number(configuration.select),
    ZFAR: shaderDirective.number(configuration.zFar),
    ZNEAR: shaderDirective.number(configuration.zNear),
  });

  const binding = shader.declare<DebugTextureScene>();

  binding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  binding.setAttribute("position", ({ position }) => position);
  binding.setUniform(
    "modelMatrix",
    shaderUniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  binding.setUniform(
    "source",
    shaderUniform.blackQuadTexture(({ source }) => source)
  );

  return new SinglePainter(binding, ({ index }) => index);
};

class DebugTextureRenderer implements Renderer<GlTexture> {
  private readonly painter: SinglePainter<DebugTextureScene>;
  private readonly quad: GlModel<GlPolygon>;
  private readonly runtime: GlRuntime;
  private readonly scale: number;
  private readonly target: GlTarget;

  public constructor(
    runtime: GlRuntime,
    target: GlTarget,
    configuration: DebugTextureConfiguration
  ) {
    this.painter = loadPainter(runtime, configuration);
    this.quad = loadModel(runtime.context, model);
    this.runtime = runtime;
    this.scale = configuration.scale ?? 0.4;
    this.target = target;
  }

  public dispose() {}

  public render(source: GlTexture) {
    const gl = this.runtime.context;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // FIXME: create dedicated mesh
    const primitive = this.quad.meshes[0].primitives[0];

    this.painter.paint(this.target, {
      coordinate: primitive.polygon.coordinate!,
      index: primitive.index,
      modelMatrix: Matrix4.fromCustom(
        ["translate", { x: 1 - this.scale, y: this.scale - 1, z: 0 }],
        ["scale", { x: this.scale, y: this.scale, z: 0 }]
      ),
      position: primitive.polygon.position,
      source,
    });
  }

  public resize(_width: number, _height: number) {}
}

export { DebugTextureFormat, DebugTextureRenderer, DebugTextureSelect };
