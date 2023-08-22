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
 * 2D position.
 */
type Position = {
  x: number;
  y: number;
};

const emptyPointers: Pointer[] = [];
const pointersByNbTouch = new Map<number, Pointer[]>([
  [1, [Pointer.Focus, Pointer.Hover]],
  [2, [Pointer.Grab]],
]);

/**
 * Mouse and keyboard key codes.
 */
const enum Key {
  Alt,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Backspace,
  Capslock,
  Control,
  Delete,
  End,
  Enter,
  Escape,
  Home,
  Insert,
  MouseLeft,
  MouseMiddle,
  MouseRight,
  Numlock,
  OS,
  PageDown,
  PageUp,
  Pause,
  Shift,
  Space,
  Tab,
}

/**
 * Device-agnostic pointer type.
 */
const enum Pointer {
  Hover,
  Focus,
  Grab,
}

const keyNameFocus = "0";
const keyNameGrab = "2";
const wheelSpeed = -1 / 20;

const keyNames: [Key, string][] = [
  [Key.Alt, "Alt"],
  [Key.ArrowDown, "ArrowDown"],
  [Key.ArrowLeft, "ArrowLeft"],
  [Key.ArrowRight, "ArrowRight"],
  [Key.ArrowUp, "ArrowUp"],
  [Key.Backspace, "Backspace"],
  [Key.Capslock, "Capslock"],
  [Key.Control, "Control"],
  [Key.Delete, "Delete"],
  [Key.End, "End"],
  [Key.Enter, "Enter"],
  [Key.Escape, "Escape"],
  [Key.Home, "Home"],
  [Key.Insert, "Insert"],
  [Key.MouseLeft, keyNameFocus],
  [Key.MouseMiddle, "1"],
  [Key.MouseRight, keyNameGrab],
  [Key.Numlock, "NumLock"],
  [Key.OS, "OS"],
  [Key.PageDown, "PageDown"],
  [Key.PageUp, "PageUp"],
  [Key.Pause, "Pause"],
  [Key.Shift, "Shift"],
  [Key.Space, " "],
  [Key.Tab, "Tab"],
];

/*
 ** Keyboard & mouse input abstraction class.
 */
class Input {
  private buttonStatesByKey: Map<Key, ButtonState[]>;
  private bufferMoves: Record<Pointer, Position>;
  private mousePosition: Position;
  private mouseOffset: Position;
  private mouseOrigin: HTMLElement;
  private bufferZoom: number;
  private pressedButtons: Set<Button>;
  private touchPositions: Map<number, Position>;

