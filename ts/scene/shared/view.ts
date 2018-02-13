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

		if (input.isPressed("mouseleft")) {
			this.nextPosition.x += movement.x / 64;
			this.nextPosition.y -= movement.y / 64;
		}

		if (input.isPressed("mouseright")) {
			this.nextRotation.x -= movement.y / 64;
			this.nextRotation.y -= movement.x / 64;
		}

		this.nextPosition.z += wheel;

		this.position = ease(this.position, this.nextPosition, 0.2);
		this.rotation = ease(this.rotation, this.nextRotation, 0.2);
	}
}

export { Camera }