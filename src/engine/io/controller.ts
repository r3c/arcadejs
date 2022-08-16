/*
 ** User-defined button identifier.
 */
type Button = string;

/*
 ** Button setup.
 */
type ButtonSetup = {
  active: boolean;
  button: Button;
};

/*
 ** 2D position.
 */
type Position = {
  x: number;
  y: number;
};

const emptyButtonSetups: ButtonSetup[] = [];

/*
 ** Keyboard & mouse input abstraction class.
 */
class Input {
  private buttonMap: Map<string, ButtonSetup[]>;
  private mouseMouvement: Position;
  private mousePosition: Position;
  private mouseOffset: Position;
  private mouseOrigin: HTMLElement;
  private mouseWheel: number;
  private pressedButtons: Set<string>;

  constructor(eventSource: HTMLElement, mouseOrigin?: HTMLElement) {
    if (eventSource.tabIndex < 0)
      throw Error(
        "eventSource element requires a 'tabindex=\"1\"' attribute to capture key events"
      );

    this.buttonMap = new Map();
    this.mouseMouvement = { x: 0, y: 0 };
    this.mousePosition = { x: 0, y: 0 };
    this.mouseOffset = { x: 0, y: 0 };
    this.mouseOrigin = mouseOrigin ?? eventSource;
    this.mouseWheel = 0;
    this.pressedButtons = new Set();

    // Define and attach event listeners
    const handlers: [string, (event: any) => void, boolean][] = [
      ["contextmenu", () => {}, true], // NoOp, just disable context menu on canvas
      [
        "keydown",
        (event: KeyboardEvent) => {
          if (event.repeat) {
            return;
          }

          this.processKeyPress(event.key, true);
        },
        true,
      ],
      [
        "keyup",
        (event: KeyboardEvent) => {
          if (event.repeat) {
            return;
          }

          this.processKeyPress(event.key, false);
        },
        true,
      ],
      [
        "mousedown",
        (event: MouseEvent) =>
          this.processKeyPress(event.button.toString(), true),
        false,
      ],
      ["mousemove", (event: MouseEvent) => this.processMouseMove(event), false],
      [
        "mouseup",
        (event: MouseEvent) =>
          this.processKeyPress(event.button.toString(), false),
        false,
      ],
      [
        "mousewheel",
        (event: WheelEvent) => this.processMouseWheel(event.deltaX / 120),
        true,
      ],
      [
        "DOMMouseScroll",
        (event: WheelEvent) => this.processMouseWheel(-event.detail / 3),
        true,
      ],
    ];

    for (const [name, callback, cancel] of handlers) {
      eventSource.addEventListener(name, (e) => {
        const event = e || window.event;

        if (cancel) {
          event.preventDefault?.();
          event.stopPropagation?.();
        }

        callback(event);
      });
    }

    // Register known keys as buttons
    for (const key in Key) {
      this.assign(key.toLowerCase(), Key[key as keyof typeof Key]);
    }

    // Relocate mouse on window resize
    window.addEventListener("resize", () => this.mouseRelocate());

    this.mouseRelocate();
  }

  /*
   ** Assign button to key.
   ** button: user-defined button ID to be associated to key
   ** key: target key
   */
  public assign(button: Button, key: Key) {
    let buttonSetups = this.buttonMap.get(key);

    if (buttonSetups === undefined) {
      buttonSetups = [];

      this.buttonMap.set(key, buttonSetups);
    }

    if (buttonSetups.every((buttonSetup) => buttonSetup.button !== button)) {
      buttonSetups.push({
        active: true,
        button: button,
      });
    }
  }

  /*
   ** Clear all keys mapped to given button.
   ** button:	button ID
   */
  public clear(button: Button) {
    for (const [key, buttonSetups] of this.buttonMap.entries()) {
      for (let i = buttonSetups.length; i-- > 0; ) {
        if (buttonSetups[i].button === button) {
          buttonSetups.splice(i, 1);
        }
      }

      if (buttonSetups.length === 0) {
        this.buttonMap.delete(key);
      }
    }

    this.pressedButtons.delete(button);
  }

