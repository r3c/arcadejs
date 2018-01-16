import * as controller from "./controller";
import * as display from "./display";

enum DefinitionType {
	Checkbox,
	Select
}

interface Definition {
	caption: string
	choices?: string[],
	default: number,
	type: DefinitionType
}

interface DefinitionMap {
	[key: string]: Definition
}

interface OptionMap {
	[key: string]: number
}

interface Scene {
	caption: string,
	enable: () => DefinitionMap,
	render: () => void,
	update: (options: OptionMap, dt: number) => void
}

const sceneContainer = document.getElementById("scenes");

if (sceneContainer === null)
	throw Error("missing scene container");

const screenContainer = document.getElementById("screens");

if (screenContainer === null)
	throw Error("missing screen container");

const tweakContainer = document.getElementById("tweaks");

if (tweakContainer === null)
	throw Error("missing tweak container");

let current: number | undefined;
const screen2d = new display.Context2DScreen(screenContainer);
const screen3d = new display.WebGLScreen(screenContainer);
const input = new controller.Input(screenContainer);

const createCheckbox = (caption: string, value: number, change: (value: number) => void) => {
	const checkbox = document.createElement("input");
	const wrapper = document.createElement("div");

	checkbox.checked = value !== 0;
	checkbox.onchange = () => change(checkbox.checked ? 1 : 0);
	checkbox.type = "checkbox";

	wrapper.appendChild(checkbox);
	wrapper.appendChild(document.createTextNode(caption));

	return wrapper;
};

const createSelect = (choices: string[], value: number, change: (value: number) => void) => {
	const select = document.createElement("select");

	for (let i = 0; i < choices.length; ++i) {
		const option = document.createElement("option");

		option.selected = i === value;
		option.text = choices[i];

		select.options.add(option);
	}

	select.onchange = () => change(select.selectedIndex);

	return select;
};

const enable = (scene: Scene) => {
	if (current !== undefined)
		clearInterval(current);

	// Convert definitions into options and append to document
	const definitions = scene.enable();
	const options: OptionMap = {};

	while (tweakContainer.childNodes.length > 0)
		tweakContainer.removeChild(tweakContainer.childNodes[0]);

	for (const key in definitions) {
		const definition = definitions[key];
		const change = (value: number) => options[key] = value;

		switch (definition.type) {
			case DefinitionType.Checkbox:
				tweakContainer.appendChild(createCheckbox(definition.caption, definition.default, change));

				break;

			case DefinitionType.Select:
				tweakContainer.appendChild(createSelect(definition.choices || [], definition.default, change));

				break;
		}

		options[key] = definition.default;
	}

	// Start main loop
	let time = new Date().getTime();

	current = setInterval(() => {
		const now = new Date().getTime();

		scene.update(options, now - time);

		time = now;

		setTimeout(scene.render, 0);
	}, 30);
};

const setup = (scenes: Scene[]) => {
	const submit = document.createElement("input");
	const select = createSelect(scenes.map(s => s.caption), 0, value => {});

	submit.onclick = () => enable(scenes[select.selectedIndex]);
	submit.type = "button";
	submit.value = "OK";

	sceneContainer.appendChild(select);
	sceneContainer.appendChild(submit);

	show(undefined);
};

const show = (show: display.Screen | undefined) => {
	for (const hide of [screen2d, screen3d])
		hide.canvas.style.display = 'none';

	if (show !== undefined)
		show.canvas.style.display = 'block';
};

export { DefinitionType, OptionMap, input, screen2d, screen3d, setup, show };
