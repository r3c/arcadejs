import { Screen } from "./graphic/display";

interface Application {
  change: (callback: (screen: Screen) => void) => void;
  start: () => Promise<void>;
  step: (dt: number) => void;
  stop: () => void;
  title: string;
}

interface Runtime<TScreen extends Screen, TState> {
  prepare: (screen: TScreen) => Promise<TState>;
  render: (state: TState) => void;
  resize: (state: TState, screen: TScreen) => void;
  update: (state: TState, dt: number) => void;
}

interface ScreenConstructor<TScreen extends Screen> {
  new (container: HTMLElement): TScreen;
}

type Tweak<T> = {
  [P in keyof T]: number;
};

const canonicalize = (name: string): string => {
  return name.toLowerCase().replaceAll(/[^-0-9a-z]/g, "-");
};

const configure = <T>(configuration: T) => {
  const tweakContainer = document.getElementById("tweaks");

  if (tweakContainer === null) {
    throw Error("missing tweak container");
  }

  while (tweakContainer.childNodes.length > 0) {
    tweakContainer.removeChild(tweakContainer.childNodes[0]);
  }

  const tweak = {} as Tweak<T>;

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

  if (caption !== "") {
    container.appendChild(document.createTextNode(caption));
  }

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

const declare = <TScreen extends Screen, TState>(
  title: string,
  screenConstructor: ScreenConstructor<TScreen>,
  runtime: Runtime<TScreen, TState>
): Application => {
  let memory:
    | { screen: TScreen; state: TState; x: number; y: number }
    | undefined = undefined;

  return {
    title,
    change: (callback: (screen: Screen) => void) => {
      if (memory !== undefined) {
        callback(memory.screen);
      }
    },
    start: async () => {
      const container = document.getElementById("screens");

      if (container === null) {
        throw Error("missing screen container");
      }

      while (container.childNodes.length > 0) {
        container.removeChild(container.childNodes[0]);
      }

      const screen = new screenConstructor(container);
      const state = await runtime.prepare(screen);

      memory = { screen, state, x: 0, y: 0 };
    },
    step: (dt: number) => {
      if (memory === undefined) {
        return;
      }

      const { screen, state, x, y } = memory;
      const { render, resize, update } = runtime;

      // FIXME: detect canvas resize [canvas-resize]
      if (screen.getWidth() !== x || screen.getHeight() !== y) {
        resize?.(state, screen);

        memory.x = screen.getWidth();
        memory.y = screen.getHeight();
      }

      update(state, dt);

      setTimeout(() => render(state), 0);
    },
    stop: () => {
      memory = undefined;
    },
  };
};

const run = (applications: Application[]) => {
  const frameContainer = document.getElementById("frames");

  if (frameContainer === null) {
    throw Error("missing frame container");
  }

  const sceneContainer = document.getElementById("scenes");

  if (sceneContainer === null) {
    throw Error("missing scene container");
  }

  let current: Application | undefined;
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
    const application = applications[value];

    if (current !== undefined) {
      current.stop();
      current = undefined;
    }

    if (application === undefined) {
      location.hash = "";

      return;
    }

    location.hash = `#${encodeURIComponent(canonicalize(application.title))}`;

    await application.start();

    current = application;
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

  const hashTitle = decodeURIComponent(location.hash.substring(1));
  const hashValue = Math.max(
    applications.findIndex(({ title }) => canonicalize(title) === hashTitle),
    0
  );

  sceneContainer.appendChild(createButton("Fullscreen", fullscreen));
  sceneContainer.appendChild(
    createSelect(
      "",
      applications.map(({ title }) => title),
      hashValue,
      select
    )
  );

  tick();
};

export { type Runtime, type Tweak, configure, declare, run };
