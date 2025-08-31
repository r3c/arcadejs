type InvokeOf<T> = {
  [K in keyof T]: T[K] extends (...args: any) => void
    ? [K, ...Parameters<T[K]>]
    : never;
}[keyof T];

const getHashCode = <T>(instance: T): number => {
  switch (typeof instance) {
    case "bigint":
      return (Number(instance) * 1787) % 89507177;

    case "boolean":
      return instance ? 2069 : 5867;

    case "function":
      return 4391;

    case "number":
      return (instance * 3229) % 95553313;

    case "string":
      let stringHash = 8929;

      for (let i = 0; i < instance.length; ++i) {
        stringHash = (instance.charCodeAt(i) * 5783) % 75235103;
      }

      return stringHash;

    case "symbol":
      return 4517;

    case "object":
      if (instance === null) {
        return 9851;
      }

      let objectHash = 1613;

      for (const [key, value] of Object.entries(instance)) {
        const keyHash = getHashCode(key) * 2281;
        const valueHash = getHashCode(value) * 1009;

        objectHash = (objectHash * 9227 + keyHash + valueHash) % 99154063;
      }

      return objectHash;

    case "undefined":
      return 1493;

    default:
      return 0;
  }
};

const invokeOnObject = <T>(source: T, invokes: InvokeOf<T>[]): T => {
  for (const [name, ...args] of invokes) {
    (source[name] as any).apply(source, args);
  }

  return source;
};

const isEqual = <T>(lhs: T, rhs: T): boolean => {
  const lhsType = typeof lhs;
  const rhsType = typeof rhs;

  if (lhsType !== rhsType) {
    return false;
  }

  switch (lhsType) {
    case "bigint":
    case "boolean":
    case "function":
    case "number":
    case "string":
    case "symbol":
      return lhs === rhs;

    case "object":
      if (lhs === null && rhs === null) {
        return true;
      }

      if (lhs === null || rhs === null) {
        return false;
      }

      const lhsKeys = Object.keys(lhs!).sort();
      const rhsKeys = Object.keys(rhs!).sort();

      if (lhsKeys.length !== rhsKeys.length) {
        return false;
      }

      for (let i = 0; i < lhsKeys.length; ++i) {
        const lhsKey = lhsKeys[i];
        const rhsKey = rhsKeys[i];

        if (
          lhsKey !== rhsKey ||
          !isEqual((lhs as any)[lhsKey], (rhs as any)[rhsKey])
        ) {
          return false;
        }
      }

      return true;

    case "undefined":
      return true;

    default:
      return false;
  }
};

export { type InvokeOf, getHashCode, invokeOnObject, isEqual };
