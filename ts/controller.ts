
/*
** Button unique identifier.
*/
type ButtonId = string;

/*
** Button configuration.
*/
interface Button {
	enabled: boolean,
	id: ButtonId
}

/*
** 2D position.
*/
interface Position {
	x: number,
	y: number
}

/*
** Keyboard & mouse input abstraction class.
*/
class Input {
	private buttonsMap: Map<number, Button[]>;
	private mouseMouvement: Position;
	private mousePosition: Position;
	private mouseOffset: Position;
	private mouseOrigin: HTMLElement;
	private mouseWheel: number;
	private presses: Map<ButtonId, boolean>;

	constructor(keySource: HTMLElement, mouseOrigin?: HTMLElement) {
		if (keySource.tabIndex < 0)
			throw Error('keySource element requires a \'tabindex="1"\' attribute to receive key inputs');

		this.buttonsMap = new Map<number, Button[]>();
		this.mouseMouvement = { x: 0, y: 0 };
		this.mousePosition = { x: 0, y: 0 };
		this.mouseOffset = { x: 0, y: 0 };
		this.mouseOrigin = mouseOrigin || keySource;
		this.mouseWheel = 0;
		this.presses = new Map<ButtonId, boolean>();

		// Define and attach event listeners
		let callbacks = {
			'contextmenu': (event: Event) => {}, // NoOp, just disable context menu on canvas
			'keydown': (event: KeyboardEvent) => this.processKeyPress(event.keyCode || event.which, true),
			'keyup': (event: KeyboardEvent) => this.processKeyPress(event.keyCode || event.which, false),
			'mousedown': (event: MouseEvent) => this.processKeyPress(event.button, true),
			'mousemove': (event: MouseEvent) => this.processMouseMove(event),
			'mouseup': (event: MouseEvent) => this.processKeyPress(event.button, false),
			'mousewheel': (event: MouseWheelEvent) => this.processMouseWheel(event.wheelDelta / 120),
			'DOMMouseScroll': (event: MouseWheelEvent) => this.processMouseWheel(-event.detail / 3)
		};

		for (var name in callbacks) {
			let handler = function (callback: any) {
				return (e: Event) => {
					var event = e || window.event;

					if (event.preventDefault)
						event.preventDefault();

					if (event.stopPropagation)
						event.stopPropagation();

					event.returnValue = false;

					callback(event);
				};
			}((<any>callbacks)[name]);

			keySource.addEventListener(name, handler, false);
		}

		// Register all known keys as buttons having the same lowercase name (e.g. Key.Left as button "left")
		for (let key in Key)
			this.assign(key.toLowerCase(), (<any>Key)[key]);

		// Relocate mouse on window resize
		window.addEventListener("resize", () => this.mouseRelocate());

		this.mouseRelocate();
	}

	/*
	** Internal assign function.
	*/
	public assign(buttonId: ButtonId, key: Key) {
		var buttons = this.buttonsMap.get(key);

		if (buttons === undefined) {
			buttons = [];

			this.buttonsMap.set(key, buttons);
		}

		for (let i = buttons.length; i-- > 0;) {
			if (buttons[i].id == buttonId)
				return;
		}

		buttons.push({
			enabled: true,
			id: buttonId
		});
	}

	/*
	** Clear all keys mapped to given button.
	** button:	button ID
	*/
	public clear(buttonId: ButtonId) {
		for (let [key, buttons] of this.buttonsMap) {
			for (let i = buttons.length; i-- > 0;) {
				if (buttons[i].id == buttonId)
					buttons.splice(i, 1);
			}

			if (buttons.length == 0)
				this.buttonsMap.delete(key);
		}

		this.presses.delete(buttonId);
	}

	/*
	** Disable presses on given button.
	*/
	public disable(buttonId: ButtonId) {
		this.setEnabled(buttonId, false);
	}

	/*
	** Enable presses on given button.
	*/
	public enable(buttonId: ButtonId) {
		this.setEnabled(buttonId, true);
	}

	/*
	** Get and reset mouse mouvement.
	*/
	public fetchMovement() {
		let { x, y } = this.mouseMouvement;

		this.mouseMouvement.x = 0;
		this.mouseMouvement.y = 0;

		return { x, y };
	}

	/*
	** Get and reset button pressed state.
	*/
	public fetchPressed(buttonId: ButtonId) {
		if (!this.presses.get(buttonId))
			return false;

		this.presses.set(buttonId, false);

		return true;
	}

	/*
	** Get and reset mouse wheel delta.
	*/
	public fetchWheel() {
		let wheel = this.mouseWheel;

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
	public isPressed(buttonId: ButtonId) {
		return !!this.presses.get(buttonId);
	}

	/*
	** Reset mouse offset location.
	** input:	input instance
	*/
	private mouseRelocate() {
		var mouseOffsetX = 0;
		var mouseOffsetY = 0;

		for (var element = this.mouseOrigin; element !== null && element.offsetParent instanceof HTMLElement; element = element.offsetParent) {
			mouseOffsetX += element.offsetLeft;
			mouseOffsetY += element.offsetTop;
		}

		this.mouseOffset.x = mouseOffsetX;
		this.mouseOffset.y = mouseOffsetY;
	}

	/*
	** Change state of enabled buttons in given list.
	** states:	current button states
	** buttons:	button IDs list
	** value:	new button state
	*/
	private processKeyPress(key: number, pressed: boolean) {
		let buttons = this.buttonsMap.get(key);

		if (buttons === undefined)
			return;

		for (let button of buttons) {
			if (button.enabled)
				this.presses.set(button.id, pressed);
		}
	}

	/*
	** Update mouse position.
	*/
	private processMouseMove(event: MouseEvent) {
		let locationX = event.pageX - this.mouseOffset.x;
		let locationY = event.pageY - this.mouseOffset.y;

		if (event.movementX !== undefined && event.movementY !== undefined) {
			this.mouseMouvement.x += event.movementX;
			this.mouseMouvement.y += event.movementY;
		}
		else {
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
	private setEnabled(buttonId: ButtonId, enabled: boolean) {
		for (let [key, buttons] of this.buttonsMap) {
			for (let button of buttons) {
				if (button.id == buttonId)
					button.enabled = enabled;
			}
		}
	}
};

/*
** Mouse and keyboard key codes.
*/
enum Key {
	MouseLeft = 0,
	MouseMiddle = 1,
	MouseRight = 2,
	Backspace = 8,
	Tab = 9,
	Enter = 13,
	Shift = 16,
	Control = 17,
	Alt = 18,
	Pause = 19,
	Capslock = 20,
	Escape = 27,
	Space = 32,
	PageUp = 33,
	PageDown = 34,
	End = 35,
	Home = 36,
	Left = 37,
	Up = 38,
	Right = 39,
	Down = 40,
	Insert = 45,
	Delete = 46,
	Windows = 91,
	Numlock = 144
};

export { Input, Key };