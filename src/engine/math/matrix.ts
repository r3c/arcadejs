import { Vector3, Vector4 } from "./vector";

interface Matrix3 {
  readonly v00: number;
  readonly v01: number;
  readonly v02: number;
  readonly v10: number;
  readonly v11: number;
  readonly v12: number;
  readonly v20: number;
  readonly v21: number;
  readonly v22: number;
}

class MutableMatrix3 implements Matrix3 {
  public v00: number;
  public v01: number;
  public v02: number;
  public v10: number;
  public v11: number;
  public v12: number;
  public v20: number;
  public v21: number;
  public v22: number;

  public constructor(obj: Matrix3) {
    this.v00 = obj.v00;
    this.v01 = obj.v01;
    this.v02 = obj.v02;
    this.v10 = obj.v10;
    this.v11 = obj.v11;
    this.v12 = obj.v12;
    this.v20 = obj.v20;
    this.v21 = obj.v21;
    this.v22 = obj.v22;
  }

  public duplicate(source: Matrix3): MutableMatrix3 {
    this.v00 = source.v00;
    this.v01 = source.v01;
    this.v02 = source.v02;
    this.v10 = source.v10;
    this.v11 = source.v11;
    this.v12 = source.v12;
    this.v20 = source.v20;
    this.v21 = source.v21;
    this.v22 = source.v22;

    return this;
  }

  /*
   ** From: https://github.com/willnode/N-Matrix-Programmer/blob/master/Info/Matrix_3x3.txt
   */
  public invert(): MutableMatrix3 {
    const v00 = this.v11 * this.v22 - this.v12 * this.v21;
    const v01 = this.v10 * this.v22 - this.v12 * this.v20;
    const v02 = this.v10 * this.v21 - this.v11 * this.v20;

    const determinant = this.v00 * v00 - this.v01 * v01 + this.v02 * v02;

    if (Math.abs(determinant) >= Number.EPSILON) {
      const v10 = this.v01 * this.v22 - this.v02 * this.v21;
      const v11 = this.v00 * this.v22 - this.v02 * this.v20;
      const v12 = this.v00 * this.v21 - this.v20 * this.v01;
      const v20 = this.v01 * this.v12 - this.v02 * this.v11;
      const v21 = this.v00 * this.v12 - this.v10 * this.v02;
      const v22 = this.v00 * this.v11 - this.v10 * this.v01;

      const determinantInverse = 1 / determinant;

      this.v00 = v00 * determinantInverse;
      this.v01 = v01 * -determinantInverse;
      this.v02 = v02 * determinantInverse;
      this.v10 = v10 * -determinantInverse;
      this.v11 = v11 * determinantInverse;
      this.v12 = v12 * -determinantInverse;
      this.v20 = v20 * determinantInverse;
      this.v21 = v21 * -determinantInverse;
      this.v22 = v22 * determinantInverse;
    }

    return this;
  }

  public multiply(rhs: Matrix3): MutableMatrix3 {
    const v00 = this.v00 * rhs.v00 + this.v10 * rhs.v01 + this.v20 * rhs.v02;
    const v01 = this.v01 * rhs.v00 + this.v11 * rhs.v01 + this.v21 * rhs.v02;
    const v02 = this.v02 * rhs.v00 + this.v12 * rhs.v01 + this.v22 * rhs.v02;
    const v10 = this.v00 * rhs.v10 + this.v10 * rhs.v11 + this.v20 * rhs.v12;
    const v11 = this.v01 * rhs.v10 + this.v11 * rhs.v11 + this.v21 * rhs.v12;
    const v12 = this.v02 * rhs.v10 + this.v12 * rhs.v11 + this.v22 * rhs.v12;
    const v20 = this.v00 * rhs.v20 + this.v10 * rhs.v21 + this.v20 * rhs.v22;
    const v21 = this.v01 * rhs.v20 + this.v11 * rhs.v21 + this.v21 * rhs.v22;
    const v22 = this.v02 * rhs.v20 + this.v12 * rhs.v21 + this.v22 * rhs.v22;

    this.v00 = v00;
    this.v01 = v01;
    this.v02 = v02;
    this.v10 = v10;
    this.v11 = v11;
    this.v12 = v12;
    this.v20 = v20;
    this.v21 = v21;
    this.v22 = v22;

    return this;
  }
}

class Matrix3 {
  public static createIdentity(): MutableMatrix3 {
    return new MutableMatrix3({
      v00: 1,
      v01: 0,
      v02: 0,
      v10: 0,
      v11: 1,
      v12: 0,
      v20: 0,
      v21: 0,
      v22: 1,
    });
  }

  public static fromObject(obj: Matrix3): MutableMatrix3 {
    return new MutableMatrix3(obj);
  }
}

interface Matrix4 {
  readonly v00: number;
  readonly v01: number;
  readonly v02: number;
  readonly v03: number;
  readonly v10: number;
  readonly v11: number;
  readonly v12: number;
  readonly v13: number;
  readonly v20: number;
  readonly v21: number;
  readonly v22: number;
  readonly v23: number;
  readonly v30: number;
  readonly v31: number;
  readonly v32: number;
  readonly v33: number;
}

class MutableMatrix4 implements Matrix4 {
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

