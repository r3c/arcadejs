import { Releasable } from "./io/resource";
import { Screen, ScreenConstructor } from "./graphic/screen";
import { Vector2 } from "./math/vector";
import { createGamepad, Gamepad } from "./io/gamepad";

type Application<TConfiguration, TState> = Releasable & {
  configure: (configuration: TConfiguration) => Promise<TState>;
  render: (state: TState) => void;
  resize: (state: TState, size: Vector2) => void;
  update: (state: TState, dt: number) => void;
};

type ApplicationConstructor<TContext, TConfiguration, TState> = (
  screen: Screen<TContext>,
  gamepad: Gamepad,
) => Promise<Application<TConfiguration, TState>>;

type ApplicationConfigurator<TConfiguration> = {
  [key in keyof TConfiguration]: ApplicationWidget<TConfiguration[key]>;
};

type ApplicationWidget<T> = {
  createElement: (onChange: (value: T) => void) => HTMLElement;
  defaultValue: T;
};

type Process = {
  fullscreen: () => void;
  start: () => Promise<void>;
  step: (dt: number) => void;
  stop: () => void;
  title: string;
};

const bindConfigurator = <T>(
  configurator: ApplicationConfigurator<T>,
  configure: (configuration: T) => Promise<void>,
): T => {
  const container = document.getElementById("configuration");

  if (container === null) {
    throw Error("missing configuration container");
  }

  while (container.childNodes.length > 0) {
    container.removeChild(container.childNodes[0]);
  }

  const entries = Object.entries<ApplicationWidget<unknown>>(configurator);
  const configuration: any = {};

  for (const [key, { createElement, defaultValue }] of entries) {
    configuration[key] = defaultValue;

    const element = createElement((value: any) => {
      configuration[key] = value;

      configure(configuration);
    });

    container.appendChild(element);
  }

  return configuration;
};

const canonicalize = (name: string): string => {
  return name
    .toLowerCase()
    .replaceAll(/[^-0-9a-z]/g, "-")
    .replaceAll(/^-+|-+$/g, "");
};

const createButton = (
  caption: string | undefined,
  action: string,
): ApplicationWidget<void> => ({
  createElement: (onChange) => {
    const button = document.createElement("input");

    button.onclick = () => onChange();
    button.type = "button";
    button.value = action;

    return createField(caption, button);
  },

  defaultValue: undefined,
});

const createCheckbox = (
  caption: string | undefined,
  defaultValue: boolean,
): ApplicationWidget<boolean> => ({
  createElement: (onChange) => {
    const checkbox = document.createElement("input");

    checkbox.checked = defaultValue;
    checkbox.onchange = () => onChange(checkbox.checked);
    checkbox.type = "checkbox";

    return createField(caption, checkbox);
  },

  defaultValue,
});

const createField = (
  caption: string | undefined,
  widget: HTMLElement,
): HTMLElement => {
  const field = document.createElement("span");

  if (caption !== undefined) {
    const label = document.createElement("label");

    label.innerText = caption;
    field.appendChild(label);
  }

  field.appendChild(widget);
  field.className = "field";

  return field;
};

const createRange = (
  caption: string | undefined,
  min: number,
  max: number,
  defaultValue: number,
): ApplicationWidget<number> => ({
  createElement: (onChange) => {
    const range = document.createElement("input");

    range.onchange = () => onChange(Number(range.value));
    range.max = max.toString();
    range.min = min.toString();
    range.type = "range";
    range.value = defaultValue.toString();

    return createField(caption, range);
  },

  defaultValue,
});

const createSelect = (
  caption: string | undefined,
  options: string[],
  defaultValue: number,
): ApplicationWidget<number> => ({
  createElement: (onChange) => {
    const select = document.createElement("select");

    select.onchange = () => onChange(select.selectedIndex);

    for (let i = 0; i < options.length; ++i) {
      const option = document.createElement("option");

      option.selected = i === defaultValue;
      option.text = options[i];

      select.options.add(option);
    }

    return createField(caption, select);
  },

  defaultValue,
});

const declare = <TContext, TConfiguration, TState extends Releasable>(
  title: string,
  screenConstructor: ScreenConstructor<TContext>,
  createApplication: ApplicationConstructor<TContext, TConfiguration, TState>,
  configurator: ApplicationConfigurator<TConfiguration>,
): Process => {
  let active:
    | {
        application: Application<TConfiguration, TState>;
        frame: number | undefined;
        screen: Screen<TContext>;
        state: TState;
      }
    | undefined = undefined;

  const configure = async (configuration: TConfiguration): Promise<void> => {
    if (active === undefined) {
      return;
    }

    const previousState = active.state;
    const currentState = await active.application.configure(configuration);

    active.state = currentState;

    previousState.release();
  };

  return {
    fullscreen: () => active?.screen.fullscreen(),
    start: async () => {
      if (active !== undefined) {
        return;
      }

      const container = document.getElementById("screen");

      if (container === null) {
        throw Error("missing screen container");
      }

      while (container.childNodes.length > 0) {
        container.removeChild(container.childNodes[0]);
      }

      const canvas = document.createElement("canvas");

      container.appendChild(canvas);

      const screen = screenConstructor(canvas);
      const gamepad = createGamepad(canvas);
      const application = await createApplication(screen, gamepad);
      const configuration = bindConfigurator(configurator, configure);
      const state = await application.configure(configuration);

      screen.onResize((size) => {
        if (active !== undefined) {
          application.resize(active.state, size);
        }
      });

      active = { application, frame: undefined, screen, state };

      screen.setSize();
    },
    step: (dt: number) => {
      if (active === undefined) {
        return;
      }

      const { application, screen, state } = active;

      screen.setSize();
      application.update(state, dt);

      active.frame = requestAnimationFrame(() => application.render(state));
    },
    stop: () => {
      if (active === undefined) {
        return;
      }

      const { application, frame, state } = active;

      active = undefined;

      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }

      application.release();
      state.release();
    },
    title,
  };
};

const run = (applications: Process[]) => {
  // Sanity checks
  const frameContainer = document.getElementById("frame");

  if (frameContainer === null) {
    throw Error("missing frame container");
  }

  const fullscreenContainer = document.getElementById("fullscreen");

  if (fullscreenContainer === null) {
    throw Error("missing fullscreen container");
  }

  const sceneContainer = document.getElementById("scene");

  if (sceneContainer === null) {
    throw Error("missing scene container");
  }

  const hashTitle = decodeURIComponent(location.hash.substring(1));
  const hashValue = Math.max(
    applications.findIndex(({ title }) => canonicalize(title) === hashTitle),
    0,
  );

  // Initialize application lifecycle
  let current: Process | undefined;
  let elapsed = 0;
  let frames = 0;
  let then = 0;

  const start = async (value: number) => {
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

  // Initialize control elements
  const fullscreenWidget = createButton(undefined, "Fullscreen");
  const fullscreen = fullscreenWidget.createElement(() =>
    current?.fullscreen(),
  );

  fullscreenContainer.appendChild(fullscreen);

  const sceneOptions = applications.map(({ title }) => title);
  const sceneWidget = createSelect(undefined, sceneOptions, hashValue);
  const scene = sceneWidget.createElement(start);

  sceneContainer.appendChild(scene);

  // Start scene
  start(hashValue);
  tick(0);
};

export {
  type Application,
  type ApplicationConfigurator,
  type ApplicationWidget,
  createCheckbox,
  createRange,
  createSelect,
  declare,
  run,
};
