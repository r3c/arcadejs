import {
  createSingletonFunction,
  createUniqueTemplate,
  expandSnippet,
  shader,
} from "./shader";
import { describe, expect, it } from "vitest";

describe("shader", () => {
  it("should declare and invoke functions", () => {
    const add = createUniqueTemplate<{ increment: number }, { x: number }>(
      ({ increment }, unique) =>
        ({ x }) => ({
          require: shader`float add_${unique}(int float x) { return x + ${increment}; }`,
          source: shader`add_${unique}(${x})`,
        }),
    );

    const add1 = add({ increment: 1 });
    const add2 = add({ increment: 2 });

    const mul = createSingletonFunction<{ x: number; y: number }>(
      shader`float mul(int float x, int float y) { return x + y; }`,
      ({ x, y }) => `mul(${x}, ${y})`,
    );

    const result = expandSnippet(shader`\
/* ${"c1"} */
${add1({ x: 1 })};
/* c2 */
${add1({ x: 2 })};
/* c${3} */
${mul({ x: 3, y: 4 })};
/* c4 */
${add2({ x: 5 })};`);

    expect(result).toEqual(`\
float add_0(int float x) { return x + 1; }
float mul(int float x, int float y) { return x + y; }
float add_1(int float x) { return x + 2; }
/* c1 */
add_0(1);
/* c2 */
add_0(2);
/* c3 */
mul(3, 4);
/* c4 */
add_1(5);`);
  });
});
