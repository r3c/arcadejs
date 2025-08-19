import { InvokeOf, invokeOnObject } from "../language/dynamic";
import { Quaternion } from "./quaternion";
import { Vector3 } from "./vector";

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

  public constructor(source: Matrix3) {
    this.v00 = source.v00;
    this.v01 = source.v01;
    this.v02 = source.v02;
    this.v10 = source.v10;
    this.v11 = source.v11;
    this.v12 = source.v12;
    this.v20 = source.v20;
    this.v21 = source.v21;
    this.v22 = source.v22;
  }

  /*
   ** From: https://github.com/willnode/N-Matrix-Programmer/blob/master/Info/Matrix_3x3.txt
   */
  public invert(): void {
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
  }

  public multiply(rhs: Matrix3): void {
    this.compose(
      rhs.v00,
      rhs.v01,
      rhs.v02,
      rhs.v10,
      rhs.v11,
      rhs.v12,
      rhs.v20,
      rhs.v21,
      rhs.v22
    );
  }

  /*
   ** Rotate matrix around an arbitrary axis
   ** From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
   */
  public rotate(axis: Vector3, angle: number): void {
    // Normalized axis
    const { x: ax, y: ay, z: az } = axis;
    const invertMagnitude = 1 / Math.sqrt(ax * ax + ay * ay + az * az);
    const x = ax * invertMagnitude;
    const y = ay * invertMagnitude;
    const z = az * invertMagnitude;

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

    this.compose(
      xCos * x + cos,
      xCos * y - zSin,
      xCos * z + ySin,
      xCos * y + zSin,
      yCos * y + cos,
      yCos * z - xSin,
      xCos * z - ySin,
      yCos * z + xSin,
      zCos * z + cos
    );
  }

  public set(source: Matrix3): void {
    this.v00 = source.v00;
    this.v01 = source.v01;
    this.v02 = source.v02;
    this.v10 = source.v10;
    this.v11 = source.v11;
    this.v12 = source.v12;
    this.v20 = source.v20;
    this.v21 = source.v21;
    this.v22 = source.v22;
  }

  /**
   * Create rotation matrix from quaternion.
   * From: https://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToMatrix/index.htm
   */
  public setFromQuaternion(quaternion: Quaternion): void {
    const { scalar, vector } = quaternion;
    const { x, y, z } = vector;

    const sx = scalar * x;
    const sy = scalar * y;
    const sz = scalar * z;
    const xx = x * x;
    const xy = x * y;
    const xz = x * z;
    const yy = y * y;
    const yz = y * z;
    const zz = z * z;

    this.v00 = 1 - 2 * (yy + zz);
    this.v01 = 2 * (xy + sz);
    this.v02 = 2 * (xz - sy);
    this.v10 = 2 * (xy - sz);
    this.v11 = 1 - 2 * (xx + zz);
    this.v12 = 2 * (yz + sx);
    this.v20 = 2 * (xz + sy);
    this.v21 = 2 * (yz - sx);
    this.v22 = 1 - 2 * (xx + yy);
  }

  public setFromVectors(v0: Vector3, v1: Vector3, v2: Vector3): void {
    this.v00 = v0.x;
    this.v01 = v0.y;
    this.v02 = v0.z;
    this.v10 = v1.x;
    this.v11 = v1.y;
    this.v12 = v1.z;
    this.v20 = v2.x;
    this.v21 = v2.y;
    this.v22 = v2.z;
  }

  private compose(
    v00: number,
    v01: number,
    v02: number,
    v10: number,
    v11: number,
    v12: number,
    v20: number,
    v21: number,
    v22: number
  ): void {
    const t00 = this.v00 * v00 + this.v10 * v01 + this.v20 * v02;
    const t01 = this.v01 * v00 + this.v11 * v01 + this.v21 * v02;
    const t02 = this.v02 * v00 + this.v12 * v01 + this.v22 * v02;
    const t10 = this.v00 * v10 + this.v10 * v11 + this.v20 * v12;
    const t11 = this.v01 * v10 + this.v11 * v11 + this.v21 * v12;
    const t12 = this.v02 * v10 + this.v12 * v11 + this.v22 * v12;
    const t20 = this.v00 * v20 + this.v10 * v21 + this.v20 * v22;
    const t21 = this.v01 * v20 + this.v11 * v21 + this.v21 * v22;
    const t22 = this.v02 * v20 + this.v12 * v21 + this.v22 * v22;

    this.v00 = t00;
    this.v01 = t01;
    this.v02 = t02;
    this.v10 = t10;
    this.v11 = t11;
    this.v12 = t12;
    this.v20 = t20;
    this.v21 = t21;
    this.v22 = t22;
  }
}

class Matrix3 {
  public static fromIdentity(
    ...invokes: InvokeOf<MutableMatrix3>[]
  ): MutableMatrix3 {
    return invokeOnObject(new MutableMatrix3(Matrix3.identity), invokes);
  }

