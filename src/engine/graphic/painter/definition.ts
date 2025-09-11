type Painter<TTarget, TScene> = {
  paint(target: TTarget, scene: TScene): void;
};

export { type Painter };