  /*
   ** Disable presses on given button.
   */
  public disable(button: Button) {
    this.setActive(button, false);
  }

  /*
   ** Enable presses on given button.
   */
  public enable(button: Button) {
    this.setActive(button, true);
  }

  /*
   ** Get and reset mouse mouvement.
   */
  public fetchMovement() {
    const { x, y } = this.mouseMouvement;

    this.mouseMouvement.x = 0;
    this.mouseMouvement.y = 0;

    return { x, y };
  }

  /*
   ** Get and reset button pressed state.
   */
  public fetchPressed(button: Button) {
    const state = this.pressedButtons.has(button);

    this.pressedButtons.delete(button);

    return state;
  }

  /*
   ** Get and reset mouse wheel delta.
   */
  public fetchWheel() {
    const wheel = this.mouseWheel;

    this.mouseWheel = 0;

    return wheel;
  }

  /*
   ** Read mouse current relative position.
   */
  public getPosition() {
    return this.mousePosition;
  }

  /*
   ** Check if button is pressed.
   */
  public isPressed(buttonId: Button) {
    return this.pressedButtons.has(buttonId);
  }

  /*
   ** Reset mouse offset location.
   ** input:	input instance
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

  /*
   ** Change state of enabled buttons in given list.
   ** states: current button states
   ** buttons: button IDs list
   ** value: new button state
   */
  private processKeyPress(key: string, pressed: boolean) {
    const buttonSetups = this.buttonMap.get(key) ?? emptyButtonSetups;

    for (const buttonSetup of buttonSetups) {
      if (buttonSetup.active) {
        if (pressed) {
          this.pressedButtons.add(buttonSetup.button);
        } else {
          this.pressedButtons.delete(buttonSetup.button);
        }
      }
    }
  }

  /*
   ** Update mouse position.
   */
  private processMouseMove(event: MouseEvent) {
    const locationX = event.pageX - this.mouseOffset.x;
    const locationY = event.pageY - this.mouseOffset.y;

    if (event.movementX !== undefined && event.movementY !== undefined) {
      this.mouseMouvement.x += event.movementX;
      this.mouseMouvement.y += event.movementY;
    } else {
      this.mouseMouvement.x += locationX - this.mousePosition.x;
      this.mouseMouvement.y += locationY - this.mousePosition.y;
    }

    this.mousePosition.x = locationX;
    this.mousePosition.y = locationY;
  }

  /*
   ** Update moues wheel delta.
   */
  private processMouseWheel(wheel: number) {
    this.mouseWheel += wheel;
  }

  /*
   ** Enable or disable button presses.
   */
  private setActive(button: Button, enabled: boolean) {
    for (const [_, buttonSetups] of this.buttonMap.entries()) {
      for (const buttonSetup of buttonSetups) {
        if (buttonSetup.button === button) {
          buttonSetup.active = enabled;
        }
      }
    }
  }
}

/*
 ** Mouse and keyboard key codes.
 */
enum Key {
  MouseLeft = "0",
  MouseMiddle = "1",
  MouseRight = "2",
  Backspace = "Backspace",
  Tab = "Tab",
  Enter = "Enter",
  Shift = "Shift",
  Control = "Control",
  Alt = "Alt",
  Pause = "Pause",
  Capslock = "Capslock",
  Escape = "Escape",
  Space = " ",
  PageUp = "PageUp",
  PageDown = "PageDown",
  End = "End",
  Home = "Home",
  ArrowLeft = "ArrowLeft",
  ArrowUp = "ArrowUp",
  ArrowRight = "ArrowRight",
  ArrowDown = "ArrowDown",
  Insert = "Insert",
  Delete = "Delete",
  OS = "OS",
  Numlock = "NumLock",
}

export { Input, Key };