  public static fromSource(
    source: Matrix3,
    ...invokes: InvokeOf<MutableMatrix3>[]
  ): MutableMatrix3 {
    return invokeOnObject(new MutableMatrix3(source), invokes);
  }

  public static readonly identity: Matrix3 = {
    v00: 1,
    v01: 0,
    v02: 0,
    v10: 0,
    v11: 1,
    v12: 0,
    v20: 0,
    v21: 0,
    v22: 1,
  };
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

  public constructor(source: Matrix4) {
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
  }

  /*
   ** From: https://github.com/jlyharia/Computer_GraphicsII/blob/master/gluInvertMatrix.h
   */
  public invert(): void {
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
  }

  public multiply(rhs: Matrix4): void {
    this.compose(
      rhs.v00,
      rhs.v01,
      rhs.v02,
      rhs.v03,
      rhs.v10,
      rhs.v11,
      rhs.v12,
      rhs.v13,
      rhs.v20,
      rhs.v21,
      rhs.v22,
      rhs.v23,
      rhs.v30,
      rhs.v31,
      rhs.v32,
      rhs.v33
    );
  }

  /*
   ** Rotate matrix around an arbitrary axis
   ** From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
   */
  public rotate(axis: Vector3, angle: number): void {
    // Normalized axis
    const { x: ax, y: ay, z: az } = axis;
    const invertMagnitude = 1 / Math.sqrt(ax * ax + ay * ay + az * az);
    const x = ax * invertMagnitude;
    const y = ay * invertMagnitude;
    const z = az * invertMagnitude;

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

    this.compose(
      xCos * x + cos,
      xCos * y - zSin,
      xCos * z + ySin,
      0,
      xCos * y + zSin,
      yCos * y + cos,
      yCos * z - xSin,
      0,
      xCos * z - ySin,
      yCos * z + xSin,
      zCos * z + cos,
      0,
      0,
      0,
      0,
      1
    );
  }

  public scale(vector: Vector3): void {
    this.compose(
      vector.x,
      0,
      0,
      0,
      0,
      vector.y,
      0,
      0,
      0,
      0,
      vector.z,
      0,
      0,
      0,
      0,
      1
    );
  }

  public set(source: Matrix4): void {
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
  }

  public setFromArray(values: ArrayLike<number>): void {
    if (values.length < 16) {
      throw Error("Matrix4 must be created from array with 16+ elements");
    }

    this.v00 = values[0];
    this.v01 = values[1];
    this.v02 = values[2];
    this.v03 = values[3];
    this.v10 = values[4];
    this.v11 = values[5];
    this.v12 = values[6];
    this.v13 = values[7];
    this.v20 = values[8];
    this.v21 = values[9];
    this.v22 = values[10];
    this.v23 = values[11];
    this.v30 = values[12];
    this.v31 = values[13];
    this.v32 = values[14];
    this.v33 = values[15];
  }

  /*
   ** Create new matrix for "looking to given direction" transformation.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluLookAt.xml
   */
  public setFromDirection(direction: Vector3, up: Vector3): void {
    const f = Vector3.fromSource(direction, ["normalize"]);
    const upVector = Vector3.fromSource(up, ["normalize"]);
    const s = Vector3.fromSource(f, ["cross", upVector]);
    const u = Vector3.fromSource(s, ["normalize"], ["cross", f]);

    this.v00 = s.x;
    this.v01 = u.x;
    this.v02 = -f.x;
    this.v03 = 0;
    this.v10 = s.y;
    this.v11 = u.y;
    this.v12 = -f.y;
    this.v13 = 0;
    this.v20 = s.z;
    this.v21 = u.z;
    this.v22 = -f.z;
    this.v23 = 0;
    this.v30 = 0;
    this.v31 = 0;
    this.v32 = 0;
    this.v33 = 1;
  }

  /*
   ** Create new orthographic projection matrix.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/glOrtho.xml
   */
  public setFromOrthographic(
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    zMin: number,
    zMax: number
  ): void {
    const dx = xMax - xMin;
    const dy = yMax - yMin;
    const dz = zMax - zMin;

    this.v00 = 2 / dx;
    this.v01 = 0;
    this.v02 = 0;
    this.v03 = 0;
    this.v10 = 0;
    this.v11 = 2 / dy;
    this.v12 = 0;
    this.v13 = 0;
    this.v20 = 0;
    this.v21 = 0;
    this.v22 = -2 / dz;
    this.v23 = 0;
    this.v30 = -(xMax + xMin) / dx;
    this.v31 = -(yMax + yMin) / dy;
    this.v32 = -(zMax + zMin) / dz;
    this.v33 = 1;
  }

