import * as functional from "../../language/functional";
import * as matrix from "../../math/matrix";
import * as quad from "./resources/quad";
import * as webgl from "../webgl";

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
	format: Format,
	scale?: number,
	select: Select,
	zFar: number,
	zNear: number
}

const enum Format {
	Identity,
	Colorful,
	Monochrome,
	Depth,
	Spheremap,
	Logarithm
}

const enum Select {
	Identity,
	RedGreenBlue,
	GreenBlueAlpha,
	RedGreen,
	GreenBlue,
	BlueAlpha,
	Red,
	Green,
	Blue,
	Alpha
}

interface State {
	source: WebGLTexture
}

const load = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const directives = [
		{ name: "FORMAT", value: configuration.format },
		{ name: "SELECT", value: configuration.select },
		{ name: "ZFAR", value: configuration.zFar },
		{ name: "ZNEAR", value: configuration.zNear }
	];

	const shader = new webgl.Shader<State>(gl, vertexSource, fragmentSource, directives);

	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindTexturePerTarget("source", state => state.source);

	shader.bindMatrixPerNode("modelMatrix", gl => gl.uniformMatrix4fv, state => state.matrix.getValues());

	return shader;
};

class Pipeline implements webgl.Pipeline {
	private readonly gl: WebGLRenderingContext;
	private readonly quad: webgl.Mesh;
	private readonly scale: number;
	private readonly shader: webgl.Shader<State>;

	/*
	** Helper function used to build fake scene with a single subject using
	** given texture. It allows easy construction of "scene" parameter expected
	** by "process" method easily.
	*/
	public static createScene(source: WebGLTexture): webgl.Scene {
		const defaultColor = [0, 0, 0, 0];

		return {
			subjects: [{
				matrix: matrix.Matrix4.createIdentity(),
				mesh: {
					nodes: [{
						children: [],
						primitives: [{
							geometry: undefined,
							material: {
								albedoColor: defaultColor,
								albedoMap: source,
								emissiveMap: undefined,
								emissiveStrength: 0,
								glossColor: defaultColor,
								glossMap: undefined,
								heightMap: undefined,
								metalnessMap: undefined,
								normalMap: undefined,
								occlusionMap: undefined,
								occlusionStrength: 0,
								parallaxBias: 0,
								parallaxScale: 0,
								roughnessMap: defaultColor,
								shininess: 0
							}
						}],
						transform: matrix.Matrix4.createIdentity()
					}]
				}
			}]
		};
	}

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		this.gl = gl;
		this.quad = webgl.loadMesh(gl, quad.mesh);
		this.scale = functional.coalesce(configuration.scale, 0.4);
		this.shader = load(gl, configuration);
	}

	public process(target: webgl.Target, transform: webgl.Transform, scene: webgl.Scene) {
		const gl = this.gl;

		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		const subjects = [{
			matrix: matrix.Matrix4
				.createIdentity()
				.translate({ x: 1 - this.scale, y: this.scale - 1, z: 0 })
				.scale({ x: this.scale, y: this.scale, z: 0 }),
			mesh: this.quad
		}];

		// Hack: find first defined albedo map from subject models and use it as debug source
		for (const subject of scene.subjects) {
			for (const node of subject.mesh.nodes) {
				for (const primitive of node.primitives) {
					if (primitive.material !== undefined && primitive.material.albedoMap !== undefined) {
						target.draw(this.shader, subjects, {
							source: primitive.material.albedoMap
						});

						return;
					}
				}
			}
		}
	}

	public resize(width: number, height: number) {
	}
}

export { Format, Pipeline, Select }