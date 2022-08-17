import { Vector3, Vector4 } from "./vector";

type Matrix4Data = Pick<
  Matrix4,
  | "v00"
  | "v01"
  | "v02"
  | "v03"
  | "v10"
  | "v11"
  | "v12"
  | "v13"
  | "v20"
  | "v21"
  | "v22"
  | "v23"
  | "v30"
  | "v31"
  | "v32"
  | "v33"
>;

class Matrix4 {
  private static readonly identity3: [1, 0, 0, 0, 1, 0, 0, 0, 1];

  public v00: number;
  public v01: number;
  public v02: number;
  public v03: number;
  public v10: number;
  public v11: number;
  public v12: number;
  public v13: number;
  public v20: number;
  public v21: number;
  public v22: number;
  public v23: number;
  public v30: number;
  public v31: number;
  public v32: number;
  public v33: number;

  /*
   ** Create new matrix for "looking to given direction" transformation.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluLookAt.xml
   */
  public static createDirection(direction: Vector3, up: Vector3): Matrix4 {
    const f = Vector3.normalize(direction);
    const s = Vector3.cross(f, Vector3.normalize(up));
    const u = Vector3.cross(Vector3.normalize(s), f);

    return new Matrix4({
      v00: s.x,
      v01: u.x,
      v02: -f.x,
      v03: 0,
      v10: s.y,
      v11: u.y,
      v12: -f.y,
      v13: 0,
      v20: s.z,
      v21: u.z,
      v22: -f.z,
      v23: 0,
      v30: 0,
      v31: 0,
      v32: 0,
      v33: 1,
    });
  }

  public static createIdentity(): Matrix4 {
    return new Matrix4({
      v00: 1,
      v01: 0,
      v02: 0,
      v03: 0,
      v10: 0,
      v11: 1,
      v12: 0,
      v13: 0,
      v20: 0,
      v21: 0,
      v22: 1,
      v23: 0,
      v30: 0,
      v31: 0,
      v32: 0,
      v33: 1,
    });
  }

  /*
   ** Create new orthographic projection matrix.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/glOrtho.xml
   */
  public static createOrthographic(
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    zMin: number,
    zMax: number
  ): Matrix4 {
    const dx = xMax - xMin;
    const dy = yMax - yMin;
    const dz = zMax - zMin;

    return new Matrix4({
      v00: 2 / dx,
      v01: 0,
      v02: 0,
      v03: 0,
      v10: 0,
      v11: 2 / dy,
      v12: 0,
      v13: 0,
      v20: 0,
      v21: 0,
      v22: -2 / dz,
      v23: 0,
      v30: -(xMax + xMin) / dx,
      v31: -(yMax + yMin) / dy,
      v32: -(zMax + zMin) / dz,
      v33: 1,
    });
  }

  /*
   ** Create new perspective projection matrix.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml
   */
  public static createPerspective(
    angle: number,
    ratio: number,
    zMin: number,
    zMax: number
  ): Matrix4 {
    var f = 1.0 / Math.tan((angle * Math.PI) / 360.0);
    var q = 1 / (zMin - zMax);

    return new Matrix4({
      v00: f / ratio,
      v01: 0,
      v02: 0,
      v03: 0,
      v10: 0,
      v11: f,
      v12: 0,
      v13: 0,
      v20: 0,
      v21: 0,
      v22: (zMax + zMin) * q,
      v23: -1,
      v30: 0,
      v31: 0,
      v32: 2 * zMax * zMin * q,
      v33: 0,
    });
  }

  public static fromArray(values: number[]): Matrix4 {
    if (values.length !== 16) {
      throw Error("4x4 matrix must contain 16 elements");
    }

    return new Matrix4({
      v00: values[0],
      v01: values[1],
      v02: values[2],
      v03: values[3],
      v10: values[4],
      v11: values[5],
      v12: values[6],
      v13: values[7],
      v20: values[8],
      v21: values[9],
      v22: values[10],
      v23: values[11],
      v30: values[12],
      v31: values[13],
      v32: values[14],
      v33: values[15],
    });
  }

  public static fromObject(obj: Matrix4Data): Matrix4 {
    return new Matrix4(obj);
  }

  private constructor(obj: Matrix4Data) {
    this.v00 = obj.v00;
    this.v01 = obj.v01;
    this.v02 = obj.v02;
    this.v03 = obj.v03;
    this.v10 = obj.v10;
    this.v11 = obj.v11;
    this.v12 = obj.v12;
    this.v13 = obj.v13;
    this.v20 = obj.v20;
    this.v21 = obj.v21;
    this.v22 = obj.v22;
    this.v23 = obj.v23;
    this.v30 = obj.v30;
    this.v31 = obj.v31;
    this.v32 = obj.v32;
    this.v33 = obj.v33;
  }

