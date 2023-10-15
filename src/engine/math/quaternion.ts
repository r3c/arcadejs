import { InvokeOf, invokeOnObject } from "../language/dynamic";
import { MutableVector3, Vector3 } from "./vector";

interface Quaternion {
  readonly scalar: number;
  readonly vector: Vector3;
}

class MutableQuaternion implements Quaternion {
  public scalar: number;
  public vector: MutableVector3;

  public constructor(scalar: number, vector: MutableVector3) {
    this.scalar = scalar;
    this.vector = vector;
  }

  public add(rhs: Quaternion): void {
    this.scalar += rhs.scalar;
    this.vector.add(rhs.vector);
  }

  public conjugate(): void {
    this.vector.negate();
  }

  public getDot(rhs: Quaternion): number {
    return this.scalar * rhs.scalar + this.vector.getDot(rhs.vector);
  }

  public getNorm(): number {
    return Math.sqrt(this.getNormSquare());
  }

  public getNormSquare(): number {
    const { scalar, vector } = this;
    const { x, y, z } = vector;

    return scalar * scalar + x * x + y * y + z * z;
  }

  public invert(): boolean {
    const normSquare = this.getNormSquare();

    if (normSquare === 0) {
      return false;
    }

    this.conjugate();

    const factor = 1 / normSquare;

    this.scalar *= factor;
    this.vector.scale(factor);

    return true;
  }

  public multiply(rhs: Quaternion): void {
    const { scalar: s1, vector: v1 } = this;
    const { scalar: s2, vector: v2 } = rhs;
    const { x: x1, y: y1, z: z1 } = v1;
    const { x: x2, y: y2, z: z2 } = v2;

    this.scalar = s1 * s2 - x1 * x2 - y1 * y2 - z1 * z2;
    this.vector.x = s1 * x2 + x1 * s2 + y1 * z2 - z1 * y2;
    this.vector.y = s1 * y2 - x1 * z2 + y1 * s2 + z1 * x2;
    this.vector.z = s1 * z2 + x1 * y2 - y1 * x2 + z1 * s2;
  }

  public negate(): void {
    this.scalar = -this.scalar;
    this.vector.negate();
  }

  public normalize(): boolean {
    const norm = this.getNorm();

    if (norm === 0) {
      return false;
    }

    const factor = 1 / norm;

    this.scalar *= factor;
    this.vector.scale(factor);

    return true;
  }

  public set(source: Quaternion): void {
    this.scalar = source.scalar;
    this.vector.set(source.vector);
  }

  public setRotation(axis: Vector3, angle: number): void {
    const halfAngle = angle * 0.5;

    this.scalar = Math.cos(halfAngle);
    this.vector.set(axis);
    this.vector.scale(Math.sin(halfAngle));
  }

  public setScalarVector(scalar: number, vector: Vector3): void {
    this.scalar = scalar;
    this.vector.set(vector);
  }

  /**
   * Compute spherical linear interpolation between this instance and given one.
   * From: https://splines.readthedocs.io/en/latest/rotation/slerp.html
   */
  public slerp(end: Quaternion, lambda: number): void {
    const dot = this.getDot(end);
    const theta = Math.abs(Math.acos(dot));

    if (theta <= 0) {
      return;
    }

    const sinLambdaTheta = Math.sin(lambda * theta);
    const sinOneMinusLambdaTheta = Math.sin((1 - lambda) * theta);
    const sinThetaInvert = 1 / Math.sin(theta);
    const f1 = sinOneMinusLambdaTheta * sinThetaInvert;
    const f2 = sinLambdaTheta * sinThetaInvert;

    this.scalar = f1 * this.scalar + f2 * end.scalar;
    this.vector.x = f1 * this.vector.x + f2 * end.vector.x;
    this.vector.y = f1 * this.vector.y + f2 * end.vector.y;
    this.vector.z = f1 * this.vector.z + f2 * end.vector.z;
    this.normalize();
  }
}

class Quaternion {
  public static fromIdentity(
    ...invokes: InvokeOf<MutableQuaternion>[]
  ): MutableQuaternion {
    return invokeOnObject(
      new MutableQuaternion(
        Quaternion.identity.scalar,
        Vector3.fromSource(Quaternion.identity.vector)
      ),
      invokes
    );
  }

  public static fromSource(
    source: Quaternion,
    ...invokes: InvokeOf<MutableQuaternion>[]
  ): MutableQuaternion {
    const { scalar, vector } = source;

    return invokeOnObject(
      new MutableQuaternion(scalar, Vector3.fromSource(vector)),
      invokes
    );
  }

  public static rotate(vector: Vector3, quaternion: Quaternion): Vector3 {
    const q = Quaternion.fromSource(quaternion);
    const q1 = Quaternion.fromSource(quaternion);

    q1.invert();
    q.multiply({ scalar: 0, vector });
    q.multiply(q1);

    return q.vector;
  }

  public static readonly identity: Quaternion = {
    scalar: 1,
    vector: Vector3.zero,
  };
}

export { MutableQuaternion, Quaternion };
