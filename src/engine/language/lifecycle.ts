type Disposable = {
  dispose: () => void;
};

type DelegateDisposable = Disposable & {
  register: (disposable: Disposable) => void;
  remove: (disposable: Disposable) => void;
};

const createDelegateDisposable = (): DelegateDisposable => {
  const disposables: Set<Disposable> = new Set();

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },

    register: (disposable) => {
      disposables.add(disposable);
    },

    remove: (disposable) => {
      disposables.delete(disposable);
    },
  };
};

export { type Disposable, createDelegateDisposable };
