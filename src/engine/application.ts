import { Screen } from "./graphic/display";
import { Vector2 } from "./math/vector";

type Application<TScreen extends Screen, TState, TTweak> = {
  prepare: (screen: TScreen) => Promise<TState>;
  render: (state: TState, tweak: Tweak<TTweak>) => void;
  resize: (state: TState, tweak: Tweak<TTweak>, size: Vector2) => void;
  update: (state: TState, tweak: Tweak<TTweak>, dt: number) => void;
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

type TweakConfiguration<T> = {
  [key in keyof T]: TweakWidget<unknown>;
};

type TweakWidget<T> = (onChange: (value: T) => void) => HTMLElement;

type Tweak<T> = {
  [key in keyof T]: T[key] extends TweakWidget<infer TValue> ? TValue : never;
};

const canonicalize = (name: string): string => {
  return name
    .toLowerCase()
    .replaceAll(/[^-0-9a-z]/g, "-")
    .replaceAll(/^-+|-+$/g, "");
};

const configure = <T>(configuration: TweakConfiguration<T>): Tweak<T> => {
  const container = document.getElementById("tweaks");

  if (container === null) {
    throw Error("missing tweak container");
  }

  while (container.childNodes.length > 0) {
    container.removeChild(container.childNodes[0]);
  }

  const tweak: any = {};

  for (const key in configuration) {
    tweak[key] = 0;

    const onChange = (value: any) => (tweak[key] = value);
    const element = configuration[key](onChange);

    container.appendChild(element);
  }

  return tweak;
};

const createButton =
  (caption: string): TweakWidget<void> =>
  (onChange) => {
    const element = document.createElement("input");

    element.onclick = () => onChange();
    element.type = "button";
    element.value = caption;

    return element;
  };

const createCheckbox =
  (caption: string, initial: boolean): TweakWidget<boolean> =>
  (onChange) => {
    const checkbox = document.createElement("input");
    const element = document.createElement("span");
    const update = () => onChange(checkbox.checked);

    element.appendChild(checkbox);
    element.appendChild(document.createTextNode(caption));
    element.className = "container";

    checkbox.checked = initial;
    checkbox.onchange = update;
    checkbox.type = "checkbox";

    update();

    return element;
  };

const createSelect =
  (
    caption: string | undefined,
    options: string[],
    initial: number
  ): TweakWidget<number> =>
  (onChange) => {
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

      option.selected = i === initial;
      option.text = options[i];

      select.options.add(option);
    }

    update();

    return element;
  };

const declare = <TScreen extends Screen, TState, TTweak>(
  title: string,
  screenConstructor: ScreenConstructor<TScreen>,
  configuration: TweakConfiguration<TTweak>,
  application: Application<TScreen, TState, TTweak>
): Process => {
  let runtime:
    | { screen: TScreen; state: TState; tweak: Tweak<TTweak> }
    | undefined = undefined;

  const { prepare, render, resize, update } = application;

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
      const state = await prepare(screen);
      const tweak = configure(configuration);

      screen.addResizeHandler((size) => resize(state, tweak, size));

      runtime = { screen, state, tweak };
    },
    step: (dt: number) => {
      if (runtime === undefined) {
        return;
      }

      const { screen, state, tweak } = runtime;

      screen.resize();

      update(state, tweak, dt);
      requestAnimationFrame(() => render(state, tweak));
    },
    stop: () => {
      runtime = undefined;
    },
    title,
  };
};

const run = (applications: Process[]) => {
  const debugContainer = document.getElementById("debug");

  if (debugContainer === null) {
    throw Error("missing debug container");
  }

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

  const expanderBuilder = createButton("Fullscreen");
  const expander = expanderBuilder(() => current?.requestFullscreen());

  const inspectorBuilder = createButton("Debug");
  const inspector = inspectorBuilder(
    () =>
      (debugContainer.style.display =
        debugContainer.style.display === "block" ? "none" : "block")
  );

  const selectorOptions = applications.map(({ title }) => title);
  const selectorBuilder = createSelect(undefined, selectorOptions, hashValue);
  const selector = selectorBuilder(async (value: number) => {
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
  sceneContainer.appendChild(inspector);
  sceneContainer.appendChild(selector);

  tick(0);
};

export {
  type Application,
  type Tweak,
  type TweakConfiguration,
  type TweakWidget,
  createCheckbox,
  createSelect,
  declare,
  run,
};
