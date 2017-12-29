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

class Projection {
	private matrix: mathjs.Matrix;

	public get() {
		return this.matrix;
	}

	public setOrthographic(xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number) {
		this.matrix = math.matrix([
			[2 / (xMax - xMin), 0, 0, -(xMax + xMin) / (xMax - xMin)],
			[0, 2 / (yMax - yMin), 0, -(yMax + yMin) / (yMax - yMin)],
			[0, 0, -2 / (zMax - zMin), -(zMax + zMin) / (zMax - zMin)],
			[0, 0, 0, 1]
		]);
	}

	/*
	** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml
	*/
	public setPerspective(angle: number, ratio: number, zMin: number, zMax: number) {
		var f = 1.0 / Math.tan(angle * Math.PI / 360.0);
		var q = 1 / (zMin - zMax);

		this.matrix = math.matrix([
			[f / ratio, 0, 0, 0],
			[0, f, 0, 0],
			[0, 0, (zMax + zMin) * q, (2 * zMax * zMin) * q],
			[0, 0, -1, 0]
		]);
	}
}

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

	public rotate(axis: Point3D, angle: number) {
		this.set(rotate(this.get(), axis, angle));
	}

	public translate(vector: Point3D) {
		this.set(translate(this.get(), vector));
	}

	public get() {
		return this.stack[this.stack.length - 1];
	}

	private set(matrix: mathjs.Matrix) {
		this.stack[this.stack.length - 1] = matrix;
	}
}

export { Point2D, Point3D, Projection, View };