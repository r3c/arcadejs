type InvokeOf<T> = {
  [K in keyof T]: T[K] extends (...args: any) => void
    ? [K, ...Parameters<T[K]>]
    : never;
}[keyof T];

function invokeOnObject<T>(source: T, invokes: InvokeOf<T>[]): T {
  for (const [name, ...args] of invokes) {
    (source[name] as any).apply(source, args);
  }

  return source;
}

export { type InvokeOf, invokeOnObject };
