import { describe, expect, it } from "vitest";
import { getHashCode, isEqual } from "./dynamic";

describe("getHashCode", () => {
  const functionValue = function () {};
  const symbolValue = Symbol();

  it.each`
    value
    ${undefined}
    ${null}
    ${false}
    ${0}
    ${-9}
    ${1.5}
    ${268684}
    ${""}
    ${"a"}
    ${"abc"}
    ${functionValue}
    ${symbolValue}
    ${[]}
    ${[1]}
    ${[17, "a", false]}
    ${{}}
    ${{ a: 1, b: 23 }}
    ${{ a: { b: "a" } }}
  `("should return consistent hash codes for $value", ({ value }) => {
    const hash1 = getHashCode(value);
    const hash2 = getHashCode(value);

    expect(hash1).toEqual(hash2);
  });
});

describe("isEqual", () => {
  const functionValue1 = function () {};
  const functionValue2 = function () {};
  const symbolValue1 = Symbol();
  const symbolValue2 = Symbol();

  it.each`
    a                    | b
    ${undefined}         | ${null}
    ${null}              | ${false}
    ${false}             | ${true}
    ${0}                 | ${1}
    ${-9}                | ${-8}
    ${1.5}               | ${1.6}
    ${268684}            | ${268685}
    ${""}                | ${"a"}
    ${"a"}               | ${"b"}
    ${"abc"}             | ${"abcd"}
    ${functionValue1}    | ${functionValue2}
    ${symbolValue1}      | ${symbolValue2}
    ${[]}                | ${[1]}
    ${[1]}               | ${[2]}
    ${[17, "a", false]}  | ${[17, "a", true]}
    ${{}}                | ${{ a: 1 }}
    ${{ a: 1, b: 23 }}   | ${{ a: 1, b: 21 }}
    ${{ a: { b: "a" } }} | ${{ a: { b: "b" } }}
  `("should consider $a and $b as different", ({ a, b }) => {
    expect(isEqual(a, b)).toBe(false);
    expect(isEqual(b, a)).toBe(false);
  });

  it.each`
    a                    | b
    ${undefined}         | ${undefined}
    ${null}              | ${null}
    ${false}             | ${false}
    ${true}              | ${true}
    ${0}                 | ${0}
    ${-9}                | ${-9}
    ${1.5}               | ${1.5}
    ${268684}            | ${268684}
    ${""}                | ${""}
    ${"a"}               | ${"a"}
    ${"abc"}             | ${"abc"}
    ${functionValue1}    | ${functionValue1}
    ${symbolValue1}      | ${symbolValue1}
    ${[]}                | ${[]}
    ${[1]}               | ${[1]}
    ${[17, "a", false]}  | ${[17, "a", false]}
    ${{}}                | ${{}}
    ${{ a: 1, b: 23 }}   | ${{ a: 1, b: 23 }}
    ${{ a: { b: "a" } }} | ${{ a: { b: "a" } }}
  `("should consider $a and $b as equal", ({ a, b }) => {
    expect(isEqual(a, b)).toBe(true);
    expect(isEqual(b, a)).toBe(true);
  });
});
