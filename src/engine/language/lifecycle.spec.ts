import { describe, expect, it, vi } from "vitest";
import { createDelegateDisposable } from "./lifecycle";

describe("createDelegateDisposable", () => {
  it("should delegate call", () => {
    const disposable = createDelegateDisposable();
    const mock1 = vi.fn();
    const mock2 = vi.fn();

    disposable.register({ dispose: mock1 });
    disposable.register({ dispose: mock2 });
    disposable.dispose();

    expect(mock1).toHaveBeenCalledOnce();
    expect(mock2).toHaveBeenCalledOnce();
  });
});
