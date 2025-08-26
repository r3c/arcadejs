import { Screen } from "./graphic/display";
import { Vector2 } from "./math/vector";

type Application<TScreen extends Screen, TState, TSetup> = {
  change: (state: TState, setup: ApplicationSetup<TSetup>) => Promise<void>;
  create: (screen: TScreen) => Promise<TState>;
  render: (state: TState) => void;
  resize: (state: TState, size: Vector2) => void;
  update: (state: TState, dt: number) => void;
};

type ApplicationConfiguration<T extends object> = {
  [key in keyof T]: ApplicationWidget<unknown>;
};

type ApplicationSetup<T> = {
  [key in keyof T]: T[key] extends ApplicationWidget<infer TValue>
    ? TValue
    : never;
};

type ApplicationWidget<T> = {
  createElement: (onChange: (value: T) => void) => HTMLElement;
  defaultValue: T;
};

type Process = {
  requestFullscreen: () => void;
  start: () => Promise<void>;
  step: (dt: number) => void;
  stop: () => void;
  title: string;
};

interface ScreenConstructor<TScreen extends Screen> {
  new (container: HTMLElement): TScreen;
}

const canonicalize = (name: string): string => {
  return name
    .toLowerCase()
    .replaceAll(/[^-0-9a-z]/g, "-")
    .replaceAll(/^-+|-+$/g, "");
};

const configure = <T extends object>(
  configuration: ApplicationConfiguration<T>,
  change: (setup: ApplicationSetup<T>) => void
): ApplicationSetup<T> => {
  const container = document.getElementById("setup");

  if (container === null) {
    throw Error("missing setup container");
  }

  while (container.childNodes.length > 0) {
    container.removeChild(container.childNodes[0]);
  }

  const entries = Object.entries<ApplicationWidget<unknown>>(configuration);
  const setup: any = {};

  for (const [key, { createElement, defaultValue }] of entries) {
    setup[key] = defaultValue;

    const element = createElement((value: any) => {
      setup[key] = value;

      change(setup);
    });

    container.appendChild(element);
  }

  return setup;
};

const createButton = (caption: string): ApplicationWidget<void> => ({
  createElement: (onChange) => {
    const element = document.createElement("input");

    element.onclick = () => onChange();
    element.type = "button";
    element.value = caption;

    return element;
  },

  defaultValue: undefined,
});

const createCheckbox = (
  caption: string,
  defaultValue: boolean
): ApplicationWidget<boolean> => ({
  createElement: (onChange) => {
    const checkbox = document.createElement("input");
    const element = document.createElement("span");
    const update = () => onChange(checkbox.checked);

    element.appendChild(checkbox);
    element.appendChild(document.createTextNode(caption));
    element.className = "container";

    checkbox.checked = defaultValue;
    checkbox.onchange = update;
    checkbox.type = "checkbox";

    return element;
  },

  defaultValue,
});

const createSelect = (
  caption: string | undefined,
  options: string[],
  defaultValue: number
): ApplicationWidget<number> => ({
  createElement: (onChange) => {
    const element = document.createElement("span");
    const select = document.createElement("select");
    const update = () => onChange(select.selectedIndex);

    element.appendChild(select);

    if (caption !== undefined) {
      element.appendChild(document.createTextNode(caption));
    }

    element.className = "container";
    select.onchange = update;

    for (let i = 0; i < options.length; ++i) {
      const option = document.createElement("option");

      option.selected = i === defaultValue;
      option.text = options[i];

      select.options.add(option);
    }

    return element;
  },

  defaultValue,
});

const declare = <TScreen extends Screen, TState, TSetup extends object>(
  title: string,
  screenConstructor: ScreenConstructor<TScreen>,
  configuration: ApplicationConfiguration<TSetup>,
  application: Application<TScreen, TState, TSetup>
): Process => {
  let runtime:
    | { screen: TScreen; state: TState; setup: ApplicationSetup<TSetup> }
    | undefined = undefined;

  const { change, create, render, resize, update } = application;

  return {
    requestFullscreen: () => runtime?.screen.requestFullscreen(),
    start: async () => {
      const container = document.getElementById("screen");

      if (container === null) {
        throw Error("missing screen container");
      }

      while (container.childNodes.length > 0) {
        container.removeChild(container.childNodes[0]);
      }

      const screen = new screenConstructor(container);
      const state = await create(screen);
      const setup = configure(configuration, (setup) => change(state, setup));

      await change(state, setup);

      screen.addResizeHandler((size) => resize(state, size));

      runtime = { screen, state, setup };
    },
    step: (dt: number) => {
      if (runtime === undefined) {
        return;
      }

      const { screen, state } = runtime;

      screen.resize();

      update(state, dt);
      requestAnimationFrame(() => render(state));
    },
    stop: () => {
      runtime = undefined;
    },
    title,
  };
};

const run = (applications: Process[]) => {
  const frameContainer = document.getElementById("frame");

  if (frameContainer === null) {
    throw Error("missing frame container");
  }

  const sceneContainer = document.getElementById("scene");

  if (sceneContainer === null) {
    throw Error("missing scene container");
  }

  const hashTitle = decodeURIComponent(location.hash.substring(1));
  const hashValue = Math.max(
    applications.findIndex(({ title }) => canonicalize(title) === hashTitle),
    0
  );

  let current: Process | undefined;
  let elapsed = 0;
  let frames = 0;
  let then = 0;

  const expanderWidget = createButton("Fullscreen");
  const expander = expanderWidget.createElement(() =>
    current?.requestFullscreen()
  );

  const selectorOptions = applications.map(({ title }) => title);
  const selectorWidget = createSelect(undefined, selectorOptions, hashValue);
  const selector = selectorWidget.createElement(async (value: number) => {
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
  });

  const tick = (time: number) => {
    window.requestAnimationFrame(tick);

    const dt = time - then;

    elapsed += dt;
    then = time;

    if (current !== undefined) {
      current.step(Math.min(dt, 1000));
    }

    if (elapsed > 1000) {
      frameContainer.innerText = `${Math.round((frames * 1000) / elapsed)} fps`;

      elapsed = 0;
      frames = 0;
    }

    ++frames;
  };

  sceneContainer.appendChild(expander);
  sceneContainer.appendChild(selector);

  tick(0);
};

export {
  type Application,
  type ApplicationConfiguration,
  type ApplicationSetup,
  type ApplicationWidget,
  createCheckbox,
  createSelect,
  declare,
  run,
};
