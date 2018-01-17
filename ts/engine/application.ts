import * as controller from "./controller";

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

interface Process {
	name: string,
	start: () => Promise<void>,
	tick: (dt: number) => void
}

interface RuntimeScreen<T> {
	new (container: HTMLElement): T
}

class Runtime<T> {
	public readonly input: controller.Input;
	public readonly screen: T;

	public constructor(screenConstructor: RuntimeScreen<T>) {
		const container = document.getElementById("screens");

		if (container === null)
			throw Error("missing screen container");

		while (container.childNodes.length > 0)
			container.removeChild(container.childNodes[0]);

		this.input = new controller.Input(container);
		this.screen = new screenConstructor(container);
	}
}

interface Scenario<T> {
	definitions?: DefinitionMap,
	enable: () => Promise<T>,
	render: (state: T) => void,
	update?: (state: T, options: OptionMap, dt: number) => void
}

const configure = (definitions: DefinitionMap) => {
	const tweakContainer = document.getElementById("tweaks");

	if (tweakContainer === null)
		throw Error("missing tweak container");

	while (tweakContainer.childNodes.length > 0)
		tweakContainer.removeChild(tweakContainer.childNodes[0]);

	const options: OptionMap = {};

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

	return options;
};

const createCheckbox = (caption: string, value: number, change: (value: number) => void) => {
	const container = document.createElement("div");
	const checkbox = document.createElement("input");

	container.appendChild(checkbox);
	container.appendChild(document.createTextNode(caption));

	checkbox.checked = value !== 0;
	checkbox.onchange = () => change(checkbox.checked ? 1 : 0);
	checkbox.type = "checkbox";

	return container;
};

const createSelect = (choices: string[], value: number, change: (value: number) => void) => {
	const container = document.createElement("div");
	const select = document.createElement("select");
	const submit = document.createElement("input");

	container.appendChild(select);
	container.appendChild(submit);

	submit.onclick = () => change(select.selectedIndex);
	submit.type = "button";
	submit.value = "OK";

	for (let i = 0; i < choices.length; ++i) {
		const option = document.createElement("option");

		option.selected = i === value;
		option.text = choices[i];

		select.options.add(option);
	}

	return container;
};

const initialize = (processes: Process[]) => {
	const sceneContainer = document.getElementById("scenes");

	if (sceneContainer === null)
		throw Error("missing scene container");

	let tick: ((dt: number) => void) | undefined = undefined;
	let time = new Date().getTime();

	sceneContainer.appendChild(createSelect(processes.map(p => p.name), 0, value => {
		const process = processes[value];

		tick = undefined;

		process
			.start()
			.then(() => tick = process.tick);
	}));

	return setInterval(() => {
		const now = new Date().getTime();
	
		if (tick !== undefined)
			tick(now - time);
	
		time = now;
	}, 30);
};

function prepare<T>(name: string, scene: Scenario<T>) {
	let options: OptionMap;
	let state: T;

	return {
		name: name,
		start: async () => {
			options = configure(scene.definitions || {});
			state = await scene.enable();
		},
		tick: (dt: number) => {
			if (scene.update !== undefined)
				scene.update(state, options, dt);
	
			setTimeout(() => scene.render(state), 0);
		}
	};
}

function runtime<T>(screenConstructor: RuntimeScreen<T>) {
	return new Runtime<T>(screenConstructor);
}

export { DefinitionType, OptionMap, initialize, prepare, runtime };
