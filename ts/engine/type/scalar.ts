const coalesce = <T>(optional: T | undefined, fallback: T) => optional !== undefined ? optional : fallback;

export { coalesce }
