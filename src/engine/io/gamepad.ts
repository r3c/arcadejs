import { MutableVector2, Vector2 } from "../math/vector";

/**
 * User-defined button identifier.
 */
type Button = string;

/**
 * Button activation state.
 */
type ButtonState = {
  active: boolean;
  button: Button;
};

/**
 * Mouse and keyboard key codes.
 */
const enum Key {
  Alt = "alt",
  ArrowDown = "arrowdown",
  ArrowLeft = "arrowleft",
  ArrowRight = "arrowright",
  ArrowUp = "arrowup",
  Backspace = "backspace",
  Capslock = "capslock",
  Control = "control",
  Delete = "delete",
  End = "end",
  Enter = "enter",
  Escape = "escape",
  Home = "home",
  Insert = "insert",
  MouseLeft = "mouseleft",
  MouseMiddle = "mousemiddle",
  MouseRight = "mouseright",
  Numlock = "numlock",
  OS = "os",
  PageDown = "pagedown",
  PageUp = "pageup",
  Pause = "pause",
  Shift = "shift",
  Space = "space",
  Tab = "tab",
}

/**
 * Device-agnostic pointer type.
 */
const enum Pointer {
  Hover,
  Grab,
  Drag,
}

const buttonGrabName: string = Key.MouseLeft;
const buttonDragName: string = Key.MouseRight;
const emptyPointers: Pointer[] = [];
const pointersByNbTouch = new Map<number, Pointer[]>([
  [1, [Pointer.Grab, Pointer.Hover]],
  [2, [Pointer.Drag]],
]);
const wheelSpeed = -1 / 32;

const keys: { key: Key; code: string }[] = [
  { key: Key.Alt, code: "Alt" },
  { key: Key.ArrowDown, code: "ArrowDown" },
  { key: Key.ArrowLeft, code: "ArrowLeft" },
  { key: Key.ArrowRight, code: "ArrowRight" },
  { key: Key.ArrowUp, code: "ArrowUp" },
  { key: Key.Backspace, code: "Backspace" },
  { key: Key.Capslock, code: "Capslock" },
  { key: Key.Control, code: "Control" },
  { key: Key.Delete, code: "Delete" },
  { key: Key.End, code: "End" },
  { key: Key.Enter, code: "Enter" },
  { key: Key.Escape, code: "Escape" },
  { key: Key.Home, code: "Home" },
  { key: Key.Insert, code: "Insert" },
  { key: Key.MouseLeft, code: "0" },
  { key: Key.MouseMiddle, code: "1" },
  { key: Key.MouseRight, code: "2" },
  { key: Key.Numlock, code: "NumLock" },
  { key: Key.OS, code: "OS" },
  { key: Key.PageDown, code: "PageDown" },
  { key: Key.PageUp, code: "PageUp" },
  { key: Key.Pause, code: "Pause" },
  { key: Key.Shift, code: "Shift" },
  { key: Key.Space, code: " " },
  { key: Key.Tab, code: "Tab" },
];

/*
 ** Keyboard & mouse input abstraction class.
 */
type Gamepad = {
  /**
   * Assign button to key.
   * @param key physical key code
   * @param button user-defined button ID to be associated to key
   */
  assign: (key: Key, button: Button) => void;

  /**
   * Clear all keys mapped to given button.
   * @param button button ID
   */
  clear: (button: Button) => void;

  /**
   * Disable presses on given button.
   */
  disable: (button: Button) => void;

  /**
   * Enable presses on given button.
   */
  enable: (button: Button) => void;

  /**
   * Get move coordinates for given pointer type and reset buffer.
   */
  fetchMove: (pointer: Pointer) => Vector2;

  /**
   * Get and reset button pressed state.
   */
  fetchPress: (button: Button) => boolean;

  /**
   * Get and reset zoom buffer.
   */
  fetchZoom: () => number;

  /**
   * Check if button is pressed.
   */
  isPressed: (buttonId: Button) => boolean;
};

