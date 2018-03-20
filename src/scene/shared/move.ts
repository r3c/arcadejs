import * as vector from "../../engine/math/vector";

const rotate = (index: number, amount: number, radius: number) => {
	const offset = index + 1;
	const pitch = (offset * 11 % 41) / 41 * 2 * Math.PI + amount * ((offset * 17) % 47) / 47;
	const yaw = (offset * 23 % 59) / 59 * 2 * Math.PI + amount * ((offset * 31) % 67) / 67;

	return vector.Vector3.scale({
		x: Math.cos(yaw) * Math.cos(pitch),
		y: Math.sin(yaw) * Math.cos(pitch),
		z: Math.sin(pitch)
	}, radius);
};

export { rotate }