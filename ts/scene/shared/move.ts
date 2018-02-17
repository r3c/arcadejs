import * as vector from "../../engine/math/vector";

const rotate = (index: number, amount: number, radius: number) => {
	const pitch = index / 17 * Math.PI + amount * (((index + 1) * 19) % 23);
	const yaw = index / 29 * Math.PI + amount * (((index + 1) * 31) % 37);

	return vector.Vector3.scale({
		x: Math.cos(yaw) * Math.cos(pitch),
		y: Math.sin(yaw) * Math.cos(pitch),
		z: Math.sin(pitch)
	}, radius);
};

export { rotate }