import { Matrix4 } from "../../../math/matrix";
import { SingularPainter } from "../painters/singular";
import { model } from "./resources/quad";
import {
  GlModel,
  GlObject,
  GlPainter,
  GlPrimitive,
  GlRenderer,
  GlRuntime,
  GlScene,
  GlShader,
  GlTarget,
  directive,
  loadModel,
  uniform,
} from "../../webgl";
import { GlPolygon } from "./objects/polygon";

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

type DebugTexturePolygon = Pick<GlPolygon, "coordinate" | "position">;

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

const load = (runtime: GlRuntime, configuration: DebugTextureConfiguration) => {
  const directives = {
    FORMAT: directive.number(configuration.format),
    SELECT: directive.number(configuration.select),
    ZFAR: directive.number(configuration.zFar),
    ZNEAR: directive.number(configuration.zNear),
  };

  const shader = new GlShader<SceneState, DebugTexturePolygon>(
    runtime,
    vertexSource,
    fragmentSource,
    directives
  );

  shader.setAttributePerPolygon("coordinate", ({ coordinate }) => coordinate);
  shader.setAttributePerPolygon("position", ({ position }) => position);

  shader.setUniformPerScene(
    "source",
    uniform.blackQuadTexture(({ source }) => source)
  );

  shader.setUniformPerGeometry(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );

  return shader;
};

class DebugTextureRenderer
  implements GlRenderer<SceneState, GlObject<DebugTexturePolygon>>
{
  private readonly painter: GlPainter<SceneState, DebugTexturePolygon>;
  private readonly quad: GlModel<DebugTexturePolygon>;
  private readonly runtime: GlRuntime;
  private readonly scale: number;

  /*
   ** Helper function used to build fake scene with a single object using
   ** given texture. It allows easy construction of "scene" parameter expected
   ** by "process" method easily.
   */
  public static createScene(
    source: WebGLTexture
  ): GlScene<SceneState, GlObject<DebugTexturePolygon>> {
    return {
      objects: [
        {
          matrix: Matrix4.identity,
          model: {
            library: undefined,
            meshes: [
              {
                children: [],
                primitives: [
                  {
                    material: { albedoMap: source },
                  } as GlPrimitive<DebugTexturePolygon>,
                ],
                transform: Matrix4.identity,
              },
            ],
          },
        },
      ],
      state: {
        source,
      },
    };
  }

  public constructor(
    runtime: GlRuntime,
    configuration: DebugTextureConfiguration
  ) {
    this.painter = new SingularPainter(load(runtime, configuration));
    this.quad = loadModel(runtime, model);
    this.runtime = runtime;
    this.scale = configuration.scale ?? 0.4;
  }

  public render(
    target: GlTarget,
    scene: GlScene<SceneState, GlObject<DebugTexturePolygon>>
  ) {
    const gl = this.runtime.context;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const objects: GlObject<DebugTexturePolygon>[] = [
      {
        matrix: Matrix4.fromCustom(
          ["translate", { x: 1 - this.scale, y: this.scale - 1, z: 0 }],
          ["scale", { x: this.scale, y: this.scale, z: 0 }]
        ),
        model: this.quad,
      },
    ];

    // Hack: find first defined albedo map from object models and use it as debug source
    for (const { model } of scene.objects) {
      for (const mesh of model.meshes) {
        for (const { material } of mesh.primitives) {
          if (material.albedoMap !== undefined) {
            this.painter.paint(target, objects, Matrix4.identity, {
              source: material.albedoMap,
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