  public clone(): Matrix4 {
    return new Matrix4(this);
  }

  /*
   ** From: https://github.com/jlyharia/Computer_GraphicsII/blob/master/gluInvertMatrix.h
   */
  public invert(): Matrix4 {
    const v00 =
      this.v11 * this.v22 * this.v33 -
      this.v11 * this.v23 * this.v32 -
      this.v21 * this.v12 * this.v33 +
      this.v21 * this.v13 * this.v32 +
      this.v31 * this.v12 * this.v23 -
      this.v31 * this.v13 * this.v22;

    const v10 =
      -this.v10 * this.v22 * this.v33 +
      this.v10 * this.v23 * this.v32 +
      this.v20 * this.v12 * this.v33 -
      this.v20 * this.v13 * this.v32 -
      this.v30 * this.v12 * this.v23 +
      this.v30 * this.v13 * this.v22;

    const v20 =
      this.v10 * this.v21 * this.v33 -
      this.v10 * this.v23 * this.v31 -
      this.v20 * this.v11 * this.v33 +
      this.v20 * this.v13 * this.v31 +
      this.v30 * this.v11 * this.v23 -
      this.v30 * this.v13 * this.v21;

    const v30 =
      -this.v10 * this.v21 * this.v32 +
      this.v10 * this.v22 * this.v31 +
      this.v20 * this.v11 * this.v32 -
      this.v20 * this.v12 * this.v31 -
      this.v30 * this.v11 * this.v22 +
      this.v30 * this.v12 * this.v21;

    const determinant =
      this.v00 * v00 + this.v01 * v10 + this.v02 * v20 + this.v03 * v30;

    if (determinant !== 0) {
      const v01 =
        -this.v01 * this.v22 * this.v33 +
        this.v01 * this.v23 * this.v32 +
        this.v21 * this.v02 * this.v33 -
        this.v21 * this.v03 * this.v32 -
        this.v31 * this.v02 * this.v23 +
        this.v31 * this.v03 * this.v22;

      const v11 =
        this.v00 * this.v22 * this.v33 -
        this.v00 * this.v23 * this.v32 -
        this.v20 * this.v02 * this.v33 +
        this.v20 * this.v03 * this.v32 +
        this.v30 * this.v02 * this.v23 -
        this.v30 * this.v03 * this.v22;

      const v21 =
        -this.v00 * this.v21 * this.v33 +
        this.v00 * this.v23 * this.v31 +
        this.v20 * this.v01 * this.v33 -
        this.v20 * this.v03 * this.v31 -
        this.v30 * this.v01 * this.v23 +
        this.v30 * this.v03 * this.v21;

      const v31 =
        this.v00 * this.v21 * this.v32 -
        this.v00 * this.v22 * this.v31 -
        this.v20 * this.v01 * this.v32 +
        this.v20 * this.v02 * this.v31 +
        this.v30 * this.v01 * this.v22 -
        this.v30 * this.v02 * this.v21;

      const v02 =
        this.v01 * this.v12 * this.v33 -
        this.v01 * this.v13 * this.v32 -
        this.v11 * this.v02 * this.v33 +
        this.v11 * this.v03 * this.v32 +
        this.v31 * this.v02 * this.v13 -
        this.v31 * this.v03 * this.v12;

      const v12 =
        -this.v00 * this.v12 * this.v33 +
        this.v00 * this.v13 * this.v32 +
        this.v10 * this.v02 * this.v33 -
        this.v10 * this.v03 * this.v32 -
        this.v30 * this.v02 * this.v13 +
        this.v30 * this.v03 * this.v12;

      const v22 =
        this.v00 * this.v11 * this.v33 -
        this.v00 * this.v13 * this.v31 -
        this.v10 * this.v01 * this.v33 +
        this.v10 * this.v03 * this.v31 +
        this.v30 * this.v01 * this.v13 -
        this.v30 * this.v03 * this.v11;

      const v32 =
        -this.v00 * this.v11 * this.v32 +
        this.v00 * this.v12 * this.v31 +
        this.v10 * this.v01 * this.v32 -
        this.v10 * this.v02 * this.v31 -
        this.v30 * this.v01 * this.v12 +
        this.v30 * this.v02 * this.v11;

      const v03 =
        -this.v01 * this.v12 * this.v23 +
        this.v01 * this.v13 * this.v22 +
        this.v11 * this.v02 * this.v23 -
        this.v11 * this.v03 * this.v22 -
        this.v21 * this.v02 * this.v13 +
        this.v21 * this.v03 * this.v12;

      const v13 =
        this.v00 * this.v12 * this.v23 -
        this.v00 * this.v13 * this.v22 -
        this.v10 * this.v02 * this.v23 +
        this.v10 * this.v03 * this.v22 +
        this.v20 * this.v02 * this.v13 -
        this.v20 * this.v03 * this.v12;

      const v23 =
        -this.v00 * this.v11 * this.v23 +
        this.v00 * this.v13 * this.v21 +
        this.v10 * this.v01 * this.v23 -
        this.v10 * this.v03 * this.v21 -
        this.v20 * this.v01 * this.v13 +
        this.v20 * this.v03 * this.v11;

      const v33 =
        this.v00 * this.v11 * this.v22 -
        this.v00 * this.v12 * this.v21 -
        this.v10 * this.v01 * this.v22 +
        this.v10 * this.v02 * this.v21 +
        this.v20 * this.v01 * this.v12 -
        this.v20 * this.v02 * this.v11;

      const determinantInverse = 1.0 / determinant;

      this.v00 = v00 * determinantInverse;
      this.v01 = v01 * determinantInverse;
      this.v02 = v02 * determinantInverse;
      this.v03 = v03 * determinantInverse;
      this.v10 = v10 * determinantInverse;
      this.v11 = v11 * determinantInverse;
      this.v12 = v12 * determinantInverse;
      this.v13 = v13 * determinantInverse;
      this.v20 = v20 * determinantInverse;
      this.v21 = v21 * determinantInverse;
      this.v22 = v22 * determinantInverse;
      this.v23 = v23 * determinantInverse;
      this.v30 = v30 * determinantInverse;
      this.v31 = v31 * determinantInverse;
      this.v32 = v32 * determinantInverse;
      this.v33 = v33 * determinantInverse;
    }

    return this;
  }

