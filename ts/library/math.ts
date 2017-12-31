
class Matrix {
	private static readonly identity: Matrix = new Matrix([
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 0
	]);

	private readonly values: number[];

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
		return new Matrix([
			2 / (xMax - xMin), 0, 0, -(xMax + xMin) / (xMax - xMin),
			0, 2 / (yMax - yMin), 0, -(yMax + yMin) / (yMax - yMin),
			0, 0, -2 / (zMax - zMin), -(zMax + zMin) / (zMax - zMin),
			0, 0, 0, 1
		]);
	}

	/*
	** Create new perspective projection matrix.
	** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml
	*/
	public static createPerspective(angle: number, ratio: number, zMin: number, zMax: number) {
		var f = 1.0 / Math.tan(angle * Math.PI / 360.0);
		var q = 1 / (zMin - zMax);

		return new Matrix([
			f / ratio, 0, 0, 0,
			0, f, 0, 0,
			0, 0, (zMax + zMin) * q, (2 * zMax * zMin) * q,
			0, 0, -1, 0
		]);
	}

	private constructor(values: number[]) {
		this.values = values;
	}

	public compose(other: Matrix) {
		return new Matrix(Matrix.multiply(this.values, other.values));
	}

	/*
	** Rotate matrix around an arbitrary axis
	** From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
	*/
	public rotate(axis: Vector3, angle: number) {
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

		return new Matrix(Matrix.multiply(this.values, [
			xCos * x + cos, xCos * y + zSin, xCos * z - ySin, 0,
			xCos * y - zSin, yCos * y + cos, yCos * z + xSin, 0,
			xCos * z + ySin, yCos * z - xSin, zCos * z + cos, 0,
			0, 0, 0, 1
		]));
	}

	public transform(vertex: Vector3) {
		const m = this.values;

		const x = vertex.x * m[0] + vertex.y * m[1] + vertex.z * m[2] + m[3];
		const y = vertex.x * m[4] + vertex.y * m[5] + vertex.z * m[6] + m[7];
		const z = vertex.x * m[8] + vertex.y * m[9] + vertex.z * m[10] + m[11];
		const w = vertex.x * m[12] + vertex.y * m[13] + vertex.z * m[14] + m[15];

		const normalize = 1 / w;

		return {
			x: x * normalize,
			y: y * normalize,
			z: z * normalize
		};
	}

	public translate(vector: Vector3) {
		return new Matrix(Matrix.multiply(this.values, [
			1, 0, 0, vector.x,
			0, 1, 0, vector.y,
			0, 0, 1, vector.z,
			0, 0, 0, 1
		]));
	}

	private static multiply(lhs: number[], rhs: number[]) {
		return [
			lhs[0] * rhs[0] + lhs[1] * rhs[4] + lhs[2] * rhs[8] + lhs[3] * rhs[12],
			lhs[0] * rhs[1] + lhs[1] * rhs[5] + lhs[2] * rhs[9] + lhs[3] * rhs[13],
			lhs[0] * rhs[2] + lhs[1] * rhs[6] + lhs[2] * rhs[10] + lhs[3] * rhs[14],
			lhs[0] * rhs[3] + lhs[1] * rhs[7] + lhs[2] * rhs[11] + lhs[3] * rhs[15],
			lhs[4] * rhs[0] + lhs[5] * rhs[4] + lhs[6] * rhs[8] + lhs[7] * rhs[12],
			lhs[4] * rhs[1] + lhs[5] * rhs[5] + lhs[6] * rhs[9] + lhs[7] * rhs[13],
			lhs[4] * rhs[2] + lhs[5] * rhs[6] + lhs[6] * rhs[10] + lhs[7] * rhs[14],
			lhs[4] * rhs[3] + lhs[5] * rhs[7] + lhs[6] * rhs[11] + lhs[7] * rhs[15],
			lhs[8] * rhs[0] + lhs[9] * rhs[4] + lhs[10] * rhs[8] + lhs[11] * rhs[12],
			lhs[8] * rhs[1] + lhs[9] * rhs[5] + lhs[10] * rhs[9] + lhs[11] * rhs[13],
			lhs[8] * rhs[2] + lhs[9] * rhs[6] + lhs[10] * rhs[10] + lhs[11] * rhs[14],
			lhs[8] * rhs[3] + lhs[9] * rhs[7] + lhs[10] * rhs[11] + lhs[11] * rhs[15],
			lhs[12] * rhs[0] + lhs[13] * rhs[4] + lhs[14] * rhs[8] + lhs[15] * rhs[12],
			lhs[12] * rhs[1] + lhs[13] * rhs[5] + lhs[14] * rhs[9] + lhs[15] * rhs[13],
			lhs[12] * rhs[2] + lhs[13] * rhs[6] + lhs[14] * rhs[10] + lhs[15] * rhs[14],
			lhs[12] * rhs[3] + lhs[13] * rhs[7] + lhs[14] * rhs[11] + lhs[15] * rhs[15]
		];
	}
};

interface Vector2 {
	x: number,
	y: number
};

interface Vector3 {
	x: number,
	y: number,
	z: number
};

export { Matrix, Vector2, Vector3 };
