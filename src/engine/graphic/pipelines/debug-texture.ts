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
uniform int format;
uniform int select;

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
	if (select == 0)
		encoded = raw;

	// Read 3 bytes, 2 possible configurations
	else if (select == 1)
		encoded = vec4(raw.rgb, 1.0);
	else if (select == 2)
		encoded = vec4(raw.gba, 1.0);

	// Read 2 bytes, 3 possible configurations
	else if (select == 3)
		encoded = vec4(raw.rg, raw.rg);
	else if (select == 4)
		encoded = vec4(raw.gb, raw.gb);
	else if (select == 5)
		encoded = vec4(raw.ba, raw.ba);

	// Read 1 byte, 4 possible configurations
	else if (select == 6)
		encoded = vec4(raw.r);
	else if (select == 7)
		encoded = vec4(raw.g);
	else if (select == 8)
		encoded = vec4(raw.b);
	else if (select == 9)
		encoded = vec4(raw.a);

	// Format output
	if (format == 0)
		fragColor = encoded;
	else if (format == 1)
		fragColor = vec4(encoded.rgb, 1.0);
	else if (format == 2)
		fragColor = vec4(encoded.rrr, 1.0);
	else if (format == 3)
		fragColor = vec4(linearizeDepth(encoded.r), 1.0);
	else if (format == 4)
		fragColor = vec4(decodeNormalSpheremap(encoded.rg), 1.0);
	else if (format == 5)
		fragColor = vec4(-log2(encoded.rgb), 1.0);
}`;

interface Configuration {
	scale?: number,
	zFar: number,
	zNear: number
}

enum Format {
	Identity,
	Colorful,
	Monochrome,
	Depth,
	Spheremap,
	Logarithm
}

enum Select {
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
	format: Format,
	select: Select,
	source: WebGLTexture
}

const load = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const directives = [
		{ name: "ZFAR", value: configuration.zFar },
		{ name: "ZNEAR", value: configuration.zNear }
	];

	const shader = new webgl.Shader<State>(gl, vertexSource, fragmentSource, directives);

	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindPropertyPerTarget("format", gl => gl.uniform1i, state => <number>state.format);
	shader.bindPropertyPerTarget("select", gl => gl.uniform1i, state => <number>state.select);
	shader.bindTexturePerTarget("source", state => state.source);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());

	return shader;
};

class Pipeline implements webgl.Pipeline<State> {
	private readonly gl: WebGLRenderingContext;
	private readonly quad: webgl.Model;
	private readonly scale: number;
	private readonly shader: webgl.Shader<State>;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		this.gl = gl;
		this.quad = webgl.loadModel(gl, quad.model);
		this.scale = functional.coalesce(configuration.scale, 0.4);
		this.shader = load(gl, configuration);
	}

	public process(target: webgl.Target, scene: webgl.Scene, state: State) {
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
			model: this.quad
		}];

		target.draw(this.shader, subjects, state);
	}

	public resize(width: number, height: number) {
	}
}

export { Format, Pipeline, Select, State }