const createGamepad = (
  eventSource: HTMLElement,
  mouseOrigin?: HTMLElement
): Gamepad => {
  if (eventSource.tabIndex < 0) {
    throw Error(
      "eventSource element requires a 'tabindex' attribute to capture key events"
    );
  }

  const buttonPresses = new Set<Button>();
  const buttonStatesByKey = new Map<Key, ButtonState[]>();
  const bufferMoves = {
    [Pointer.Grab]: Vector2.fromZero(),
    [Pointer.Drag]: Vector2.fromZero(),
    [Pointer.Hover]: Vector2.fromZero(),
  };
  const mousePosition = Vector2.fromZero();
  const mouseOffset = Vector2.fromZero();
  const touchPositions = new Map<number, MutableVector2>();

  let bufferZoom = 0;

  // Define and attach event listeners
  const keyByCode = new Map(keys.map(({ key, code }) => [code, key]));
  const handlers: { name: string; callback: (event: any) => void }[] = [
    { name: "contextmenu", callback: () => {} }, // NoOp, just disable context menu on canvas
    {
      name: "keydown",
      callback: (event: KeyboardEvent) => {
        if (!event.repeat) {
          processKeyPress(event.key, keyByCode, true);
        }
      },
    },
    {
      name: "keyup",
      callback: (event: KeyboardEvent) => {
        if (!event.repeat) {
          processKeyPress(event.key, keyByCode, false);
        }
      },
    },
    {
      name: "mousedown",
      callback: (event: MouseEvent) =>
        processKeyPress(event.button.toString(), keyByCode, true),
    },
    {
      name: "mousemove",
      callback: (event: MouseEvent) => processMouseMove(event),
    },
    {
      name: "mouseup",
      callback: (event: MouseEvent) =>
        processKeyPress(event.button.toString(), keyByCode, false),
    },
    {
      name: "touchend",
      callback: (event: TouchEvent) => processTouchStop(event.changedTouches),
    },
    {
      name: "touchmove",
      callback: (event: TouchEvent) => processTouchMove(event.changedTouches),
    },
    {
      name: "touchstart",
      callback: (event: TouchEvent) => processTouchStart(event.changedTouches),
    },
    {
      name: "wheel",
      callback: (event: WheelEvent) =>
        processMouseWheel(event.deltaY * wheelSpeed),
    },
  ];

  const assign: Gamepad["assign"] = (key, button) => {
    let buttonStates = buttonStatesByKey.get(key);

    if (buttonStates === undefined) {
      buttonStates = [];

      buttonStatesByKey.set(key, buttonStates);
    }

    if (buttonStates.every((buttonSetup) => buttonSetup.button !== button)) {
      buttonStates.push({
        active: true,
        button,
      });
    }
  };

  /**
   * Reset mouse offset location.
   */
  const mouseRelocate = () => {
    let mouseOffsetX = 0;
    let mouseOffsetY = 0;

    for (
      let element = mouseOrigin ?? eventSource;
      element !== null && element.offsetParent instanceof HTMLElement;
      element = element.offsetParent
    ) {
      mouseOffsetX += element.offsetLeft;
      mouseOffsetY += element.offsetTop;
    }

    mouseOffset.x = mouseOffsetX;
    mouseOffset.y = mouseOffsetY;
  };

  /**
   * Change state of enabled buttons in given list.
   */
  const processKeyPress = (
    keyCode: string,
    keyByCode: Map<string, Key>,
    pressed: boolean
  ) => {
    const key = keyByCode.get(keyCode);

    if (key === undefined) {
      return;
    }

    const buttonStates = buttonStatesByKey.get(key);

    if (buttonStates === undefined) {
      return;
    }

    for (const buttonState of buttonStates) {
      if (buttonState.active) {
        if (pressed) {
          buttonPresses.add(buttonState.button);
        } else {
          buttonPresses.delete(buttonState.button);
        }
      }
    }
  };

  /**
   * Update mouse position.
   */
  const processMouseMove = (event: MouseEvent) => {
    const locationX = event.pageX - mouseOffset.x;
    const locationY = event.pageY - mouseOffset.y;

    let bufferMove: MutableVector2;

    if (buttonPresses.has(buttonDragName)) {
      bufferMove = bufferMoves[Pointer.Drag];
    } else if (buttonPresses.has(buttonGrabName)) {
      bufferMove = bufferMoves[Pointer.Grab];
    } else {
      bufferMove = bufferMoves[Pointer.Hover];
    }

    if (event.movementX !== undefined && event.movementY !== undefined) {
      bufferMove.x += event.movementX;
      bufferMove.y += event.movementY;
    } else {
      bufferMove.x += locationX - mousePosition.x;
      bufferMove.y += locationY - mousePosition.y;
    }

    mousePosition.x = locationX;
    mousePosition.y = locationY;
  };

  /**
   * Update mouse wheel delta.
   */
  const processMouseWheel = (wheel: number): void => {
    bufferZoom += wheel;
  };

  /**
   * Update touch positions.
   */
  const processTouchMove = (changedTouches: TouchList): void => {
    const nbOldPositions = touchPositions.size;
    const newPositions = new Map<number, Vector2>();

    for (let i = 0; i < changedTouches.length; ++i) {
      const touch = changedTouches[i];

      newPositions.set(touch.identifier, { x: touch.pageX, y: touch.pageY });
    }

    // Compute center of both old and new touch points
    let oldCenterX = 0;
    let oldCenterY = 0;
    let newCenterX = 0;
    let newCenterY = 0;

    for (const [identifier, oldPosition] of touchPositions) {
      const newPosition = newPositions.get(identifier) ?? oldPosition;

      oldCenterX += oldPosition.x;
      oldCenterY += oldPosition.y;
      newCenterX += newPosition.x;
      newCenterY += newPosition.y;
    }

    oldCenterX /= nbOldPositions;
    oldCenterY /= nbOldPositions;
    newCenterX /= nbOldPositions;
    newCenterY /= nbOldPositions;

    // Compute maximum move and zoom factors from moved positions
    let maxMoveAbs = 0;
    let maxMoveX = 0;
    let maxMoveY = 0;
    let sumMoveX = 0;
    let sumMoveY = 0;
    let sumZoom = 0;

    for (const [identifier, oldPosition] of touchPositions) {
      const newPosition = newPositions.get(identifier) ?? oldPosition;

      // Compute move velocity
      const moveX = newPosition.x - oldPosition.x;
      const moveY = newPosition.y - oldPosition.y;
      const moveAbs = Math.sqrt(moveX * moveX + moveY * moveY);

      if (moveAbs > maxMoveAbs) {
        maxMoveAbs = moveAbs;
        maxMoveX = moveX;
        maxMoveY = moveY;
      }

      sumMoveX += moveX;
      sumMoveY += moveY;

      // Compute zoom velocity
      const oldDeltaX = oldPosition.x - oldCenterX;
      const oldDeltaY = oldPosition.y - oldCenterY;
      const oldDelta = Math.sqrt(oldDeltaX * oldDeltaX + oldDeltaY * oldDeltaY);
      const newDeltaX = newPosition.x - newCenterX;
      const newDeltaY = newPosition.y - newCenterY;
      const newDelta = Math.sqrt(newDeltaX * newDeltaX + newDeltaY * newDeltaY);

      sumZoom += (newDelta - oldDelta) / nbOldPositions;

      // Update last known position
      oldPosition.x = newPosition.x;
      oldPosition.y = newPosition.y;
    }

    // Apply either move or zoom depending on the most significant delta
    const sumMove = Math.sqrt(sumMoveX * sumMoveX + sumMoveY * sumMoveY);

    if (sumMove > Math.abs(sumZoom)) {
      const pointers = pointersByNbTouch.get(nbOldPositions) ?? emptyPointers;

      for (const pointer of pointers) {
        const bufferMove = bufferMoves[pointer];

        bufferMove.x += maxMoveX;
        bufferMove.y += maxMoveY;
      }
    } else {
      bufferZoom += sumZoom;
    }
  };

  /**
   * Initialize touch positions.
   */
  const processTouchStart = (changedTouches: TouchList) => {
    for (let i = 0; i < changedTouches.length; ++i) {
      const touch = changedTouches[i];

      touchPositions.set(
        touch.identifier,
        Vector2.fromSource({
          x: touch.pageX,
          y: touch.pageY,
        })
      );
    }
  };

  /**
   * Cleanup touch positions.
   */
  const processTouchStop = (changedTouches: TouchList) => {
    for (let i = 0; i < changedTouches.length; ++i) {
      touchPositions.delete(changedTouches[i].identifier);
    }
  };

  /**
   * Enable or disable button presses.
   */
  const setActive = (button: Button, enabled: boolean): void => {
    for (const buttonSetups of buttonStatesByKey.values()) {
      for (const buttonSetup of buttonSetups) {
        if (buttonSetup.button === button) {
          buttonSetup.active = enabled;
        }
      }
    }
  };

  for (const { name, callback } of handlers) {
    eventSource.addEventListener(name, (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();

      callback(event);
    });
  }

  // Register default buttons for known keys
  for (const { key } of keys) {
    assign(key, key);
  }

  // Relocate mouse on window resize
  window.addEventListener("resize", () => mouseRelocate());

  mouseRelocate();

  // Create gamepad
  return {
    assign,

    clear(button) {
      for (const [key, buttonSetups] of buttonStatesByKey.entries()) {
        for (let i = buttonSetups.length; i-- > 0; ) {
          if (buttonSetups[i].button === button) {
            buttonSetups.splice(i, 1);
          }
        }

        if (buttonSetups.length === 0) {
          buttonStatesByKey.delete(key);
        }
      }

      buttonPresses.delete(button);
    },

    disable(button) {
      setActive(button, false);
    },

    enable(button) {
      setActive(button, true);
    },

    fetchMove(pointer) {
      const bufferMove = bufferMoves[pointer];
      const { x, y } = bufferMove;

      bufferMove.x = 0;
      bufferMove.y = 0;

      return { x, y };
    },

    fetchPress(button) {
      const state = buttonPresses.has(button);

      buttonPresses.delete(button);

      return state;
    },

    fetchZoom() {
      const zoom = bufferZoom;

      bufferZoom = 0;

      return zoom;
    },

    isPressed(buttonId) {
      return buttonPresses.has(buttonId);
    },
  };
};

export { type Gamepad, Key, Pointer, createGamepad };
