import { InvokeOf, invokeOnObject } from "../language/dynamic";

interface Vector2 {
  readonly x: number;
  readonly y: number;
}

class MutableVector2 implements Vector2 {
  public x: number;
  public y: number;

  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  public add(rhs: Vector2): void {
    this.x += rhs.x;
    this.y += rhs.y;
  }

  public getDot(rhs: Vector2): number {
    return this.x * rhs.x + this.y * rhs.y;
  }

  public getNorm(): number {
    const { x, y } = this;

    return Math.sqrt(x * x + y * y);
  }

  public negate(): void {
    this.x = -this.x;
    this.y = -this.y;
  }

  public normalize(): boolean {
    const norm = this.getNorm();

    if (norm === 0) {
      return false;
    }

    const normInverse = 1 / norm;

    this.x *= normInverse;
    this.y *= normInverse;

    return true;
  }

  public scale(factor: number): void {
    this.x *= factor;
    this.y *= factor;
  }

  public set(source: Vector2): void {
    this.x = source.x;
    this.y = source.y;
  }

  public setArray(values: ArrayLike<number>): void {
    if (values.length < 2) {
      throw Error("Vector2 must be created from array with 2+ elements");
    }

    this.x = values[0];
    this.y = values[1];
  }

  public setXY(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  public sub(rhs: Vector2): void {
    this.x -= rhs.x;
    this.y -= rhs.y;
  }
}

class Vector2 {
  public static fromSource(
    source: Vector2,
    ...invokes: InvokeOf<MutableVector2>[]
  ): MutableVector2 {
    const { x, y } = source;

    return invokeOnObject(new MutableVector2(x, y), invokes);
  }
  public static fromZero(
    ...invokes: InvokeOf<MutableVector2>[]
  ): MutableVector2 {
    return invokeOnObject(new MutableVector2(0, 0), invokes);
  }

  public static toArray(vector: Vector2): [number, number] {
    return [vector.x, vector.y];
  }

  public static readonly zero: Vector2 = { x: 0, y: 0 };
}

interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

class MutableVector3 implements Vector3 {
  public x: number;
  public y: number;
  public z: number;

  public constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public add(rhs: Vector3): void {
    this.x += rhs.x;
    this.y += rhs.y;
    this.z += rhs.z;
  }

  public cross(rhs: Vector3): void {
    const { x: lx, y: ly, z: lz } = this;
    const { x: rx, y: ry, z: rz } = rhs;

    this.x = ly * rz - lz * ry;
    this.y = lz * rx - lx * rz;
    this.z = lx * ry - ly * rx;
  }

  public getDot(rhs: Vector3): number {
    return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z;
  }

  public getNorm(): number {
    const { x, y, z } = this;

    return Math.sqrt(x * x + y * y + z * z);
  }

  public map(callback: (v: number) => number): void {
    this.x = callback(this.x);
    this.y = callback(this.y);
    this.z = callback(this.z);
  }

  public negate(): void {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
  }

  public normalize(): boolean {
    const norm = this.getNorm();

    if (norm === 0) {
      return false;
    }

    const normInverse = 1 / norm;

    this.x *= normInverse;
    this.y *= normInverse;
    this.z *= normInverse;

    return true;
  }

  public scale(factor: number): void {
    this.x *= factor;
    this.y *= factor;
    this.z *= factor;
  }

  public set(source: Vector3): void {
    this.x = source.x;
    this.y = source.y;
    this.z = source.z;
  }

  public setArray(values: ArrayLike<number>): void {
    if (values.length < 3) {
      throw Error("Vector3 must be created from array with 3+ elements");
    }

    this.x = values[0];
    this.y = values[1];
    this.z = values[2];
  }

  public setXYZ(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public sub(rhs: Vector3): void {
    this.x -= rhs.x;
    this.y -= rhs.y;
    this.z -= rhs.z;
  }
}

class Vector3 {
  public static fromSource(
    source: Vector3,
    ...invokes: InvokeOf<MutableVector3>[]
  ): MutableVector3 {
    const { x, y, z } = source;

    return invokeOnObject(new MutableVector3(x, y, z), invokes);
  }

  public static fromZero(
    ...invokes: InvokeOf<MutableVector3>[]
  ): MutableVector3 {
    return invokeOnObject(new MutableVector3(0, 0, 0), invokes);
  }

  public static toArray(vector: Vector3): [number, number, number] {
    return [vector.x, vector.y, vector.z];
  }

  public static readonly zero: Vector3 = { x: 0, y: 0, z: 0 };
}

interface Vector4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

class MutableVector4 implements Vector4 {
  public x: number;
  public y: number;
  public z: number;
  public w: number;

  public constructor(x: number, y: number, z: number, w: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  public map(callback: (v: number) => number): void {
    this.x = callback(this.x);
    this.y = callback(this.y);
    this.z = callback(this.z);
    this.w = callback(this.w);
  }

  public scale(factor: number): void {
    this.x *= factor;
    this.y *= factor;
    this.z *= factor;
    this.w *= factor;
  }

  public set(source: Vector4): void {
    this.x = source.x;
    this.y = source.y;
    this.z = source.z;
    this.w = source.w;
  }

  public setArray(values: ArrayLike<number>): void {
    if (values.length < 4) {
      throw Error("Vector4 must be created from array with 4+ elements");
    }

    this.x = values[0];
    this.y = values[1];
    this.z = values[2];
    this.w = values[3];
  }

  public setXYZW(x: number, y: number, z: number, w: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
}

class Vector4 {
  public static fromSource(
    source: Vector4,
    ...invokes: InvokeOf<MutableVector4>[]
  ): MutableVector4 {
    const { x, y, z, w } = source;

    return invokeOnObject(new MutableVector4(x, y, z, w), invokes);
  }

  public static fromZero(
    ...invokes: InvokeOf<MutableVector4>[]
  ): MutableVector4 {
    return invokeOnObject(new MutableVector4(0, 0, 0, 0), invokes);
  }

  public static toArray(vector: Vector4): [number, number, number, number] {
    return [vector.x, vector.y, vector.z, vector.w];
  }

  public static readonly zero: Vector4 = { x: 0, y: 0, z: 0, w: 0 };
}

export {
  MutableVector2,
  MutableVector3,
  MutableVector4,
  Vector2,
  Vector3,
  Vector4,
};
