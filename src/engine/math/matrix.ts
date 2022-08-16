import { Vector3, Vector4 } from "./vector";

class Matrix4 {
  private static readonly identity3: [1, 0, 0, 0, 1, 0, 0, 0, 1];

  private static readonly identity4: Matrix4 = new Matrix4([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);

  private readonly values: number[];

  /*
   ** Create new matrix with custom values.
   */
  public static create(values: number[]) {
    if (values.length !== 16)
      throw Error("4x4 matrix must contain 16 elements");

    return new Matrix4(values);
  }

  /*
   ** Create new matrix for "looking to given direction" transformation.
   ** From: https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluLookAt.xml
   */
  public static createDirection(direction: Vector3, up: Vector3) {
    const f = Vector3.normalize(direction);
    const s = Vector3.cross(f, Vector3.normalize(up));
    const u = Vector3.cross(Vector3.normalize(s), f);

    return new Matrix4([
      s.x,
      u.x,
      -f.x,
      0,
      s.y,
      u.y,
      -f.y,
      0,
      s.z,
      u.z,
      -f.z,
      0,
      0,
      0,
      0,
      1,
    ]);
  }

  /*
   ** Create new identity matrix (actually returns a static immutable instance).
   */
  public static createIdentity() {
    return Matrix4.identity4;
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
  ) {
    const dx = xMax - xMin;
    const dy = yMax - yMin;
    const dz = zMax - zMin;

    return new Matrix4([
      2 / dx,
      0,
      0,
      0,
      0,
      2 / dy,
      0,
      0,
      0,
      0,
      -2 / dz,
      0,
      -(xMax + xMin) / dx,
      -(yMax + yMin) / dy,
      -(zMax + zMin) / dz,
      1,
    ]);
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
  ) {
    var f = 1.0 / Math.tan((angle * Math.PI) / 360.0);
    var q = 1 / (zMin - zMax);

    return new Matrix4([
      f / ratio,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (zMax + zMin) * q,
      -1,
      0,
      0,
      2 * zMax * zMin * q,
      0,
    ]);
  }

  private constructor(values: number[]) {
    this.values = values;
  }

  public compose(other: Matrix4) {
    return new Matrix4(Matrix4.multiply(this.values, other.values));
  }

  public getTransposedInverse3x3() {
    const m = this.values;
    const determinant =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[1] * (m[4] * m[10] - m[6] * m[8]) +
      m[2] * (m[4] * m[9] - m[5] * m[8]);

    if (Math.abs(determinant) < Number.EPSILON) return Matrix4.identity3;

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
      (m[0] * m[5] - m[4] * m[1]) * inverse,
    ];
  }

  public getValues(): Iterable<number> {
    return this.values;
  }

