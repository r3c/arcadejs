import { describe, expect, it, vi } from "vitest";
import { createCompositeReleasable } from "./resource";

describe("createCompositeReleasable", () => {
  it("should release registered objects", () => {
    const releasable = createCompositeReleasable();
    const mock1 = vi.fn();
    const mock2 = vi.fn();

    releasable.register({ release: mock1 });
    releasable.register({ release: mock2 });
    releasable.release();

    expect(mock1).toHaveBeenCalledOnce();
    expect(mock2).toHaveBeenCalledOnce();
  });

  it("should not release removed objects", () => {
    const releasable = createCompositeReleasable();
    const mock1 = vi.fn();
    const mock2 = vi.fn();
    const releasable1 = { release: mock1 };
    const releasable2 = { release: mock2 };

    releasable.register(releasable1);
    releasable.register(releasable2);
    releasable.remove(releasable1);
    releasable.release();

    expect(mock1).not.toHaveBeenCalled();
    expect(mock2).toHaveBeenCalledOnce();
  });
});
