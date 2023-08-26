const range = (length: number): Array<number> => {
  return new Array(length).fill(0).map((_, index) => index);
};

export { range };
