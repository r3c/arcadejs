import { Releasable } from "./io/resource";
import { Screen, ScreenConstructor } from "./graphic/screen";
import { Vector2 } from "./math/vector";
import { Input } from "./io/controller";

type Application<TConfiguration> = Releasable & {
  change: (configuration: TConfiguration) => Promise<void>;
  render: () => void;
  resize: (size: Vector2) => void;
  update: (dt: number) => void;
};

type ApplicationBuilder<TContext, TConfiguration> = (
  screen: Screen<TContext>,
  input: Input
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
  change: (configuration: T) => void
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

      change(configuration);
    });

    container.appendChild(element);
  }

  return configuration;
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

const declare = <TContext, TConfiguration>(
  title: string,
  screenConstructor: ScreenConstructor<TContext>,
  applicationBuilder: ApplicationBuilder<TContext, TConfiguration>,
  configurator: ApplicationConfigurator<TConfiguration>
): Process => {
  let runtime:
    | {
        application: Application<TConfiguration>;
        configuration: TConfiguration;
        handle: number | undefined;
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
      const input = new Input(canvas);
      const application = await applicationBuilder(screen, input);
      const configuration = configure(configurator, application.change);

      await application.change(configuration);

      screen.onResize(application.resize);
      screen.resize();

      runtime = { application, configuration, handle: undefined, screen };
    },
    step: (dt: number) => {
      if (runtime === undefined) {
        return;
      }

      const { application, screen } = runtime;

      screen.resize();
      application.update(dt);

      runtime.handle = requestAnimationFrame(application.render);
    },
    stop: () => {
      if (runtime === undefined) {
        return;
      }

      if (runtime.handle !== undefined) {
        cancelAnimationFrame(runtime.handle);
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

  const sceneContainer = document.getElementById("scene");

  if (sceneContainer === null) {
    throw Error("missing scene container");
  }

  const hashTitle = decodeURIComponent(location.hash.substring(1));
  const hashValue = Math.max(
    applications.findIndex(({ title }) => canonicalize(title) === hashTitle),
    0
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
  const fullscreenWidget = createButton("Fullscreen");
  const fullscreen = fullscreenWidget.createElement(() =>
    current?.fullscreen()
  );

  const sceneOptions = applications.map(({ title }) => title);
  const sceneWidget = createSelect(undefined, sceneOptions, hashValue);
  const scene = sceneWidget.createElement(start);

  sceneContainer.appendChild(fullscreen);
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
  createSelect,
  declare,
  run,
};
