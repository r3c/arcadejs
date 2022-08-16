const directory = (path: string) => {
  return path.substring(0, path.lastIndexOf("/") + 1);
};

const combine = (head: string, tail: string) => {
  const separator = head.length > 0 && head[head.length - 1] !== "/" ? "/" : "";

  return `${head}${separator}${tail}`;
};

export { directory, combine };
