import * as math from "mathjs";

interface Point2D {
	x: number,
	y: number
};

interface Point3D {
	x: number,
	y: number,
	z: number
};

const perspective = function (view: mathjs.Matrix, point: Point3D, screenSize: Point2D): Point2D {
	const px = view.get([0, 0]) * point.x + view.get([0, 1]) * point.y + view.get([0, 2]) * point.z + view.get([0, 3]);
	const py = view.get([1, 0]) * point.x + view.get([1, 1]) * point.y + view.get([1, 2]) * point.z + view.get([1, 3]);
	const pz = view.get([2, 0]) * point.x + view.get([2, 1]) * point.y + view.get([2, 2]) * point.z + view.get([2, 3]);

	const halfScreenWidth = screenSize.x / 2;
	const halfScreenHeight = screenSize.y / 2;
	const haltScreenMin = Math.min(halfScreenWidth, halfScreenHeight);

	return {
		x: halfScreenWidth - haltScreenMin * px / pz,
		y: halfScreenHeight + haltScreenMin * py / pz
	};
};

const rotate = function (matrix: mathjs.Matrix, axis: Point3D, angle: number) {
	// Normalized axis
	const modInv = 1 / Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
	const x = axis.x * modInv;
	const y = axis.y * modInv;
	const z = axis.z * modInv;

	// Rotation angle
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	// Factorized operands
	const xCos = x * (1 - cos);
	const yCos = y * (1 - cos);
	const zCos = z * (1 - cos);
	const xSin = x * sin;
	const ySin = y * sin;
	const zSin = z * sin;

	// Rotation matrix around an arbitrary axis
	// From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
	return math.multiply(matrix, math.matrix([
		[xCos * x + cos, xCos * y + zSin, xCos * z - ySin, 0],
		[xCos * y - zSin, yCos * y + cos, yCos * z + xSin, 0],
		[xCos * z + ySin, yCos * z - xSin, zCos * z + cos, 0],
		[0, 0, 0, 1]
	]));
}

const translate = function (matrix: mathjs.Matrix, vector: Point3D) {
	return math.multiply(matrix, math.matrix([
		[1, 0, 0, vector.x],
		[0, 1, 0, vector.y],
		[0, 0, 1, vector.z],
		[0, 0, 0, 1]
	]));
};

class View {
	private stack: mathjs.Matrix[];

	public constructor() {
		const identity = math.matrix([
			[1, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 1, 0],
			[0, 0, 0, 0]
		]);

		this.stack = [identity];
	}

	public enter() {
		this.stack.push(this.get());
	}

	public leave() {
		if (this.stack.length <= 1)
			throw new Error("cannot leave unentered scene state");

		return this.stack.pop();
	}

	public perspective(point: Point3D, screenSize: Point2D) {
		return perspective(this.get(), point, screenSize);
	}

	public rotate(axis: Point3D, angle: number) {
		this.set(rotate(this.get(), axis, angle));
	}

	public translate(vector: Point3D) {
		this.set(translate(this.get(), vector));
	}

	private get() {
		return this.stack[this.stack.length - 1];
	}

	private set(matrix: mathjs.Matrix) {
		this.stack[this.stack.length - 1] = matrix;
	}
}

export { Point2D, Point3D, View };