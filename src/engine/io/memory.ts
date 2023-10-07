type FlexibleArrayBuffer = Float32Array | Uint32Array;

type FlexibleArray<TBuffer extends FlexibleArrayBuffer> = {
  resize: (length: number) => void;
  buffer: Omit<TBuffer, "length">;
  capacity: number;
  length: number;
};

/**
 * Create flexible array container that can be resized without causing extra
 * allocation, unless requested size is too far away from current capacity.
 */
const createFlexibleArray = <TArray extends FlexibleArrayBuffer>(
  constructor: { new (length: number): TArray },
  recycle: number
): FlexibleArray<TArray> => {
  const instance: FlexibleArray<TArray> = {
    resize: (length) => {
      if (instance.capacity < length || instance.capacity >= length * recycle) {
        instance.buffer = new constructor(length);
        instance.capacity = length;
      }

      instance.length = length;
    },
    buffer: new constructor(0),
    capacity: 0,
    length: 0,
  };

  return instance;
};

export { type FlexibleArray, createFlexibleArray };
