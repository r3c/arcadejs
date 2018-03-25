import * as controller from "./controller";
import * as display from "./display";

interface Process {
	start: () => Promise<void>,
	step: (dt: number) => void
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
	const update = () => change(checkbox.checked ? 1 : 0);

	container.appendChild(checkbox);
	container.appendChild(document.createTextNode(caption));
	container.className = 'container';

	checkbox.checked = value !== 0;
	checkbox.onchange = update;
	checkbox.type = "checkbox";

	update();

	return container;
};

const createSelect = (caption: string, choices: string[], value: number, change: (value: number) => void) => {
	const container = document.createElement("span");
	const select = document.createElement("select");
	const update = () => change(select.selectedIndex);

	container.appendChild(select);

	if (caption !== "")
		container.appendChild(document.createTextNode(caption));

	container.className = 'container';

	select.onchange = update;

	for (let i = 0; i < choices.length; ++i) {
		const option = document.createElement("option");

		option.selected = i === value;
		option.text = choices[i];

		select.options.add(option);
	}

	update();

	return container;
};

const declare = <TConfiguration, TState>(scene: Scenario<TConfiguration, TState>) => {
	let state: TState;

	return {
		start: async () => {
			state = await scene.prepare(configure(scene.configuration || <TConfiguration>{}));
		},
		step: (dt: number) => {
			scene.update(state, dt);

			setTimeout(() => scene.render(state), 0);
		}
	};
};

const initialize = (processes: { [name: string]: Process }) => {
	const frameContainer = document.getElementById("frames");

	if (frameContainer === null)
		throw Error("missing frame container");

	const sceneContainer = document.getElementById("scenes");

	if (sceneContainer === null)
		throw Error("missing scene container");

	let frames = 0;
	let elapsed = 0;
	let step: ((dt: number) => void) | undefined = undefined;
	let time = new Date().getTime();

	const enable = (value: number) => {
		const name = Object.keys(processes)[value];
		const process = processes[name];

		step = undefined;

		if (process !== undefined) {
			process
				.start()
				.then(() => step = process.step);
		}
	};

	const tick = () => {
		const now = new Date().getTime();
		const dt = now - time;

		elapsed += dt;
		time = now;

		if (step !== undefined)
			step(Math.min(dt, 1000));

		if (elapsed > 1000) {
			frameContainer.innerText = Math.round(frames * 1000 / elapsed) + ' fps';

			elapsed = 0;
			frames = 0;
		}

		++frames;

		window.requestAnimationFrame(tick);
	};

	sceneContainer.appendChild(createSelect("", Object.keys(processes), 0, enable));

	tick();
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

export { Tweak, initialize, declare, runtime };
