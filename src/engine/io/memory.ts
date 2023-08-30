type FlexibleBufferArray = Float32Array | Uint32Array;

type FlexibleBuffer<TArray extends FlexibleBufferArray> = {
  resize: (length: number) => void;
  array: Omit<TArray, "length">;
  capacity: number;
  length: number;
};

/**
 * Create flexible array container that can be resized without causing extra
 * allocation, unless requested size is too far away from current capacity.
 */
const createFlexibleBuffer = <TArray extends FlexibleBufferArray>(
  constructor: { new (length: number): TArray },
  recycle: number
): FlexibleBuffer<TArray> => {
  const instance: FlexibleBuffer<TArray> = {
    resize: (length) => {
      if (instance.capacity < length || instance.capacity >= length * recycle) {
        instance.array = new constructor(length);
        instance.capacity = length;
      }

      instance.length = length;
    },
    array: new constructor(0),
    capacity: 0,
    length: 0,
  };

  return instance;
};

export { type FlexibleBuffer, createFlexibleBuffer };
