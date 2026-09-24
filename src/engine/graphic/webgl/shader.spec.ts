import {
  createSingletonFunction,
  createUniqueFunctionTemplate,
  expandSnippet,
  shader,
} from "./shader";
import { describe, expect, it } from "vitest";

describe("shader", () => {
  it("should instanciate and invoke unique functions from template", () => {
    const add = createUniqueFunctionTemplate<[number], [number]>(
      (unique, increment) => (value) => ({
        require: shader`float add_${unique}(int float value) { return value + ${increment}; }`,
        source: shader`add_${unique}(${value})`,
      }),
    );

    const add1 = add(1);
    const add2 = add(2);

    const result = expandSnippet(shader`\
/* ${"c1"} */
${add1(1)};
/* c2 */
${add1(2)};
/* c${3} */
${add2(5)};`);

    expect(result).toEqual(`\
float add_0(int float value) { return value + 1; }
float add_1(int float value) { return value + 2; }
/* c1 */
add_0(1);
/* c2 */
add_0(2);
/* c3 */
add_1(5);`);
  });

  it("should declare and invoke singleton function", () => {
    const mul = createSingletonFunction<[number, number]>(
      shader`float mul(int float x, int float y) { return x + y; }`,
      (x, y) => `mul(${x}, ${y})`,
    );

    const result = expandSnippet(shader`\
/* ${"c1"} */
${mul(1, 2)};
/* c2 */
${mul(3, 4)};`);

    expect(result).toEqual(`\
float mul(int float x, int float y) { return x + y; }
/* c1 */
mul(1, 2);
/* c2 */
mul(3, 4);`);
  });
});
