import * as application from "../engine/application";
import * as controller from "../engine/controller";
import * as display from "../engine/display";
import * as io from "../engine/io";
import * as math from "../engine/math";
import * as model from "../engine/model";
import * as webgl from "../engine/render/webgl";

/*
** What changed?
** - Simple directional (diffuse) lightning has been added to the scene
** - Scene uses two different shaders loaded from external files
*/

interface Configuration {
	moveLights: boolean,
	nbLights: string[],
	useAmbient: boolean,
	useDiffuse: boolean,
	useSpecular: boolean,
	useNormalMap: boolean,
	useHeightMap: boolean
}

interface SceneState {
	camera: {
		position: math.Vector3,
		rotation: math.Vector3
	},
	input: controller.Input,
	light: ShaderState,
	move: number,
	subjects: {
		bulb: webgl.Subject<ShaderState>,
		cube: webgl.Subject<ShaderState>
	},
	target: webgl.Target
}

interface ShaderState {
	bulbs: {
		positionModelView: math.Vector3,
		positionWorld: math.Vector3
	}[],
	tweak: application.Tweak<Configuration>
}

const configuration = {
	moveLights: true,
	nbLights: ["0", ".1", "2", "3"],
	useAmbient: true,
	useDiffuse: false,
	useSpecular: false,
	useNormalMap: false,
	useHeightMap: false
};

const prepare = async (tweak: application.Tweak<Configuration>) => {
	const runtime = application.runtime(display.WebGLScreen);
	const gl = runtime.screen.context;

	const renderer = new webgl.Renderer(gl);

	const bulbModel = await model.fromOBJ("./res/model/sphere.obj", { scale: { xx: 0.2, yy: 0.2, zz: 0.2 } });
	const bulbShader = new webgl.Shader<ShaderState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/basic-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/basic-fragment.glsl")
	);

	bulbShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);

	bulbShader.bindMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelViewMatrix);
	bulbShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);

	const cubeModel = await model.fromJSON("./res/model/cube.json");
	const cubeShader = new webgl.Shader<ShaderState>(
		gl,
		await io.readURL(io.StringFormat, "./res/shader/forward-vertex.glsl"),
		await io.readURL(io.StringFormat, "./res/shader/forward-fragment.glsl")
	);

	cubeShader.bindAttribute("coords", 2, gl.FLOAT, mesh => mesh.coords);
	cubeShader.bindAttribute("normals", 3, gl.FLOAT, mesh => mesh.normals);
	cubeShader.bindAttribute("points", 3, gl.FLOAT, mesh => mesh.points);
	cubeShader.bindAttribute("tangents", 3, gl.FLOAT, mesh => mesh.tangents);

	cubeShader.bindGlobalProperty("useAmbient", gl => gl.uniform1i, state => state.tweak.useAmbient);
	cubeShader.bindGlobalProperty("useDiffuse", gl => gl.uniform1i, state => state.tweak.useDiffuse);
	cubeShader.bindGlobalProperty("useHeightMap", gl => gl.uniform1i, state => state.tweak.useHeightMap);
	cubeShader.bindGlobalProperty("useNormalMap", gl => gl.uniform1i, state => state.tweak.useNormalMap);
	cubeShader.bindGlobalProperty("useSpecular", gl => gl.uniform1i, state => state.tweak.useSpecular);

	cubeShader.bindMatrix("modelViewMatrix", gl => gl.uniformMatrix4fv, transform => transform.modelViewMatrix);
	cubeShader.bindMatrix("normalMatrix", gl => gl.uniformMatrix3fv, transform => transform.normalMatrix);
	cubeShader.bindMatrix("projectionMatrix", gl => gl.uniformMatrix4fv, transform => transform.projectionMatrix);

	cubeShader.bindMaterialProperty("ambientColor", gl => gl.uniform4fv, material => material.ambientColor);
	cubeShader.bindMaterialTexture("ambientMap", material => material.ambientMap);
	cubeShader.bindMaterialProperty("diffuseColor", gl => gl.uniform4fv, material => material.diffuseColor);
	cubeShader.bindMaterialTexture("diffuseMap", material => material.diffuseMap);
	cubeShader.bindMaterialTexture("heightMap", material => material.heightMap);
	cubeShader.bindMaterialTexture("normalMap", material => material.normalMap);
	cubeShader.bindMaterialTexture("reflectionMap", material => material.reflectionMap);
	cubeShader.bindMaterialProperty("shininess", gl => gl.uniform1f, material => material.shininess);
	cubeShader.bindMaterialProperty("specularColor", gl => gl.uniform4fv, material => material.specularColor);
	cubeShader.bindMaterialTexture("specularMap", material => material.specularMap);

	const bulbs = [0, 1, 2].map(i => ({
		positionModelView: { x: 0, y: 0, z: 0 },
		positionWorld: { x: 0, y: 0, z: 0 }
	}));

	for (const index of [0, 1, 2]) {
		cubeShader.bindGlobalProperty("light" + index + ".enabled", gl => gl.uniform1i, state => index < state.tweak.nbLights ? 1 : 0);
		cubeShader.bindGlobalProperty("light" + index + ".position", gl => gl.uniform3fv, state => {
			const position = state.bulbs[index].positionModelView;

			return [position.x, position.y, position.z];
		});
	}

	return {
		camera: {
			position: { x: 0, y: 0, z: -5 },
			rotation: { x: 0, y: 0, z: 0 }
		},
		input: runtime.input,
		light: {
			bulbs: bulbs,
			tweak: tweak
		},
		move: 0,
		subjects: {
			bulb: {
				meshes: renderer.load(bulbModel),
				shader: bulbShader
			},
			cube: {
				meshes: renderer.load(cubeModel),
				shader: cubeShader
			}
		},
		target: webgl.Target.createScreen(gl, runtime.screen.getWidth(), runtime.screen.getHeight())
	};
};

const render = (state: SceneState) => {
	const camera = state.camera;
	const light = state.light;
	const subjects = state.subjects;
	const target = state.target;

	const view = math.Matrix
		.createIdentity()
		.translate(camera.position)
		.rotate({ x: 1, y: 0, z: 0 }, camera.rotation.x)
		.rotate({ x: 0, y: 1, z: 0 }, camera.rotation.y)

	// Set uniforms
	for (const bulb of light.bulbs) {
		bulb.positionModelView = view.transform({
			x: bulb.positionWorld.x,
			y: bulb.positionWorld.y,
			z: bulb.positionWorld.z,
			w: 1
		});
	}

	// Draw scene
	const bulbs = light.bulbs.slice(0, light.tweak.nbLights).map(bulb => ({
		modelView: view.translate(bulb.positionWorld),
		subject: state.subjects.bulb
	}));

	const cube = [{
		modelView: view,
		subject: state.subjects.cube
	}];

	target.draw(bulbs.concat(cube), light);
};

const update = (state: SceneState, dt: number) => {
	// Move camera
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

	// Update light bulb positions
	const light = state.light;

	if (light.tweak.moveLights) {
		state.move += dt * 0.00003;
	}

	for (let i = 0; i < light.bulbs.length; ++i) {
		const pitch = state.move * (((i + 1) * 17) % 23);
		const yaw = state.move * (((i + 1) * 7) % 13);

		light.bulbs[i].positionWorld = math.Vector.scale3({
			x: Math.cos(yaw) * Math.cos(pitch),
			y: Math.sin(yaw) * Math.cos(pitch),
			z: Math.sin(pitch)
		}, 2);
	}
};

const scenario = {
	configuration: configuration,
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
