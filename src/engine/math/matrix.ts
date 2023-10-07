import { InvokeOf, invokeOnObject } from "../language/dynamic";
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
  public static fromIdentity(): MutableMatrix3 {
    return new MutableMatrix3(Matrix3.identity);
  }

  public static fromObject(
    origin: Matrix3,
    ...invokes: InvokeOf<MutableMatrix3>[]
  ): MutableMatrix3 {
    return invokeOnObject(new MutableMatrix3(origin), invokes);
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

  /*
   ** Create new matrix for "looking to given direction" transformation.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluLookAt.xml
   */
  public static fromDirection(direction: Vector3, up: Vector3): MutableMatrix4 {
    const f = Vector3.fromObject(direction, ["normalize"]);
    const upVector = Vector3.fromObject(up, ["normalize"]);
    const s = Vector3.fromObject(f, ["cross", upVector]);
    const u = Vector3.fromObject(s, ["normalize"], ["cross", f]);

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

  public static fromIdentity(): MutableMatrix4 {
    return new MutableMatrix4(Matrix4.identity);
  }

  public static fromObject(
    origin: Matrix4,
    ...invokes: InvokeOf<MutableMatrix4>[]
  ): MutableMatrix4 {
    return invokeOnObject(new MutableMatrix4(origin), invokes);
  }

  /*
   ** Create new orthographic projection matrix.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/glOrtho.xml
   */
  public static fromOrthographic(
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
  public static fromPerspective(
    fieldOfView: number,
    aspectRatio: number,
    zMin: number,
    zMax: number
  ): MutableMatrix4 {
    var f = 1.0 / Math.tan(fieldOfView * 0.5);
    var q = 1 / (zMin - zMax);

    return new MutableMatrix4({
      v00: f / aspectRatio,
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

  public static transform(source: Matrix4, vertex: Vector4): Vector4 {
    return {
      x:
        vertex.x * source.v00 +
        vertex.y * source.v10 +
        vertex.z * source.v20 +
        vertex.w * source.v30,
      y:
        vertex.x * source.v01 +
        vertex.y * source.v11 +
        vertex.z * source.v21 +
        vertex.w * source.v31,
      z:
        vertex.x * source.v02 +
        vertex.y * source.v12 +
        vertex.z * source.v22 +
        vertex.w * source.v32,
      w:
        vertex.x * source.v03 +
        vertex.y * source.v13 +
        vertex.z * source.v23 +
        vertex.w * source.v33,
    };
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
