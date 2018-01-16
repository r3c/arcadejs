import * as application from "../engine/application";
import * as graphic from "../engine/graphic";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as webgl from "../engine/webgl";

/*
** What changed?
** - Rendering target is now a WebGL context instead of a 2D one
*/

const vsSource = `
	attribute vec4 color;
	attribute vec2 coord;
	attribute vec4 point;

	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;

	varying highp vec4 vColor;
	varying highp vec2 vCoord;

	void main(void) {
		vColor = color;
		vCoord = coord;

		gl_Position = projectionMatrix * modelViewMatrix * point;
	}
`;

const fsSource = `
	varying highp vec4 vColor;
	varying highp vec2 vCoord;

	uniform highp vec4 colorBase;
	uniform sampler2D colorMap;

	void main(void) {
		gl_FragColor = vColor * colorBase * texture2D(colorMap, vCoord);
	}
`;

const gl = application.screen3d.context;
const shader = new webgl.Shader(gl, vsSource, fsSource);

const state = {
	camera: {
		position: { x: 0, y: 0, z: -5 },
		rotation: { x: 0, y: 0, z: 0 }
	},
	input: application.input,
	projection: math.Matrix.createPerspective(45, application.screen3d.getRatio(), 0.1, 100),
	scene: {
		colorBase: shader.declareUniformValue("colorBase", gl => gl.uniform4fv),
		colorMap: shader.declareUniformValue("colorMap", gl => gl.uniform1i),
		colors: shader.declareAttribute("color", 4, gl.FLOAT),
		coords: shader.declareAttribute("coord", 2, gl.FLOAT),
		modelViewMatrix: shader.declareUniformMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv),
		projectionMatrix: shader.declareUniformMatrix("projectionMatrix", gl => gl.uniformMatrix4fv),
		points: shader.declareAttribute("point", 3, gl.FLOAT),
		shader: shader
	},
	screen: application.screen3d
};

let cube: webgl.Mesh[] = [];

const enable = () => {
	const screen = state.screen;

	application.show(screen);
	webgl.setup(screen.context);

	return {};
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
	webgl.draw(state.scene, state.projection, view, cube);
};

const update = (options: application.OptionMap, dt: number) => {
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
	caption: "s05: webgl",
	enable: enable,
	render: render,
	update: update
};

export { scene };