  /*
   ** Create new perspective projection matrix.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml
   */
  public setFromPerspective(
    fieldOfView: number,
    aspectRatio: number,
    zMin: number,
    zMax: number
  ): void {
    var f = 1.0 / Math.tan(fieldOfView * 0.5);
    var q = 1 / (zMin - zMax);

    this.v00 = f / aspectRatio;
    this.v01 = 0;
    this.v02 = 0;
    this.v03 = 0;
    this.v10 = 0;
    this.v11 = f;
    this.v12 = 0;
    this.v13 = 0;
    this.v20 = 0;
    this.v21 = 0;
    this.v22 = (zMax + zMin) * q;
    this.v23 = -1;
    this.v30 = 0;
    this.v31 = 0;
    this.v32 = 2 * zMax * zMin * q;
    this.v33 = 0;
  }

  public setFromRotationPosition(rotation: Matrix3, position: Vector3): void {
    this.v00 = rotation.v00;
    this.v01 = rotation.v01;
    this.v02 = rotation.v02;
    this.v03 = 0;
    this.v10 = rotation.v10;
    this.v11 = rotation.v11;
    this.v12 = rotation.v12;
    this.v13 = 0;
    this.v20 = rotation.v20;
    this.v21 = rotation.v21;
    this.v22 = rotation.v22;
    this.v23 = 0;
    this.v30 = position.x;
    this.v31 = position.y;
    this.v32 = position.z;
    this.v33 = 1;
  }

  public translate(vector: Vector3): void {
    this.compose(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      vector.x,
      vector.y,
      vector.z,
      1
    );
  }

  private compose(
    v00: number,
    v01: number,
    v02: number,
    v03: number,
    v10: number,
    v11: number,
    v12: number,
    v13: number,
    v20: number,
    v21: number,
    v22: number,
    v23: number,
    v30: number,
    v31: number,
    v32: number,
    v33: number
  ): void {
    const t00 =
      this.v00 * v00 + this.v10 * v01 + this.v20 * v02 + this.v30 * v03;
    const t01 =
      this.v01 * v00 + this.v11 * v01 + this.v21 * v02 + this.v31 * v03;
    const t02 =
      this.v02 * v00 + this.v12 * v01 + this.v22 * v02 + this.v32 * v03;
    const t03 =
      this.v03 * v00 + this.v13 * v01 + this.v23 * v02 + this.v33 * v03;
    const t10 =
      this.v00 * v10 + this.v10 * v11 + this.v20 * v12 + this.v30 * v13;
    const t11 =
      this.v01 * v10 + this.v11 * v11 + this.v21 * v12 + this.v31 * v13;
    const t12 =
      this.v02 * v10 + this.v12 * v11 + this.v22 * v12 + this.v32 * v13;
    const t13 =
      this.v03 * v10 + this.v13 * v11 + this.v23 * v12 + this.v33 * v13;
    const t20 =
      this.v00 * v20 + this.v10 * v21 + this.v20 * v22 + this.v30 * v23;
    const t21 =
      this.v01 * v20 + this.v11 * v21 + this.v21 * v22 + this.v31 * v23;
    const t22 =
      this.v02 * v20 + this.v12 * v21 + this.v22 * v22 + this.v32 * v23;
    const t23 =
      this.v03 * v20 + this.v13 * v21 + this.v23 * v22 + this.v33 * v23;
    const t30 =
      this.v00 * v30 + this.v10 * v31 + this.v20 * v32 + this.v30 * v33;
    const t31 =
      this.v01 * v30 + this.v11 * v31 + this.v21 * v32 + this.v31 * v33;
    const t32 =
      this.v02 * v30 + this.v12 * v31 + this.v22 * v32 + this.v32 * v33;
    const t33 =
      this.v03 * v30 + this.v13 * v31 + this.v23 * v32 + this.v33 * v33;

    this.v00 = t00;
    this.v01 = t01;
    this.v02 = t02;
    this.v03 = t03;
    this.v10 = t10;
    this.v11 = t11;
    this.v12 = t12;
    this.v13 = t13;
    this.v20 = t20;
    this.v21 = t21;
    this.v22 = t22;
    this.v23 = t23;
    this.v30 = t30;
    this.v31 = t31;
    this.v32 = t32;
    this.v33 = t33;
  }
}

class Matrix4 {
  public static fromIdentity(
    ...invokes: InvokeOf<MutableMatrix4>[]
  ): MutableMatrix4 {
    return invokeOnObject(new MutableMatrix4(Matrix4.identity), invokes);
  }

  public static fromSource(
    source: Matrix4,
    ...invokes: InvokeOf<MutableMatrix4>[]
  ): MutableMatrix4 {
    return invokeOnObject(new MutableMatrix4(source), invokes);
  }

  public static readonly identity: Matrix4 = {
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
  };
}

export { Matrix3, Matrix4, MutableMatrix3, MutableMatrix4 };
