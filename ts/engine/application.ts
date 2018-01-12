import * as controller from "./controller";
import * as display from "./display";

interface Scene {
	enable: () => void,
	render: () => void,
	update: (dt: number) => void
}

interface SceneMap {
	[id: string]: Scene
}

const button = document.getElementById("button");

if (button === null)
	throw Error("missing button container");

const render = document.getElementById("render");

if (render === null)
	throw Error("missing screen container");

let current: number | undefined;
const screen2d = new display.Context2DScreen(render);
const screen3d = new display.WebGLScreen(render);
const input = new controller.Input(render);

const enable = (scene: Scene) => {
	if (current !== undefined)
		clearInterval(current);

	scene.enable ();

	let time = new Date().getTime();

	current = setInterval(() => {
		const now = new Date().getTime();

		scene.update(now - time);

		time = now;

		setTimeout(scene.render, 0);
	}, 30);
};

const initialize = (scenes: SceneMap) => {
	for (const id in scenes) {
		const input = document.createElement("input");
		const scene = scenes[id];
	
		input.onclick = () => enable(scene);
		input.type = 'button';
		input.value = id;
	
		button.appendChild(input);
	}

	show(undefined);
};

const show = (show: display.Screen | undefined) => {
	for (const hide of [screen2d, screen3d])
		hide.canvas.style.display = 'none';

	if (show !== undefined)
		show.canvas.style.display = 'block';
};

export { input, screen2d, screen3d, initialize, show };