  public constructor(obj: Matrix4) {
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

  public duplicate(source: Matrix4): MutableMatrix4 {
    this.v00 = source.v00;
    this.v01 = source.v01;
    this.v02 = source.v02;
    this.v03 = source.v03;
    this.v10 = source.v10;
    this.v11 = source.v11;
    this.v12 = source.v12;
    this.v13 = source.v13;
    this.v20 = source.v20;
    this.v21 = source.v21;
    this.v22 = source.v22;
    this.v23 = source.v23;
    this.v30 = source.v30;
    this.v31 = source.v31;
    this.v32 = source.v32;
    this.v33 = source.v33;

    return this;
  }

  /*
   ** From: https://github.com/jlyharia/Computer_GraphicsII/blob/master/gluInvertMatrix.h
   */
  public invert(): MutableMatrix4 {
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

    if (Math.abs(determinant) >= Number.EPSILON) {
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

  public multiply(rhs: Matrix4): MutableMatrix4 {
    const v00 =
      this.v00 * rhs.v00 +
      this.v10 * rhs.v01 +
      this.v20 * rhs.v02 +
      this.v30 * rhs.v03;

    const v01 =
      this.v01 * rhs.v00 +
      this.v11 * rhs.v01 +
      this.v21 * rhs.v02 +
      this.v31 * rhs.v03;

    const v02 =
      this.v02 * rhs.v00 +
      this.v12 * rhs.v01 +
      this.v22 * rhs.v02 +
      this.v32 * rhs.v03;

    const v03 =
      this.v03 * rhs.v00 +
      this.v13 * rhs.v01 +
      this.v23 * rhs.v02 +
      this.v33 * rhs.v03;

    const v10 =
      this.v00 * rhs.v10 +
      this.v10 * rhs.v11 +
      this.v20 * rhs.v12 +
      this.v30 * rhs.v13;

    const v11 =
      this.v01 * rhs.v10 +
      this.v11 * rhs.v11 +
      this.v21 * rhs.v12 +
      this.v31 * rhs.v13;

    const v12 =
      this.v02 * rhs.v10 +
      this.v12 * rhs.v11 +
      this.v22 * rhs.v12 +
      this.v32 * rhs.v13;

    const v13 =
      this.v03 * rhs.v10 +
      this.v13 * rhs.v11 +
      this.v23 * rhs.v12 +
      this.v33 * rhs.v13;

    const v20 =
      this.v00 * rhs.v20 +
      this.v10 * rhs.v21 +
      this.v20 * rhs.v22 +
      this.v30 * rhs.v23;

    const v21 =
      this.v01 * rhs.v20 +
      this.v11 * rhs.v21 +
      this.v21 * rhs.v22 +
      this.v31 * rhs.v23;

    const v22 =
      this.v02 * rhs.v20 +
      this.v12 * rhs.v21 +
      this.v22 * rhs.v22 +
      this.v32 * rhs.v23;

    const v23 =
      this.v03 * rhs.v20 +
      this.v13 * rhs.v21 +
      this.v23 * rhs.v22 +
      this.v33 * rhs.v23;

    const v30 =
      this.v00 * rhs.v30 +
      this.v10 * rhs.v31 +
      this.v20 * rhs.v32 +
      this.v30 * rhs.v33;

    const v31 =
      this.v01 * rhs.v30 +
      this.v11 * rhs.v31 +
      this.v21 * rhs.v32 +
      this.v31 * rhs.v33;

    const v32 =
      this.v02 * rhs.v30 +
      this.v12 * rhs.v31 +
      this.v22 * rhs.v32 +
      this.v32 * rhs.v33;

    const v33 =
      this.v03 * rhs.v30 +
      this.v13 * rhs.v31 +
      this.v23 * rhs.v32 +
      this.v33 * rhs.v33;

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

  public translate(vector: Vector3): MutableMatrix4 {
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

class Matrix4 {
  /*
   ** Create new matrix for "looking to given direction" transformation.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluLookAt.xml
   */
  public static createDirection(
    direction: Vector3,
    up: Vector3
  ): MutableMatrix4 {
    const f = Vector3.fromObject(direction);

    f.normalize();

    const s = Vector3.fromObject(f);
    const upVector = Vector3.fromObject(up);

    upVector.normalize();
    s.cross(upVector);

    const u = Vector3.fromObject(s);

    u.normalize();
    u.cross(f);

    return new MutableMatrix4({
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

  public static createIdentity(): MutableMatrix4 {
    return new MutableMatrix4({
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
  ): MutableMatrix4 {
    const dx = xMax - xMin;
    const dy = yMax - yMin;
    const dz = zMax - zMin;

    return new MutableMatrix4({
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
  ): MutableMatrix4 {
    var f = 1.0 / Math.tan((angle * Math.PI) / 360.0);
    var q = 1 / (zMin - zMax);

    return new MutableMatrix4({
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

  public static fromArray(values: ArrayLike<number>): MutableMatrix4 {
    if (values.length !== 16) {
      throw Error("4x4 matrix must contain 16 elements");
    }

    return new MutableMatrix4({
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

  public static fromObject(obj: Matrix4): MutableMatrix4 {
    return new MutableMatrix4(obj);
  }

  public static transform(obj: Matrix4, vertex: Vector4): Vector4 {
    return {
      x:
        vertex.x * obj.v00 +
        vertex.y * obj.v10 +
        vertex.z * obj.v20 +
        vertex.w * obj.v30,
      y:
        vertex.x * obj.v01 +
        vertex.y * obj.v11 +
        vertex.z * obj.v21 +
        vertex.w * obj.v31,
      z:
        vertex.x * obj.v02 +
        vertex.y * obj.v12 +
        vertex.z * obj.v22 +
        vertex.w * obj.v32,
      w:
        vertex.x * obj.v03 +
        vertex.y * obj.v13 +
        vertex.z * obj.v23 +
        vertex.w * obj.v33,
    };
  }
}

export { Matrix3, Matrix4, MutableMatrix3, MutableMatrix4 };
