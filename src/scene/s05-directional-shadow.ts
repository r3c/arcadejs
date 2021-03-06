import * as application from "../engine/application";
import * as bitfield from "./shared/bitfield";
import * as controller from "../engine/io/controller";
import * as debugTexture from "../engine/graphic/pipelines/debug-texture";
import * as display from "../engine/display";
import * as forwardLighting from "../engine/graphic/pipelines/forward-lighting";
import * as load from "../engine/graphic/load";
import * as matrix from "../engine/math/matrix";
import * as move from "./shared/move";
import * as vector from "../engine/math/vector";
import * as view from "./shared/view";
import * as webgl from "../engine/graphic/webgl";

/*
** What changed?
** - Scene is first rendered from light's point of view to a shadow map
** - Then rendered a second time from camera's point of view, using this map for shadowing
*/

interface Configuration {
	animate: boolean,
	enableShadow: boolean,
	showDebug: boolean
}

interface SceneState {
	camera: view.Camera,
	input: controller.Input,
	meshes: {
		cube: webgl.Mesh,
		ground: webgl.Mesh,
		light: webgl.Mesh
	},
	move: number,
	pipelines: {
		debug: debugTexture.Pipeline,
		lights: forwardLighting.Pipeline[]
	},
	projectionMatrix: matrix.Matrix4,
	target: webgl.Target,
	tweak: application.Tweak<Configuration>
}

const configuration = {
	animate: true,
	enableShadow: true,
	showDebug: false
};

const getOptions = (tweak: application.Tweak<Configuration>) => [
	tweak.enableShadow !== 0
];

const prepare = () => application.runtime(display.WebGLScreen, configuration, async (screen, input, tweak) => {
	const gl = screen.context;

	// Load meshes
	const cubeMesh = await load.fromJSON("./obj/cube/mesh.json");
	const groundMesh = await load.fromJSON("./obj/ground/mesh.json");
	const lightMesh = await load.fromJSON("./obj/sphere/mesh.json", { transform: matrix.Matrix4.createIdentity().scale({ x: 0.5, y: 0.5, z: 0.5 }) });

	// Create state
	return {
		camera: new view.Camera({ x: 0, y: 0, z: -5 }, vector.Vector3.zero),
		input: input,
		meshes: {
			cube: webgl.loadMesh(gl, cubeMesh),
			ground: webgl.loadMesh(gl, groundMesh),
			light: webgl.loadMesh(gl, lightMesh)
		},
		move: 0,
		pipelines: {
			debug: new debugTexture.Pipeline(gl, {
				format: debugTexture.Format.Monochrome,
				select: debugTexture.Select.Red,
				zNear: 0.1,
				zFar: 100
			}),
			lights: bitfield.enumerate(getOptions(tweak)).map(flags => new forwardLighting.Pipeline(gl, {
				lightModel: forwardLighting.LightModel.Phong,
				maxDirectionalLights: 1,
				noShadow: !flags[0]
			}))
		},
		projectionMatrix: matrix.Matrix4.createIdentity(),
		target: new webgl.Target(gl, screen.getWidth(), screen.getHeight()),
		tweak: tweak
	};
});

const render = (state: SceneState) => {
	const camera = state.camera;
	const meshes = state.meshes;
	const pipelines = state.pipelines;
	const target = state.target;

	// Setup view matrices
	const transform = {
		projectionMatrix: state.projectionMatrix,
		viewMatrix: matrix.Matrix4
			.createIdentity()
			.translate(camera.position)
			.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
			.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y)
	};

	// Draw scene
	const lightDirection = move.rotate(0, -state.move * 10);
	const lightPipeline = pipelines.lights[bitfield.index(getOptions(state.tweak))];
	const lightScene = {
		ambientLightColor: { x: 0.3, y: 0.3, z: 0.3 },
		directionalLights: [{
			color: { x: 0.8, y: 0.8, z: 0.8 },
			direction: lightDirection,
			shadow: true
		}],
		subjects: [{
			matrix: matrix.Matrix4
				.createIdentity()
				.rotate({ x: 0, y: 1, z: 1 }, state.move * 5),
			mesh: meshes.cube
		}, {
			matrix: matrix.Matrix4
				.createIdentity()
				.translate({ x: 0, y: -1.5, z: 0 }),
			mesh: meshes.ground
		}, {
			matrix: matrix.Matrix4
				.createIdentity()
				.translate(vector.Vector3.scale(vector.Vector3.normalize(lightDirection), 10)),
			mesh: meshes.light,
			noShadow: true
		}]
	}

	target.clear();

	lightPipeline.process(target, transform, lightScene);

	// Draw texture debug
	if (state.tweak.showDebug) {
		const debugPipeline = pipelines.debug;
		const debugScene = debugTexture.Pipeline.createScene(lightPipeline.shadowBuffers[0]);

		debugPipeline.process(target, transform, debugScene);
	}
};

const resize = (state: SceneState, screen: display.WebGLScreen) => {
	for (const pipeline of state.pipelines.lights)
		pipeline.resize(screen.getWidth(), screen.getHeight());

	state.projectionMatrix = matrix.Matrix4.createPerspective(45, screen.getRatio(), 0.1, 100);
	state.pipelines.debug.resize(screen.getWidth(), screen.getHeight());
	state.target.resize(screen.getWidth(), screen.getHeight());
};

const update = (state: SceneState, dt: number) => {
	// Update animation state
	if (state.tweak.animate)
		state.move += dt * 0.00003;

	// Move camera
	state.camera.move(state.input);
};

const process = application.declare({
	prepare: prepare,
	render: render,
	resize: resize,
	update: update
});

export { process };
