type RandomSequence = (index: number) => number;

const createFloatSequence = (seed: number): RandomSequence => {
  const sequence = createInt32Sequence(Math.floor(seed * 0x7fffffff));

  return (index) => sequence(index * 0x7fffffff) / 0x7fffffff;
};

// From: https://stackoverflow.com/questions/7188310/javascript-pseudo-random-sequence-generator
const createInt32Sequence = (seed: number): RandomSequence => {
  return (index) => {
    let key = index + seed;

    key += key << 12;
    key ^= key >> 22;
    key += key << 4;
    key ^= key >> 9;
    key += key << 10;
    key ^= key >> 2;
    key += key << 7;
    key ^= key >> 12;

    return key & 0xffffffff;
  };
};

export { type RandomSequence, createFloatSequence, createInt32Sequence };
