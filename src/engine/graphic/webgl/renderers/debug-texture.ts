import { Matrix4 } from "../../../math/matrix";
import { SingularPainter } from "../painters/singular";
import { mesh } from "./resources/quad";
import {
  GlModel,
  GlPainter,
  GlRenderer,
  GlRuntime,
  GlScene,
  GlShader,
  GlTarget,
  loadModel,
  uniform,
} from "../../webgl";

const vertexSource = `
uniform mat4 modelMatrix;

in vec2 coords;
in vec3 points;

out vec2 coord;

void main(void) {
	coord = coords;

	gl_Position = modelMatrix * vec4(points, 1.0);
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

interface Configuration {
  format: DebugTextureFormat;
  scale?: number;
  select: DebugTextureSelect;
  zFar: number;
  zNear: number;
}

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

type SceneState = {
  source: WebGLTexture;
};

const load = (runtime: GlRuntime, configuration: Configuration) => {
  const directives = [
    { name: "FORMAT", value: configuration.format },
    { name: "SELECT", value: configuration.select },
    { name: "ZFAR", value: configuration.zFar },
    { name: "ZNEAR", value: configuration.zNear },
  ];

  const shader = new GlShader<SceneState, undefined>(
    runtime,
    vertexSource,
    fragmentSource,
    directives
  );

  shader.setAttributePerPolygon("coords", (geometry) => geometry.coords);
  shader.setAttributePerPolygon("points", (geometry) => geometry.points);

  shader.setUniformPerScene(
    "source",
    uniform.blackQuadTexture(({ source }) => source)
  );

  shader.setUniformPerMesh(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );

  return shader;
};

class DebugTextureRenderer implements GlRenderer<SceneState, undefined> {
  private readonly painter: GlPainter<SceneState, undefined>;
  private readonly quad: GlModel;
  private readonly runtime: GlRuntime;
  private readonly scale: number;

  /*
   ** Helper function used to build fake scene with a single object using
   ** given texture. It allows easy construction of "scene" parameter expected
   ** by "process" method easily.
   */
  public static createScene(
    source: WebGLTexture
  ): GlScene<SceneState, undefined> {
    return {
      state: {
        source,
      },
      objects: [
        {
          matrix: Matrix4.fromIdentity(),
          model: {
            library: undefined,
            meshes: [
              {
                children: [],
                primitives: [
                  {
                    polygon: undefined as any,
                    material: {
                      albedoMap: source,
                    } as any,
                  },
                ],
                transform: Matrix4.fromIdentity(),
              },
            ],
          },
          state: undefined,
        },
      ],
    };
  }

  public constructor(runtime: GlRuntime, configuration: Configuration) {
    this.painter = new SingularPainter(load(runtime, configuration));
    this.quad = loadModel(runtime, mesh);
    this.runtime = runtime;
    this.scale = configuration.scale ?? 0.4;
  }

  public render(target: GlTarget, scene: GlScene<SceneState, undefined>) {
    const gl = this.runtime.context;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const objects = [
      {
        matrix: Matrix4.fromCustom(
          ["translate", { x: 1 - this.scale, y: this.scale - 1, z: 0 }],
          ["scale", { x: this.scale, y: this.scale, z: 0 }]
        ),
        model: this.quad,
        state: undefined,
      },
    ];

    // Hack: find first defined albedo map from object models and use it as debug source
    for (const { model } of scene.objects) {
      for (const node of model.meshes) {
        for (const primitive of node.primitives) {
          if (primitive.material.albedoMap !== undefined) {
            this.painter.paint(target, objects, Matrix4.fromIdentity(), {
              source: primitive.material.albedoMap,
            });

            return;
          }
        }
      }
    }
  }

  public resize(_width: number, _height: number) {}
}

export { DebugTextureFormat, DebugTextureRenderer, DebugTextureSelect };
