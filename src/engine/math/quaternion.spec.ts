import { Quaternion } from "./quaternion";

describe("Quaternion", () => {
  it.each`
    lhs                                             | rhs                                             | expected
    ${{ scalar: 0, vector: { x: 3, y: 0, z: -1 } }} | ${{ scalar: 2, vector: { x: 0, y: 1, z: 1 } }}  | ${{ scalar: 1, vector: { x: 7, y: -3, z: 1 } }}
    ${{ scalar: 2, vector: { x: 0, y: 1, z: 1 } }}  | ${{ scalar: 0, vector: { x: 3, y: 0, z: -1 } }} | ${{ scalar: 1, vector: { x: 5, y: 3, z: -5 } }}
  `("should multiply $lhs by $rhs", ({ lhs, rhs, expected }) => {
    const q1 = Quaternion.fromSource(lhs);
    const q2 = Quaternion.fromSource(rhs);

    q1.multiply(q2);

    expect(q1).toEqual(Quaternion.fromSource(expected));
  });
});
