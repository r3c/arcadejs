import { Disposable } from "./lifecycle";

type Indexer<TKey> = (key: TKey) => number;

type Memo<TKey, TValue> = Disposable & {
  get: (key: TKey) => TValue;
};

const indexBooleans: Indexer<boolean[]> = (key) =>
  key.reduce((sum, value, index) => sum + (value ? Math.pow(2, index) : 0), 0);

const indexNumber: Indexer<number> = (key) => key;

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
      const currentIndex = indexer(key);

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

export { type Memo, indexBooleans, indexNumber, memoize };
