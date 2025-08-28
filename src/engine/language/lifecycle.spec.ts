import { describe, expect, it, vi } from "vitest";
import { createDelegateDisposable } from "./lifecycle";

describe("createDelegateDisposable", () => {
  it("should dispose registered objects", () => {
    const disposable = createDelegateDisposable();
    const mock1 = vi.fn();
    const mock2 = vi.fn();

    disposable.register({ dispose: mock1 });
    disposable.register({ dispose: mock2 });
    disposable.dispose();

    expect(mock1).toHaveBeenCalledOnce();
    expect(mock2).toHaveBeenCalledOnce();
  });

  it("should not dispose removed objects", () => {
    const disposable = createDelegateDisposable();
    const mock1 = vi.fn();
    const mock2 = vi.fn();
    const disposable1 = { dispose: mock1 };
    const disposable2 = { dispose: mock2 };

    disposable.register(disposable1);
    disposable.register(disposable2);
    disposable.remove(disposable1);
    disposable.dispose();

    expect(mock1).not.toHaveBeenCalled();
    expect(mock2).toHaveBeenCalledOnce();
  });
});
