type CompositeReleasable = Releasable & {
  register: (releasable: Releasable) => void;
  remove: (releasable: Releasable) => void;
};

type Releasable = {
  release: () => void;
};

const createCompositeReleasable = (): CompositeReleasable => {
  const releasables: Set<Releasable> = new Set();

  return {
    release: () => {
      for (const releasable of releasables) {
        releasable.release();
      }
    },

    register: (releasable) => {
      releasables.add(releasable);
    },

    remove: (releasable) => {
      releasables.delete(releasable);
    },
  };
};

export { type Releasable, createCompositeReleasable };
