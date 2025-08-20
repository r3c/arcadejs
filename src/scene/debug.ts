type DebugLogger = {
  appendLine: (line: string) => void;
};

const createDebugLogger = (
  element: HTMLElement,
  nbLines: number
): DebugLogger => {
  const lines: string[] = [];

  let tailIndex = 0;

  const refresh = () => {
    let content = "";
    let index = tailIndex;
    let separator = "";

    for (let i = nbLines; i > 0; --i) {
      content += separator + lines[index];
      index = (index + 1) % nbLines;
    }

    element.innerText = content;
  };

  return {
    appendLine: (line) => {
      lines[tailIndex] = line;

      tailIndex = (tailIndex + 1) % nbLines;

      refresh();
    },
  };
};
