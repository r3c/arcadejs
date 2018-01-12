import * as application from "../engine/application";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as webgl from "../engine/webgl";

/*
** What changed?
** - Rendering target is now a WebGL context instead of a 2D one
*/

const fsSource = `
	varying highp vec2 vTextureCoord;
	varying highp vec4 vColor;

	uniform sampler2D uSampler;

	void main(void) {
		gl_FragColor = vColor * texture2D(uSampler, vTextureCoord);
	}
`;

const vsSource = `
    attribute vec4 aVertexPosition;
	attribute vec2 aTextureCoord;
	attribute vec4 aColor;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

	varying highp vec2 vTextureCoord;
	varying highp vec4 vColor;

    void main(void) {
		gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
		vTextureCoord = aTextureCoord;
		vColor = aColor;
    }
`;

const gl = application.screen3d.context;
const program = webgl.createProgram(gl, vsSource, fsSource);
const projectionUniformLocation = gl.getUniformLocation(program, "uProjectionMatrix");
const modelViewUniformLocation = gl.getUniformLocation(program, "uModelViewMatrix");

if (projectionUniformLocation === null)
	throw Error("couldn't find projection matrix uniform location");

if (modelViewUniformLocation === null)
	throw Error("couldn't find modelView matrix uniform location");

const shader: webgl.Shader = {
	attributes: {
		color: gl.getAttribLocation(program, "aColor"),
		coord: gl.getAttribLocation(program, "aTextureCoord"),
		normal: undefined,
		position: gl.getAttribLocation(program, "aVertexPosition")
	},
	program: program,
	uniforms: {
		ambient: gl.getUniformLocation(program, "uSampler") || undefined,
		projectionMatrix: projectionUniformLocation,
		modelViewMatrix: modelViewUniformLocation,
	}
};

const state = {
	camera: {
		position: { x: 0, y: 0, z: -5 },
		rotation: { x: 0, y: 0, z: 0 }
	},
	input: application.input,
	projection: math.Matrix.createPerspective(45, application.screen3d.getRatio(), 0.1, 100),
	program: program,
	screen: application.screen3d
};

let cube: webgl.Mesh[] = [];

const enable = () => {
	const screen = state.screen;

	application.show(screen);
	webgl.setup(screen.context);
};

const render = () => {
	const camera = state.camera;
	const screen = state.screen;

	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y)

	webgl.clear(screen.context);
	webgl.draw(screen.context, shader, state.projection, view, cube);
};

const update = (dt: number) => {
	const camera = state.camera;
	const input = state.input;
	const movement = input.fetchMovement();
	const wheel = input.fetchWheel();

	if (input.isPressed("mouseleft")) {
		camera.position.x += movement.x / 64;
		camera.position.y -= movement.y / 64;
	}

	if (input.isPressed("mouseright")) {
		camera.rotation.x -= movement.y / 64;
		camera.rotation.y -= movement.x / 64;
	}

	camera.position.z += wheel;
};

io.Stream
	.readURL(io.StringReader, "./res/mesh/cube-ambient.json")
	.then(reader => webgl.load(state.screen.context, graphic.Loader.fromJSON(reader.data), "./res/mesh/"))
	.then(meshes => cube = meshes);

const scene = {
	enable: enable,
	render: render,
	update: update
};

export { scene };
