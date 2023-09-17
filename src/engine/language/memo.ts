import { Disposable } from "./lifecycle";

type Indexer<TKey> = {
  bitsize: number;
  index: (key: TKey) => number;
};

type Memo<TKey, TValue> = Disposable & {
  get: (key: TKey) => TValue;
};

const createBooleansIndexer = (nbBooleans: number): Indexer<boolean[]> => ({
  bitsize: nbBooleans,
  index: (key) => {
    let power = 1;
    let value = 0;

    for (let i = 0; i < nbBooleans; ++i) {
      if (key[i]) {
        value += power;
      }

      power <<= 1;
    }

    return value;
  },
});

const createNumberIndexer = (min: number, max: number): Indexer<number> => ({
  bitsize: Math.ceil(Math.log2(max - min + 1)),
  index: (key) => Math.max(Math.min(key, max), min) - min,
});

const memoize = <TKey, TValue extends Disposable>(
  indexer: Indexer<TKey>,
  constructor: (key: TKey) => TValue
): Memo<TKey, TValue> => {
  let lastIndex: number | undefined = undefined;
  let lastValue: TValue | undefined;

  return {
    dispose: () => {
      if (lastIndex == undefined) {
        lastIndex = undefined;
        lastValue?.dispose();
        lastValue = undefined;
      }
    },
    get: (key) => {
      const currentIndex = indexer.index(key);

      if (currentIndex !== lastIndex) {
        if (lastValue !== undefined) {
          lastValue.dispose();
        }

        lastIndex = currentIndex;
        lastValue = constructor(key);
      }

      return lastValue!;
    },
  };
};

export { type Memo, createBooleansIndexer, createNumberIndexer, memoize };
