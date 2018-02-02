import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_texture";

type Scene = (dt: number) => void;

interface SceneMap {
	[id: string]: Scene
};

var current: number | undefined;

const scenes: SceneMap = {
	"perspective": s01.tick,
	"transform": s02.tick,
	"texture": s03.tick
};

const setup = (scene: Scene) => {
	if (current !== undefined)
		clearInterval(current);

	let last = new Date().getTime();

	current = setInterval(() => {
		const now = new Date().getTime();

		scene(now - last);

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

setup(s01.tick);
