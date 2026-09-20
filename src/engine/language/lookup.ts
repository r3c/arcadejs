type Lookup<TKey, TValue> = {
  getOrElse: <TElse>(key: TKey, value: TElse) => TElse | TValue;
  getOrSet: (key: TKey, accessor: (key: TKey) => TValue) => TValue;
  set: (key: TKey, value: TValue) => void;
};

const createHashLookup = <TKey, TValue>(): Lookup<TKey, TValue> => {
  type Match = { key: TKey; value: TValue };

  const matchesByHashCode = new Map<number, Match[]>();

  return {
    getOrElse: <TElse>(key: TKey, value: TElse): TElse | TValue => {
      const hashCode = getHashCode(key);
      const matches = matchesByHashCode.get(hashCode) ?? [];
      const match = matches.find((candidate) => isEqual(candidate.key, key));

      if (match !== undefined) {
        return match.value;
      } else {
        return value;
      }
    },
    getOrSet: (key, accessor) => {
      const hashCode = getHashCode(key);
      const matches = matchesByHashCode.get(hashCode) ?? [];
      const match = matches.find((candidate) => isEqual(candidate.key, key));

      if (match !== undefined) {
        return match.value;
      }

      const value = accessor(key);

      matchesByHashCode.set(hashCode, matches);
      matches.push({ key, value });

      return value;
    },
    set: (key, value) => {
      const hashCode = getHashCode(key);
      const matches = matchesByHashCode.get(hashCode) ?? [];
      const match = matches.find((candidate) => isEqual(candidate.key, key));

      if (match !== undefined) {
        match.value = value;
      } else {
        matchesByHashCode.set(hashCode, matches);
        matches.push({ key, value });
      }
    },
  };
};

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

export { type Lookup, createHashLookup, getHashCode, isEqual };
