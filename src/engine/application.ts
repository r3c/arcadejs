import { Releasable } from "./io/resource";
import { Screen, ScreenConstructor } from "./graphic/screen";
import { Vector2 } from "./math/vector";
import { createGamepad, Gamepad } from "./io/gamepad";

type Application<TConfiguration> = Releasable & {
  render: () => void;
  setConfiguration: (configuration: TConfiguration) => Promise<void>;
  setSize: (size: Vector2) => void;
  update: (dt: number) => void;
};

type ApplicationConstructor<TContext, TConfiguration> = (
  screen: Screen<TContext>,
  gamepad: Gamepad,
) => Promise<Application<TConfiguration>>;

type ApplicationConfigurator<T> = {
  [key in keyof T]: ApplicationWidget<T[key]>;
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

const canonicalize = (name: string): string => {
  return name
    .toLowerCase()
    .replaceAll(/[^-0-9a-z]/g, "-")
    .replaceAll(/^-+|-+$/g, "");
};

const configure = <T>(
  configurator: ApplicationConfigurator<T>,
  setConfiguration: (configuration: T) => void,
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

      setConfiguration(configuration);
    });

    container.appendChild(element);
  }

  return configuration;
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

const declare = <TContext, TConfiguration>(
  title: string,
  screenConstructor: ScreenConstructor<TContext>,
  createApplication: ApplicationConstructor<TContext, TConfiguration>,
  configurator: ApplicationConfigurator<TConfiguration>,
): Process => {
  let runtime:
    | {
        application: Application<TConfiguration>;
        configuration: TConfiguration;
        frame: number | undefined;
        screen: Screen<TContext>;
      }
    | undefined = undefined;

  return {
    fullscreen: () => runtime?.screen.fullscreen(),
    start: async () => {
      if (runtime !== undefined) {
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
      const configuration = configure(
        configurator,
        application.setConfiguration,
      );

      await application.setConfiguration(configuration);

      screen.onResize(application.setSize);
      screen.setSize();

      runtime = { application, configuration, frame: undefined, screen };
    },
    step: (dt: number) => {
      if (runtime === undefined) {
        return;
      }

      const { application, screen } = runtime;

      screen.setSize();
      application.update(dt);

      runtime.frame = requestAnimationFrame(application.render);
    },
    stop: () => {
      if (runtime === undefined) {
        return;
      }

      if (runtime.frame !== undefined) {
        cancelAnimationFrame(runtime.frame);
      }

      runtime.application.release();
      runtime = undefined;
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