  public multiply(other: Matrix4Data): Matrix4 {
    const v00 =
      this.v00 * other.v00 +
      this.v10 * other.v01 +
      this.v20 * other.v02 +
      this.v30 * other.v03;

    const v01 =
      this.v01 * other.v00 +
      this.v11 * other.v01 +
      this.v21 * other.v02 +
      this.v31 * other.v03;

    const v02 =
      this.v02 * other.v00 +
      this.v12 * other.v01 +
      this.v22 * other.v02 +
      this.v32 * other.v03;

    const v03 =
      this.v03 * other.v00 +
      this.v13 * other.v01 +
      this.v23 * other.v02 +
      this.v33 * other.v03;

    const v10 =
      this.v00 * other.v10 +
      this.v10 * other.v11 +
      this.v20 * other.v12 +
      this.v30 * other.v13;

    const v11 =
      this.v01 * other.v10 +
      this.v11 * other.v11 +
      this.v21 * other.v12 +
      this.v31 * other.v13;

    const v12 =
      this.v02 * other.v10 +
      this.v12 * other.v11 +
      this.v22 * other.v12 +
      this.v32 * other.v13;

    const v13 =
      this.v03 * other.v10 +
      this.v13 * other.v11 +
      this.v23 * other.v12 +
      this.v33 * other.v13;

    const v20 =
      this.v00 * other.v20 +
      this.v10 * other.v21 +
      this.v20 * other.v22 +
      this.v30 * other.v23;

    const v21 =
      this.v01 * other.v20 +
      this.v11 * other.v21 +
      this.v21 * other.v22 +
      this.v31 * other.v23;

    const v22 =
      this.v02 * other.v20 +
      this.v12 * other.v21 +
      this.v22 * other.v22 +
      this.v32 * other.v23;

    const v23 =
      this.v03 * other.v20 +
      this.v13 * other.v21 +
      this.v23 * other.v22 +
      this.v33 * other.v23;

    const v30 =
      this.v00 * other.v30 +
      this.v10 * other.v31 +
      this.v20 * other.v32 +
      this.v30 * other.v33;

    const v31 =
      this.v01 * other.v30 +
      this.v11 * other.v31 +
      this.v21 * other.v32 +
      this.v31 * other.v33;

    const v32 =
      this.v02 * other.v30 +
      this.v12 * other.v31 +
      this.v22 * other.v32 +
      this.v32 * other.v33;

    const v33 =
      this.v03 * other.v30 +
      this.v13 * other.v31 +
      this.v23 * other.v32 +
      this.v33 * other.v33;

    this.v00 = v00;
    this.v01 = v01;
    this.v02 = v02;
    this.v03 = v03;
    this.v10 = v10;
    this.v11 = v11;
    this.v12 = v12;
    this.v13 = v13;
    this.v20 = v20;
    this.v21 = v21;
    this.v22 = v22;
    this.v23 = v23;
    this.v30 = v30;
    this.v31 = v31;
    this.v32 = v32;
    this.v33 = v33;

    return this;
  }

