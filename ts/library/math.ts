import * as mathjs from "mathjs";

class Matrix {
	private static readonly identity: Matrix = new Matrix(mathjs.matrix([
		[1, 0, 0, 0],
		[0, 1, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 0]
	]));

	private readonly matrix: mathjs.Matrix;

	/*
	** Create new identity matrix (actually returns a static immutable instance).
	*/
	public static createIdentity() {
		return Matrix.identity;
	}

	/*
	** Create new orthographic projection matrix.
	** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/glOrtho.xml
	*/
	public static createOrthographic(xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number) {
		return new Matrix(mathjs.matrix([
			[2 / (xMax - xMin), 0, 0, -(xMax + xMin) / (xMax - xMin)],
			[0, 2 / (yMax - yMin), 0, -(yMax + yMin) / (yMax - yMin)],
			[0, 0, -2 / (zMax - zMin), -(zMax + zMin) / (zMax - zMin)],
			[0, 0, 0, 1]
		]));
	}

	/*
	** Create new perspective projection matrix.
	** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml
	*/
	public static createPerspective(angle: number, ratio: number, zMin: number, zMax: number) {
		var f = 1.0 / Math.tan(angle * Math.PI / 360.0);
		var q = 1 / (zMin - zMax);

		return new Matrix(mathjs.matrix([
			[f / ratio, 0, 0, 0],
			[0, f, 0, 0],
			[0, 0, (zMax + zMin) * q, (2 * zMax * zMin) * q],
			[0, 0, -1, 0]
		]));
	}

	private constructor(matrix: mathjs.Matrix) {
		this.matrix = matrix;
	}

	public multiply(other: Matrix) {
		return new Matrix(mathjs.multiply(this.matrix, other.matrix));
	}

	/*
	** Rotate matrix around an arbitrary axis
	** From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
	*/
	public rotate(axis: Point3D, angle: number) {
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

		return new Matrix(mathjs.multiply(this.matrix, mathjs.matrix([
			[xCos * x + cos, xCos * y + zSin, xCos * z - ySin, 0],
			[xCos * y - zSin, yCos * y + cos, yCos * z + xSin, 0],
			[xCos * z + ySin, yCos * z - xSin, zCos * z + cos, 0],
			[0, 0, 0, 1]
		])));
	}

	public transform(vertex: Point3D) {
		const transform = mathjs.multiply(this.matrix, mathjs.matrix([vertex.x, vertex.y, vertex.z, 1]));
		const normalize = 1 / transform.get([3]);

		return {
			x: transform.get([0]) * normalize,
			y: transform.get([1]) * normalize,
			z: transform.get([2]) * normalize
		};
	}

	public translate(vector: Point3D) {
		return new Matrix(mathjs.multiply(this.matrix, mathjs.matrix([
			[1, 0, 0, vector.x],
			[0, 1, 0, vector.y],
			[0, 0, 1, vector.z],
			[0, 0, 0, 1]
		])));
	}
};

interface Point2D {
	x: number,
	y: number
};

interface Point3D {
	x: number,
	y: number,
	z: number
};

export { Matrix, Point2D, Point3D };
