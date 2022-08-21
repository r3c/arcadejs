interface Vector2 {
  readonly x: number;
  readonly y: number;
}

interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Vector4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

class Vector2 {
  public static readonly zero: Vector2 = { x: 0, y: 0 };

  public static sub(lhs: Vector2, rhs: Vector2): Vector2 {
    return {
      x: lhs.x - rhs.x,
      y: lhs.y - rhs.y,
    };
  }

  public static toArray(vector: Vector2): number[] {
    return [vector.x, vector.y];
  }
}

class Vector3 {
  public static readonly zero: Vector3 = { x: 0, y: 0, z: 0 };

  public static add(lhs: Vector3, rhs: Vector3): Vector3 {
    return {
      x: lhs.x + rhs.x,
      y: lhs.y + rhs.y,
      z: lhs.z + rhs.z,
    };
  }

  public static cross(lhs: Vector3, rhs: Vector3): Vector3 {
    const { x: lx, y: ly, z: lz } = lhs;
    const { x: rx, y: ry, z: rz } = rhs;

    return {
      x: ly * rz - lz * ry,
      y: lz * rx - lx * rz,
      z: lx * ry - ly * rx,
    };
  }

  public static dot(lhs: Vector3, rhs: Vector3): number {
    return lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
  }

  public static len(vector: Vector3): number {
    const { x, y, z } = vector;

    return Math.sqrt(x * x + y * y + z * z);
  }

  public static map(vector: Vector3, callback: (v: number) => number): Vector3 {
    return {
      x: callback(vector.x),
      y: callback(vector.y),
      z: callback(vector.z),
    };
  }

  public static normalize(vector: Vector3): Vector3 {
    const length = Vector3.len(vector);

    if (length === 0) {
      return vector;
    }

    const lengthInverse = 1 / length;

    return {
      x: vector.x * lengthInverse,
      y: vector.y * lengthInverse,
      z: vector.z * lengthInverse,
    };
  }

  public static scale(vector: Vector3, factor: number): Vector3 {
    return {
      x: vector.x * factor,
      y: vector.y * factor,
      z: vector.z * factor,
    };
  }

  public static sub(lhs: Vector3, rhs: Vector3): Vector3 {
    return {
      x: lhs.x - rhs.x,
      y: lhs.y - rhs.y,
      z: lhs.z - rhs.z,
    };
  }

  public static toArray(vector: Vector3): number[] {
    return [vector.x, vector.y, vector.z];
  }
}

class Vector4 {
  public static readonly one: Vector4 = { x: 1, y: 1, z: 1, w: 1 };
  public static readonly zero: Vector4 = { x: 0, y: 0, z: 0, w: 0 };

  public static toArray(vector: Vector4): number[] {
    return [vector.x, vector.y, vector.z, vector.w];
  }
}

export { Vector2, Vector3, Vector4 };