  /*
   ** From: https://github.com/jlyharia/Computer_GraphicsII/blob/master/gluInvertMatrix.h
   */
  public inverse() {
    const inv = [];
    const m = this.values;

    inv[0] =
      m[5] * m[10] * m[15] -
      m[5] * m[11] * m[14] -
      m[9] * m[6] * m[15] +
      m[9] * m[7] * m[14] +
      m[13] * m[6] * m[11] -
      m[13] * m[7] * m[10];

    inv[4] =
      -m[4] * m[10] * m[15] +
      m[4] * m[11] * m[14] +
      m[8] * m[6] * m[15] -
      m[8] * m[7] * m[14] -
      m[12] * m[6] * m[11] +
      m[12] * m[7] * m[10];

    inv[8] =
      m[4] * m[9] * m[15] -
      m[4] * m[11] * m[13] -
      m[8] * m[5] * m[15] +
      m[8] * m[7] * m[13] +
      m[12] * m[5] * m[11] -
      m[12] * m[7] * m[9];

    inv[12] =
      -m[4] * m[9] * m[14] +
      m[4] * m[10] * m[13] +
      m[8] * m[5] * m[14] -
      m[8] * m[6] * m[13] -
      m[12] * m[5] * m[10] +
      m[12] * m[6] * m[9];

    inv[1] =
      -m[1] * m[10] * m[15] +
      m[1] * m[11] * m[14] +
      m[9] * m[2] * m[15] -
      m[9] * m[3] * m[14] -
      m[13] * m[2] * m[11] +
      m[13] * m[3] * m[10];

    inv[5] =
      m[0] * m[10] * m[15] -
      m[0] * m[11] * m[14] -
      m[8] * m[2] * m[15] +
      m[8] * m[3] * m[14] +
      m[12] * m[2] * m[11] -
      m[12] * m[3] * m[10];

    inv[9] =
      -m[0] * m[9] * m[15] +
      m[0] * m[11] * m[13] +
      m[8] * m[1] * m[15] -
      m[8] * m[3] * m[13] -
      m[12] * m[1] * m[11] +
      m[12] * m[3] * m[9];

    inv[13] =
      m[0] * m[9] * m[14] -
      m[0] * m[10] * m[13] -
      m[8] * m[1] * m[14] +
      m[8] * m[2] * m[13] +
      m[12] * m[1] * m[10] -
      m[12] * m[2] * m[9];

    inv[2] =
      m[1] * m[6] * m[15] -
      m[1] * m[7] * m[14] -
      m[5] * m[2] * m[15] +
      m[5] * m[3] * m[14] +
      m[13] * m[2] * m[7] -
      m[13] * m[3] * m[6];

    inv[6] =
      -m[0] * m[6] * m[15] +
      m[0] * m[7] * m[14] +
      m[4] * m[2] * m[15] -
      m[4] * m[3] * m[14] -
      m[12] * m[2] * m[7] +
      m[12] * m[3] * m[6];

    inv[10] =
      m[0] * m[5] * m[15] -
      m[0] * m[7] * m[13] -
      m[4] * m[1] * m[15] +
      m[4] * m[3] * m[13] +
      m[12] * m[1] * m[7] -
      m[12] * m[3] * m[5];

    inv[14] =
      -m[0] * m[5] * m[14] +
      m[0] * m[6] * m[13] +
      m[4] * m[1] * m[14] -
      m[4] * m[2] * m[13] -
      m[12] * m[1] * m[6] +
      m[12] * m[2] * m[5];

    inv[3] =
      -m[1] * m[6] * m[11] +
      m[1] * m[7] * m[10] +
      m[5] * m[2] * m[11] -
      m[5] * m[3] * m[10] -
      m[9] * m[2] * m[7] +
      m[9] * m[3] * m[6];

    inv[7] =
      m[0] * m[6] * m[11] -
      m[0] * m[7] * m[10] -
      m[4] * m[2] * m[11] +
      m[4] * m[3] * m[10] +
      m[8] * m[2] * m[7] -
      m[8] * m[3] * m[6];

    inv[11] =
      -m[0] * m[5] * m[11] +
      m[0] * m[7] * m[9] +
      m[4] * m[1] * m[11] -
      m[4] * m[3] * m[9] -
      m[8] * m[1] * m[7] +
      m[8] * m[3] * m[5];

    inv[15] =
      m[0] * m[5] * m[10] -
      m[0] * m[6] * m[9] -
      m[4] * m[1] * m[10] +
      m[4] * m[2] * m[9] +
      m[8] * m[1] * m[6] -
      m[8] * m[2] * m[5];

    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];

    if (det === 0) return this;

    const invDet = 1.0 / det;

    return new Matrix4(inv.map((v) => v * invDet));
  }

  /*
   ** Rotate matrix around an arbitrary axis
   ** From: https://fr.wikipedia.org/wiki/Matrice_de_rotation#Matrices_de_rotation_dans_le_cas_g%C3%A9n%C3%A9ral
   */
  public rotate(axis: Vector3, angle: number) {
    // Normalized axis
    const modInv =
      1 / Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
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

    return new Matrix4(
      Matrix4.multiply(this.values, [
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
        1,
      ])
    );
  }

  public scale(vector: Vector3) {
    return new Matrix4(
      Matrix4.multiply(this.values, [
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
        1,
      ])
    );
  }

  public transform(vertex: Vector4) {
    const m = this.values;

    return {
      x: vertex.x * m[0] + vertex.y * m[4] + vertex.z * m[8] + vertex.w * m[12],
      y: vertex.x * m[1] + vertex.y * m[5] + vertex.z * m[9] + vertex.w * m[13],
      z:
        vertex.x * m[2] + vertex.y * m[6] + vertex.z * m[10] + vertex.w * m[14],
      w:
        vertex.x * m[3] + vertex.y * m[7] + vertex.z * m[11] + vertex.w * m[15],
    };
  }

  public translate(vector: Vector3) {
    return new Matrix4(
      Matrix4.multiply(this.values, [
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
        1,
      ])
    );
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
      lhs[0] * rhs[12] +
        lhs[4] * rhs[13] +
        lhs[8] * rhs[14] +
        lhs[12] * rhs[15],
      lhs[1] * rhs[12] +
        lhs[5] * rhs[13] +
        lhs[9] * rhs[14] +
        lhs[13] * rhs[15],
      lhs[2] * rhs[12] +
        lhs[6] * rhs[13] +
        lhs[10] * rhs[14] +
        lhs[14] * rhs[15],
      lhs[3] * rhs[12] +
        lhs[7] * rhs[13] +
        lhs[11] * rhs[14] +
        lhs[15] * rhs[15],
    ];
  }
}

export { Matrix4 };
