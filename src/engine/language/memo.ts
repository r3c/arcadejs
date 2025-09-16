import { Releasable } from "../io/resource";

type Indexer<TKey> = {
  bitsize: number;
  index: (key: TKey) => number;
};

type Memo<TKey, TValue> = Releasable & {
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

const createCompositeIndexer = <T1, T2>(
  indexer1: Indexer<T1>,
  indexer2: Indexer<T2>
): Indexer<[T1, T2]> => ({
  bitsize: indexer1.bitsize + indexer2.bitsize,
  index: ([key1, key2]) =>
    indexer1.index(key1) + (indexer2.index(key2) << indexer1.bitsize),
});

const createNumberIndexer = (min: number, max: number): Indexer<number> => ({
  bitsize: Math.ceil(Math.log2(max - min + 1)),
  index: (key) => Math.max(Math.min(key, max), min) - min,
});

const memoize = <TKey, TValue extends Releasable>(
  indexer: Indexer<TKey>,
  constructor: (key: TKey) => TValue
): Memo<TKey, TValue> => {
  let lastIndex: number | undefined = undefined;
  let lastValue: TValue | undefined;

  return {
    release: () => {
      if (lastIndex == undefined) {
        lastIndex = undefined;
        lastValue?.release();
        lastValue = undefined;
      }
    },
    get: (key) => {
      const currentIndex = indexer.index(key);

      if (currentIndex !== lastIndex) {
        if (lastValue !== undefined) {
          lastValue.release();
        }

        lastIndex = currentIndex;
        lastValue = constructor(key);
      }

      return lastValue!;
    },
  };
};

export {
  type Memo,
  createBooleansIndexer,
  createCompositeIndexer,
  createNumberIndexer,
  memoize,
};