  constructor(eventSource: HTMLElement, mouseOrigin?: HTMLElement) {
    if (eventSource.tabIndex < 0) {
      throw Error(
        "eventSource element requires a 'tabindex=\"1\"' attribute to capture key events"
      );
    }

    this.buttonStatesByKey = new Map();
    this.bufferMoves = {
      [Pointer.Focus]: { x: 0, y: 0 },
      [Pointer.Grab]: { x: 0, y: 0 },
      [Pointer.Hover]: { x: 0, y: 0 },
    };
    this.bufferZoom = 0;
    this.mousePosition = { x: 0, y: 0 };
    this.mouseOffset = { x: 0, y: 0 };
    this.mouseOrigin = mouseOrigin ?? eventSource;
    this.pressedButtons = new Set();
    this.touchPositions = new Map();

    // Define and attach event listeners
    const keyByName = new Map(keyNames.map(([key, name]) => [name, key]));
    const handlers: { name: string; callback: (event: any) => void }[] = [
      { name: "contextmenu", callback: () => {} }, // NoOp, just disable context menu on canvas
      {
        name: "keydown",
        callback: (event: KeyboardEvent) => {
          if (!event.repeat) {
            this.processKeyPress(event.key, keyByName, true);
          }
        },
      },
      {
        name: "keyup",
        callback: (event: KeyboardEvent) => {
          if (!event.repeat) {
            this.processKeyPress(event.key, keyByName, false);
          }
        },
      },
      {
        name: "mousedown",
        callback: (event: MouseEvent) =>
          this.processKeyPress(event.button.toString(), keyByName, true),
      },
      {
        name: "mousemove",
        callback: (event: MouseEvent) => this.processMouseMove(event),
      },
      {
        name: "mouseup",
        callback: (event: MouseEvent) =>
          this.processKeyPress(event.button.toString(), keyByName, false),
      },
      {
        name: "touchend",
        callback: (event: TouchEvent) =>
          this.processTouchStop(event.changedTouches),
      },
      {
        name: "touchmove",
        callback: (event: TouchEvent) =>
          this.processTouchMove(event.changedTouches),
      },
      {
        name: "touchstart",
        callback: (event: TouchEvent) =>
          this.processTouchStart(event.changedTouches),
      },
      {
        name: "wheel",
        callback: (event: WheelEvent) =>
          this.processMouseWheel(event.deltaY * wheelSpeed),
      },
    ];

    for (const { name, callback } of handlers) {
      eventSource.addEventListener(name, (e) => {
        const event = e || window.event;

        event.preventDefault?.();
        event.stopPropagation?.();

        callback(event);
      });
    }

    // Register known keys as buttons
    for (const [key, name] of keyNames) {
      this.assign(key, name.toLowerCase());
    }

    // Relocate mouse on window resize
    window.addEventListener("resize", () => this.mouseRelocate());

    this.mouseRelocate();
  }

  /**
   * Assign button to key.
   * @param key physical key code
   * @param button user-defined button ID to be associated to key
   */
  public assign(key: Key, button: Button) {
    let buttonStates = this.buttonStatesByKey.get(key);

    if (buttonStates === undefined) {
      buttonStates = [];

      this.buttonStatesByKey.set(key, buttonStates);
    }

    if (buttonStates.every((buttonSetup) => buttonSetup.button !== button)) {
      buttonStates.push({
        active: true,
        button,
      });
    }
  }

  /**
   * Clear all keys mapped to given button.
   * @param button button ID
   */
  public clear(button: Button) {
    for (const [key, buttonSetups] of this.buttonStatesByKey.entries()) {
      for (let i = buttonSetups.length; i-- > 0; ) {
        if (buttonSetups[i].button === button) {
          buttonSetups.splice(i, 1);
        }
      }

      if (buttonSetups.length === 0) {
        this.buttonStatesByKey.delete(key);
      }
    }

    this.pressedButtons.delete(button);
  }

  /**
   * Disable presses on given button.
   */
  public disable(button: Button) {
    this.setActive(button, false);
  }

  /**
   * Enable presses on given button.
   */
  public enable(button: Button) {
    this.setActive(button, true);
  }

  /**
   * Get move coordinates for given pointer type and reset buffer.
   */
  public fetchMove(pointer: Pointer) {
    const bufferMove = this.bufferMoves[pointer];
    const { x, y } = bufferMove;

    bufferMove.x = 0;
    bufferMove.y = 0;

    return { x, y };
  }

  /**
   * Get and reset button pressed state.
   */
  public fetchPress(button: Button) {
    const state = this.pressedButtons.has(button);

    this.pressedButtons.delete(button);

    return state;
  }

  /**
   * Get and reset zoom buffer.
   */
  public fetchZoom() {
    const zoom = this.bufferZoom;

    this.bufferZoom = 0;

    return zoom;
  }

  /**
   * Check if button is pressed.
   */
  public isPressed(buttonId: Button) {
    return this.pressedButtons.has(buttonId);
  }

  /**
   * Reset mouse offset location.
   * input:	input instance
   */
  private mouseRelocate() {
    let mouseOffsetX = 0;
    let mouseOffsetY = 0;

    for (
      let element = this.mouseOrigin;
      element !== null && element.offsetParent instanceof HTMLElement;
      element = element.offsetParent
    ) {
      mouseOffsetX += element.offsetLeft;
      mouseOffsetY += element.offsetTop;
    }

    this.mouseOffset.x = mouseOffsetX;
    this.mouseOffset.y = mouseOffsetY;
  }

