import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_colorize";
import * as s04 from "./scene/s04_texturize";
import * as s05 from "./scene/s05_webgl";

type Scene = {
	focus: () => void,
	tick: (dt: number) => void
};

interface SceneMap {
	[id: string]: Scene
};

var current: number | undefined;

const scenes: SceneMap = {
	"perspective": s01.scene,
	"transform": s02.scene,
	"colorize": s03.scene,
	"texturize": s04.scene,
	"webgl": s05.scene
};

const setup = (scene: Scene) => {
	scene.focus ();

	if (current !== undefined)
		clearInterval(current);

	let last = new Date().getTime();

	current = setInterval(() => {
		const now = new Date().getTime();

		scene.tick (now - last);

		last = now;
	}, 30);
};

const container = document.getElementById("button");

if (container === null)
	throw new Error("missing button container");

for (const id in scenes) {
	const input = document.createElement("input");
	const scene = scenes[id];

	input.onclick = () => setup(scene);
	input.type = 'button';
	input.value = id;

	container.appendChild(input);
}

setup(s01.scene);
