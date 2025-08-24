type Disposable = {
  dispose: () => void;
};

type DelegateDisposable = Disposable & {
  register: (disposable: Disposable) => void;
};

const createDelegateDisposable = (): DelegateDisposable => {
  const disposables: Disposable[] = [];

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },

    register: (disposable) => {
      disposables.push(disposable);
    },
  };
};

export { type Disposable, createDelegateDisposable };