  /*
   ** Rotate matrix around an arbitrary axis
   ** From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
   */
  public rotate(axis: Vector3, angle: number) {
    // Normalized axis
    const modInverse =
      1 / Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
    const x = axis.x * modInverse;
    const y = axis.y * modInverse;
    const z = axis.z * modInverse;

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

    return this.multiply({
      v00: xCos * x + cos,
      v01: xCos * y - zSin,
      v02: xCos * z + ySin,
      v03: 0,
      v10: xCos * y + zSin,
      v11: yCos * y + cos,
      v12: yCos * z - xSin,
      v13: 0,
      v20: xCos * z - ySin,
      v21: yCos * z + xSin,
      v22: zCos * z + cos,
      v23: 0,
      v30: 0,
      v31: 0,
      v32: 0,
      v33: 1,
    });
  }

  public scale(vector: Vector3) {
    return this.multiply({
      v00: vector.x,
      v01: 0,
      v02: 0,
      v03: 0,
      v10: 0,
      v11: vector.y,
      v12: 0,
      v13: 0,
      v20: 0,
      v21: 0,
      v22: vector.z,
      v23: 0,
      v30: 0,
      v31: 0,
      v32: 0,
      v33: 1,
    });
  }

  public transform(vertex: Vector4) {
    return {
      x:
        vertex.x * this.v00 +
        vertex.y * this.v10 +
        vertex.z * this.v20 +
        vertex.w * this.v30,
      y:
        vertex.x * this.v01 +
        vertex.y * this.v11 +
        vertex.z * this.v21 +
        vertex.w * this.v31,
      z:
        vertex.x * this.v02 +
        vertex.y * this.v12 +
        vertex.z * this.v22 +
        vertex.w * this.v32,
      w:
        vertex.x * this.v03 +
        vertex.y * this.v13 +
        vertex.z * this.v23 +
        vertex.w * this.v33,
    };
  }

  public toArray(): number[] {
    return [
      this.v00,
      this.v01,
      this.v02,
      this.v03,
      this.v10,
      this.v11,
      this.v12,
      this.v13,
      this.v20,
      this.v21,
      this.v22,
      this.v23,
      this.v30,
      this.v31,
      this.v32,
      this.v33,
    ];
  }

  public toTransposedInverse3x3() {
    const determinant =
      this.v00 * (this.v11 * this.v22 - this.v12 * this.v21) -
      this.v01 * (this.v10 * this.v22 - this.v12 * this.v20) +
      this.v02 * (this.v10 * this.v21 - this.v11 * this.v20);

    if (Math.abs(determinant) < Number.EPSILON) {
      return Matrix4.identity3;
    }

    const inverse = 1 / determinant;

    return [
      (this.v11 * this.v22 - this.v21 * this.v12) * inverse,
      (this.v10 * this.v22 - this.v12 * this.v20) * -inverse,
      (this.v10 * this.v21 - this.v20 * this.v11) * inverse,
      (this.v01 * this.v22 - this.v02 * this.v21) * -inverse,
      (this.v00 * this.v22 - this.v02 * this.v20) * inverse,
      (this.v00 * this.v21 - this.v20 * this.v01) * -inverse,
      (this.v01 * this.v12 - this.v02 * this.v11) * inverse,
      (this.v00 * this.v12 - this.v10 * this.v02) * -inverse,
      (this.v00 * this.v11 - this.v10 * this.v01) * inverse,
    ];
  }

  public translate(vector: Vector3): Matrix4 {
    return this.multiply({
      v00: 1,
      v01: 0,
      v02: 0,
      v03: 0,
      v10: 0,
      v11: 1,
      v12: 0,
      v13: 0,
      v20: 0,
      v21: 0,
      v22: 1,
      v23: 0,
      v30: vector.x,
      v31: vector.y,
      v32: vector.z,
      v33: 1,
    });
  }
}

export { Matrix4 };
