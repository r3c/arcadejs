import * as vector from "../../engine/math/vector";

const rotate = (index: number, amount: number, width: number, height: number) => {
	const offset = index + 1;

	const distance = Math.cos(((offset * 31) % 71) / 71 + amount * ((offset * 37) % 73) / 73 * 0.001);
	const pitch = (offset * 11 % 41) / 41 * 2 * Math.PI + amount * ((offset * 17) % 47) / 47;
	const yaw = (offset * 23 % 59) / 59 * 2 * Math.PI + amount * ((offset * 29) % 67) / 67;

	return {
		x: Math.cos(yaw) * Math.cos(pitch) * distance * width,
		y: Math.sin(pitch) * distance * height,
		z: Math.sin(yaw) * Math.cos(pitch) * distance * width
	};
};

export { rotate }