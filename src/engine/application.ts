import * as controller from "./io/controller";
import * as display from "./display";

interface Process {
  change: (callback: (screen: display.Screen) => void) => void;
  start: () => Promise<void>;
  step: (dt: number) => void;
}

interface Runtime<TScreen extends display.Screen, TState> {
  input: controller.Input;
  screen: TScreen;
  size: { x: number; y: number };
  state: TState;
}

interface Scenario<TScreen extends display.Screen, TState> {
  prepare: () => Promise<Runtime<TScreen, TState>>;
  render?: (state: TState) => void;
  resize?: (state: TState, screen: TScreen) => void;
  update?: (state: TState, dt: number) => void;
}

interface ScreenConstructor<T> {
  new (container: HTMLElement): T;
}

type StateConstructor<
  TScreen extends display.Screen,
  TState,
  TConfiguration
> = (
  screen: TScreen,
  input: controller.Input,
  tweak: Tweak<TConfiguration>
) => Promise<TState>;

type Tweak<T> = {
  [P in keyof T]: number;
};

const configure = <T>(configuration: T) => {
  const tweakContainer = document.getElementById("tweaks");

  if (tweakContainer === null) throw Error("missing tweak container");

  while (tweakContainer.childNodes.length > 0)
    tweakContainer.removeChild(tweakContainer.childNodes[0]);

  const tweak = <Tweak<T>>{};

  for (const key in configuration) {
    const property = configuration[key];
    const change = (value: number) => (tweak[key] = value);

    let defaultValue: number;
    let tweakElement: HTMLElement;

    switch (typeof property) {
      case "boolean":
        defaultValue = property ? 1 : 0;
        tweakElement = createCheckbox(key, defaultValue, change);

        break;

      case "object":
        const choices = <string[]>(<any>property);

        defaultValue = Math.max(
          choices.findIndex((choice) => choice.startsWith(".")),
          0
        );
        tweakElement = createSelect(
          key,
          choices.map((choice) =>
            choice.startsWith(".") ? choice.slice(1) : choice
          ),
          defaultValue,
          change
        );

        break;

      default:
        throw Error(`invalid configuration for key "${key}"`);
    }

    tweakContainer.appendChild(tweakElement);
    tweak[key] = defaultValue;
  }

  return tweak;
};

const createButton = (caption: string, click: () => void) => {
  const button = document.createElement("input");

  button.onclick = click;
  button.type = "button";
  button.value = caption;

  return button;
};

const createCheckbox = (
  caption: string,
  value: number,
  change: (value: number) => void
) => {
  const container = document.createElement("span");
  const checkbox = document.createElement("input");
  const update = () => change(checkbox.checked ? 1 : 0);

  container.appendChild(checkbox);
  container.appendChild(document.createTextNode(caption));
  container.className = "container";

  checkbox.checked = value !== 0;
  checkbox.onchange = update;
  checkbox.type = "checkbox";

  update();

  return container;
};

const createSelect = (
  caption: string,
  choices: string[],
  value: number,
  change: (value: number) => void
) => {
  const container = document.createElement("span");
  const select = document.createElement("select");
  const update = () => change(select.selectedIndex);

  container.appendChild(select);

  if (caption !== "") container.appendChild(document.createTextNode(caption));

  container.className = "container";

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

const declare = <TScreen extends display.Screen, TState>(
  scene: Scenario<TScreen, TState>
) => {
  let runtime: Runtime<TScreen, TState>;

  return {
    change: (callback: (screen: display.Screen) => void) => {
      callback(runtime.screen);
    },
    start: async () => {
      runtime = await scene.prepare();
    },
    step: (dt: number) => {
      const render = scene.render;
      const resize = scene.resize;
      const update = scene.update;

      // FIXME: detect canvas resize [canvas-resize]
      if (
        resize !== undefined &&
        (runtime.screen.getWidth() !== runtime.size.x ||
          runtime.screen.getHeight() !== runtime.size.y)
      ) {
        resize(runtime.state, runtime.screen);

        (<any>runtime.screen).resize(); // FIXME: encapsulation violation [canvas-resize]

        runtime.size = {
          x: runtime.screen.getWidth(),
          y: runtime.screen.getHeight(),
        };
      }

      if (update !== undefined) update(runtime.state, dt);

      if (render !== undefined) setTimeout(() => render(runtime.state), 0);
    },
  };
};

const initialize = (processes: { [name: string]: Process }) => {
  const frameContainer = document.getElementById("frames");

  if (frameContainer === null) {
    throw Error("missing frame container");
  }

  const sceneContainer = document.getElementById("scenes");

  if (sceneContainer === null) {
    throw Error("missing scene container");
  }

  let current: Process | undefined;
  let elapsed = 0;
  let frames = 0;
  let time = new Date().getTime();

  const fullscreen = () => {
    if (current === undefined) {
      return;
    }

    current.change((screen) => screen.goFullscreen());
  };

  const select = async (value: number) => {
    const name = Object.keys(processes)[value];
    const process = processes[name];

    current = undefined;

    if (process === undefined) {
      location.hash = "";

      return;
    }

    location.hash = `#${encodeURIComponent(name)}`;

    await process.start();

    current = process;
  };

  const tick = () => {
    const now = new Date().getTime();
    const dt = now - time;

    elapsed += dt;
    time = now;

    if (current !== undefined) {
      current.step(Math.min(dt, 1000));
    }

    if (elapsed > 1000) {
      frameContainer.innerText = Math.round((frames * 1000) / elapsed) + " fps";

      elapsed = 0;
      frames = 0;
    }

    ++frames;

    window.requestAnimationFrame(tick);
  };

  const names = Object.keys(processes);
  const hashName = decodeURIComponent(location.hash.substring(1));
  const hashValue = Math.max(
    names.findIndex((name) => name === hashName),
    0
  );

  sceneContainer.appendChild(createButton("Fullscreen", fullscreen));
  sceneContainer.appendChild(createSelect("", names, hashValue, select));

  tick();
};

const runtime = async <TScreen extends display.Screen, TState, TConfiguration>(
  screenConstructor: ScreenConstructor<TScreen>,
  configuration: TConfiguration,
  stateConstructor: StateConstructor<TScreen, TState, TConfiguration>
) => {
  const container = document.getElementById("screens");

  if (container === null) throw Error("missing screen container");

  while (container.childNodes.length > 0)
    container.removeChild(container.childNodes[0]);

  const input = new controller.Input(container);
  const screen = new screenConstructor(container);
  const state = await stateConstructor(screen, input, configure(configuration));

  return {
    input: input,
    screen: screen,
    size: { x: 0, y: 0 },
    state: state,
  };
};

export { Tweak, initialize, declare, runtime };
