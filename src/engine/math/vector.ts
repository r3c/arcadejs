interface Vector2 {
	readonly x: number,
	readonly y: number
}

interface Vector3 {
	readonly x: number,
	readonly y: number,
	readonly z: number
}

interface Vector4 {
	readonly x: number,
	readonly y: number,
	readonly z: number,
	readonly w: number
}

class Vector2 {
	public static readonly zero: Vector2 = { x: 0, y: 0 };

	public static sub(lhs: Vector2, rhs: Vector2) {
		return {
			x: lhs.x - rhs.x,
			y: lhs.y - rhs.y
		};
	}

	public static toArray(vector: Vector2) {
		return [vector.x, vector.y];
	}
}

class Vector3 {
	public static readonly zero: Vector3 = { x: 0, y: 0, z: 0 };

	public static add(lhs: Vector3, rhs: Vector3) {
		return {
			x: lhs.x + rhs.x,
			y: lhs.y + rhs.y,
			z: lhs.z + rhs.z
		};
	}

	public static cross(lhs: Vector3, rhs: Vector3) {
		return {
			x: lhs.y * rhs.z - lhs.z * rhs.y,
			y: lhs.z * rhs.x - lhs.x * rhs.z,
			z: lhs.x * rhs.y - lhs.y * rhs.x
		};
	}

	public static dot(lhs: Vector3, rhs: Vector3) {
		return lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
	}

	public static normalize(vector: Vector3) {
		const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

		if (length === 0)
			return vector;

		const invLength = 1 / length;

		return {
			x: vector.x * invLength,
			y: vector.y * invLength,
			z: vector.z * invLength
		};
	}

	public static scale(vector: Vector3, factor: number) {
		return {
			x: vector.x * factor,
			y: vector.y * factor,
			z: vector.z * factor
		};
	}

	public static sub(lhs: Vector3, rhs: Vector3) {
		return {
			x: lhs.x - rhs.x,
			y: lhs.y - rhs.y,
			z: lhs.z - rhs.z
		};
	}

	public static toArray(vector: Vector3) {
		return [vector.x, vector.y, vector.z];
	}
}

class Vector4 {
	public static readonly zero: Vector4 = { x: 0, y: 0, z: 0, w: 0 };

	public static toArray(vector: Vector4) {
		return [vector.x, vector.y, vector.z, vector.w];
	}
}

export { Vector2, Vector3, Vector4 }
