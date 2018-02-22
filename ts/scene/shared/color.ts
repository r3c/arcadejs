
const createBright = (index: number) => {
	const u = ((index * 1.17) % 2 - 1) * 0.436;
	const v = ((index * 1.43) % 2 - 1) * 0.615;

	return {
		x: 1.0 + 1.13983 * v,
		y: 1.0 - 0.39465 * u - 0.5806 * v,
		z: 1.0 + 2.03211 * u
	};
};

export { createBright }