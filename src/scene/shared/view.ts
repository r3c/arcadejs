import * as controller from "../../engine/controller";
import * as vector from "../../engine/math/vector";

const ease = (from: vector.Vector3, to: vector.Vector3, speed: number) => {
	return {
		x: from.x + (to.x - from.x) * speed,
		y: from.y + (to.y - from.y) * speed,
		z: from.z + (to.z - from.z) * speed
	}
};

class Camera {
	public position: vector.Vector3;
	public rotation: vector.Vector3;

	private nextPosition: vector.Vector3;
	private nextRotation: vector.Vector3;

	public constructor(position: vector.Vector3, rotation: vector.Vector3) {
		this.nextPosition = position;
		this.nextRotation = rotation;
		this.position = position;
		this.rotation = rotation;
	}

	public move(input: controller.Input) {
		const movement = input.fetchMovement();
		const wheel = input.fetchWheel();

		const deltaPosition = input.isPressed("mouseleft") ?
			{ x: movement.x / 64, y: -movement.y / 64 } :
			vector.Vector2.zero;

		const deltaRotation = input.isPressed("mouseright") ?
			{ x: -movement.y / 64, y: -movement.x / 64 } :
			vector.Vector2.zero;

		this.nextPosition = {
			x: this.nextPosition.x + deltaPosition.x,
			y: this.nextPosition.y + deltaPosition.y,
			z: this.nextPosition.z + wheel
		};

		this.nextRotation = {
			x: this.nextRotation.x + deltaRotation.x,
			y: this.nextRotation.y + deltaRotation.y,
			z: this.nextRotation.z
		};

		this.position = ease(this.position, this.nextPosition, 0.2);
		this.rotation = ease(this.rotation, this.nextRotation, 0.2);
	}
}

export { Camera }