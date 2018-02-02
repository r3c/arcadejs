
class Matrix {
	private static readonly identity: Matrix = new Matrix([
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1
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
			2 / (xMax - xMin), 0, 0, 0,
			0, 2 / (yMax - yMin), 0, 0,
			0, 0, -2 / (zMax - zMin), 0,
			-(xMax + xMin) / (xMax - xMin), -(yMax + yMin) / (yMax - yMin), -(zMax + zMin) / (zMax - zMin), 1
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
			0, 0, (zMax + zMin) * q, -1,
			0, 0, (2 * zMax * zMin) * q, 0
		]);
	}

	private constructor(values: number[]) {
		this.values = values;
	}

	public compose(other: Matrix) {
		return new Matrix(Matrix.multiply(this.values, other.values));
	}

	public getTransposedInverse3x3() {
		const m = this.values;
		const determinant =
			m[0] * (m[5] * m[10] - m[6] * m[9]) -
			m[1] * (m[4] * m[10] - m[6] * m[8]) +
			m[2] * (m[4] * m[9] - m[5] * m[8]);

		if (determinant < Number.EPSILON)
			return m;

		const inverse = 1 / determinant;

		return [
			(m[5] * m[10] - m[9] * m[6]) * inverse,
			(m[4] * m[10] - m[6] * m[8]) * -inverse,
			(m[4] * m[9] - m[8] * m[5]) * inverse,
			(m[1] * m[10] - m[2] * m[9]) * -inverse,
			(m[0] * m[10] - m[2] * m[8]) * inverse,
			(m[0] * m[9] - m[8] * m[1]) * -inverse,
			(m[1] * m[6] - m[2] * m[5]) * inverse,
			(m[0] * m[6] - m[4] * m[2]) * -inverse,
			(m[0] * m[5] - m[4] * m[1]) * inverse
		];
	}

	public getValues() {
		return this.values;
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
			xCos * x + cos, xCos * y - zSin, xCos * z + ySin, 0,
			xCos * y + zSin, yCos * y + cos, yCos * z - xSin, 0,
			xCos * z - ySin, yCos * z + xSin, zCos * z + cos, 0,
			0, 0, 0, 1
		]));
	}

	public transform(vertex: Vector4) {
		const m = this.values;

		return {
			x: vertex.x * m[0] + vertex.y * m[4] + vertex.z * m[8] + vertex.w * m[12],
			y: vertex.x * m[1] + vertex.y * m[5] + vertex.z * m[9] + vertex.w * m[13],
			z: vertex.x * m[2] + vertex.y * m[6] + vertex.z * m[10] + vertex.w * m[14],
			w: vertex.x * m[3] + vertex.y * m[7] + vertex.z * m[11] + vertex.w * m[15]
		};
	}

	public translate(vector: Vector3) {
		return new Matrix(Matrix.multiply(this.values, [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			vector.x, vector.y, vector.z, 1
		]));
	}

	private static multiply(lhs: number[], rhs: number[]) {
		return [
			lhs[0] * rhs[0] + lhs[4] * rhs[1] + lhs[8] * rhs[2] + lhs[12] * rhs[3],
			lhs[1] * rhs[0] + lhs[5] * rhs[1] + lhs[9] * rhs[2] + lhs[13] * rhs[3],
			lhs[2] * rhs[0] + lhs[6] * rhs[1] + lhs[10] * rhs[2] + lhs[14] * rhs[3],
			lhs[3] * rhs[0] + lhs[7] * rhs[1] + lhs[11] * rhs[2] + lhs[15] * rhs[3],
			lhs[0] * rhs[4] + lhs[4] * rhs[5] + lhs[8] * rhs[6] + lhs[12] * rhs[7],
			lhs[1] * rhs[4] + lhs[5] * rhs[5] + lhs[9] * rhs[6] + lhs[13] * rhs[7],
			lhs[2] * rhs[4] + lhs[6] * rhs[5] + lhs[10] * rhs[6] + lhs[14] * rhs[7],
			lhs[3] * rhs[4] + lhs[7] * rhs[5] + lhs[11] * rhs[6] + lhs[15] * rhs[7],
			lhs[0] * rhs[8] + lhs[4] * rhs[9] + lhs[8] * rhs[10] + lhs[12] * rhs[11],
			lhs[1] * rhs[8] + lhs[5] * rhs[9] + lhs[9] * rhs[10] + lhs[13] * rhs[11],
			lhs[2] * rhs[8] + lhs[6] * rhs[9] + lhs[10] * rhs[10] + lhs[14] * rhs[11],
			lhs[3] * rhs[8] + lhs[7] * rhs[9] + lhs[11] * rhs[10] + lhs[15] * rhs[11],
			lhs[0] * rhs[12] + lhs[4] * rhs[13] + lhs[8] * rhs[14] + lhs[12] * rhs[15],
			lhs[1] * rhs[12] + lhs[5] * rhs[13] + lhs[9] * rhs[14] + lhs[13] * rhs[15],
			lhs[2] * rhs[12] + lhs[6] * rhs[13] + lhs[10] * rhs[14] + lhs[14] * rhs[15],
			lhs[3] * rhs[12] + lhs[7] * rhs[13] + lhs[11] * rhs[14] + lhs[15] * rhs[15]
		];
	}
}

interface Vector2 {
	x: number,
	y: number
}

interface Vector3 {
	x: number,
	y: number,
	z: number
}

interface Vector4 {
	x: number,
	y: number,
	z: number,
	w: number
}

class Vector {
	public static cross(lhs: Vector3, rhs: Vector3) {
		return {
			x: lhs.y * rhs.z - lhs.z * rhs.y,
			y: lhs.z * rhs.x - lhs.x * rhs.z,
			z: lhs.x * rhs.y - lhs.y * rhs.x
		};
	}

	public static normalize3(vector: Vector3) {
		const invLength = 1 / Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

		return {
			x: vector.x * invLength,
			y: vector.y * invLength,
			z: vector.z * invLength
		};
	}

	public static scale3(vector: Vector3, factor: number) {
		return {
			x: vector.x * factor,
			y: vector.y * factor,
			z: vector.z * factor
		};
	}

	public static substract2(lhs: Vector2, rhs: Vector2) {
		return {
			x: lhs.x - rhs.x,
			y: lhs.y - rhs.y
		};
	}

	public static substract3(lhs: Vector3, rhs: Vector3) {
		return {
			x: lhs.x - rhs.x,
			y: lhs.y - rhs.y,
			z: lhs.z - rhs.z
		};
	}
}

export { Matrix, Vector, Vector2, Vector3, Vector4 };