  /**
   * Change state of enabled buttons in given list.
   * states: current button states
   * buttons: button IDs list
   * value: new button state
   */
  private processKeyPress(
    keyName: string,
    keyByName: Map<string, Key>,
    pressed: boolean
  ) {
    const key = keyByName.get(keyName);

    if (key === undefined) {
      return;
    }

    const buttonStates = this.buttonStatesByKey.get(key);

    if (buttonStates === undefined) {
      return;
    }

    for (const buttonState of buttonStates) {
      if (buttonState.active) {
        if (pressed) {
          this.pressedButtons.add(buttonState.button);
        } else {
          this.pressedButtons.delete(buttonState.button);
        }
      }
    }
  }

  /**
   * Update mouse position.
   */
  private processMouseMove(event: MouseEvent) {
    const locationX = event.pageX - this.mouseOffset.x;
    const locationY = event.pageY - this.mouseOffset.y;

    let bufferMove: Position;

    if (this.isPressed(keyNameFocus)) {
      bufferMove = this.bufferMoves[Pointer.Focus];
    } else if (this.isPressed(keyNameGrab)) {
      bufferMove = this.bufferMoves[Pointer.Grab];
    } else {
      bufferMove = this.bufferMoves[Pointer.Hover];
    }

    if (event.movementX !== undefined && event.movementY !== undefined) {
      bufferMove.x += event.movementX;
      bufferMove.y += event.movementY;
    } else {
      bufferMove.x += locationX - this.mousePosition.x;
      bufferMove.y += locationY - this.mousePosition.y;
    }

    this.mousePosition.x = locationX;
    this.mousePosition.y = locationY;
  }

  /**
   * Update mouse wheel delta.
   */
  private processMouseWheel(wheel: number) {
    this.bufferZoom += wheel;
  }

  /**
   * Update touch positions.
   */
  private processTouchMove(changedTouches: TouchList) {
    const nbOldPositions = this.touchPositions.size;
    const newPositions = new Map<number, Position>();

    for (let i = 0; i < changedTouches.length; ++i) {
      const touch = changedTouches[i];

      newPositions.set(touch.identifier, { x: touch.pageX, y: touch.pageY });
    }

    // Compute center of both old and new touch points
    let oldCenterX = 0;
    let oldCenterY = 0;
    let newCenterX = 0;
    let newCenterY = 0;

    for (const [identifier, oldPosition] of this.touchPositions) {
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

    for (const [identifier, oldPosition] of this.touchPositions) {
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
        const bufferMove = this.bufferMoves[pointer];

        bufferMove.x += maxMoveX;
        bufferMove.y += maxMoveY;
      }
    } else {
      this.bufferZoom += sumZoom;
    }
  }

  /**
   * Initialize touch positions.
   */
  private processTouchStart(changedTouches: TouchList) {
    for (let i = 0; i < changedTouches.length; ++i) {
      const touch = changedTouches[i];

      this.touchPositions.set(touch.identifier, {
        x: touch.pageX,
        y: touch.pageY,
      });
    }
  }

  /**
   * Cleanup touch positions.
   */
  private processTouchStop(changedTouches: TouchList) {
    for (let i = 0; i < changedTouches.length; ++i) {
      this.touchPositions.delete(changedTouches[i].identifier);
    }
  }

  /**
   * Enable or disable button presses.
   */
  private setActive(button: Button, enabled: boolean) {
    for (const [_, buttonSetups] of this.buttonStatesByKey.entries()) {
      for (const buttonSetup of buttonSetups) {
        if (buttonSetup.button === button) {
          buttonSetup.active = enabled;
        }
      }
    }
  }
}

export { Input, Key, Pointer };
