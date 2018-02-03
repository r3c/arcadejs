import * as controller from "./controller";
import * as display from "./display";

interface Process {
	name: string,
	start: () => Promise<void>,
	tick: (dt: number) => void
}

interface Runtime<T extends display.Screen> {
	input: controller.Input,
	screen: T
}

interface ScreenConstructor<T> {
	new(container: HTMLElement): T
}

type Tweak<T> = {
	[P in keyof T]: number
};

interface Scenario<TConfiguration, TState> {
	configuration?: TConfiguration,
	prepare: (tweak: Tweak<TConfiguration>) => Promise<TState>,
	render: (state: TState) => void,
	update: (state: TState, dt: number) => void
}

const configure = <T>(configuration: T) => {
	const tweakContainer = document.getElementById("tweaks");

	if (tweakContainer === null)
		throw Error("missing tweak container");

	while (tweakContainer.childNodes.length > 0)
		tweakContainer.removeChild(tweakContainer.childNodes[0]);

	const tweak = <Tweak<T>>{};

	for (const key in configuration) {
		const property = configuration[key];
		const change = (value: number) => tweak[key] = value;

		let defaultValue: number;
		let tweakElement: HTMLElement;

		switch (typeof property) {
			case "boolean":
				defaultValue = property ? 1 : 0;
				tweakElement = createCheckbox(key, defaultValue, change);

				break;

			case "object":
				const choices = <string[]><any>property;

				defaultValue = Math.max(choices.findIndex(choice => choice.startsWith(".")), 0);
				tweakElement = createSelect(key, choices.map(choice => choice.startsWith(".") ? choice.slice(1) : choice), defaultValue, change);

				break;

			default:
				throw Error(`invalid configuration for key "${key}"`);
		}

		tweakContainer.appendChild(tweakElement);
		tweak[key] = defaultValue;
	}

	return tweak;
};

const createCheckbox = (caption: string, value: number, change: (value: number) => void) => {
	const container = document.createElement("span");
	const checkbox = document.createElement("input");

	container.appendChild(checkbox);
	container.appendChild(document.createTextNode(caption));
	container.className = 'container';

	checkbox.checked = value !== 0;
	checkbox.onchange = () => change(checkbox.checked ? 1 : 0);
	checkbox.type = "checkbox";

	return container;
};

const createSelect = (caption: string, choices: string[], value: number, change: (value: number) => void) => {
	const container = document.createElement("span");
	const select = document.createElement("select");

	container.appendChild(select);

	if (caption !== "")
		container.appendChild(document.createTextNode(caption));

	container.className = 'container';

	select.onchange = () => change(select.selectedIndex);

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

	sceneContainer.appendChild(createSelect("", processes.map(p => p.name), 0, value => {
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

const prepare = <TConfiguration, TState>(name: string, scene: Scenario<TConfiguration, TState>) => {
	let state: TState;

	return {
		name: name,
		start: async () => {
			state = await scene.prepare(configure(scene.configuration || <TConfiguration>{}));
		},
		tick: (dt: number) => {
			scene.update(state, dt);

			setTimeout(() => scene.render(state), 0);
		}
	};
};

const runtime = <T extends display.Screen>(screenConstructor: ScreenConstructor<T>) => {
	const container = document.getElementById("screens");

	if (container === null)
		throw Error("missing screen container");

	while (container.childNodes.length > 0)
		container.removeChild(container.childNodes[0]);

	return {
		input: new controller.Input(container),
		screen: new screenConstructor(container)
	};
};

export { Tweak, initialize, prepare, runtime };
