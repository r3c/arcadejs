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

  public len(): number {
    const { x, y } = this;

    return Math.sqrt(x * x + y * y);
  }

  public normalize(): void {
    const length = this.len();

    if (length !== 0) {
      const lengthInverse = 1 / length;

      this.x *= lengthInverse;
      this.y *= lengthInverse;
    }
  }

  public scale(factor: number): void {
    this.x *= factor;
    this.y *= factor;
  }

  public set(source: Vector2): void {
    this.x = source.x;
    this.y = source.y;
  }

  public sub(rhs: Vector2): void {
    this.x -= rhs.x;
    this.y -= rhs.y;
  }
}

class Vector2 {
  public static fromArray(values: number[]): MutableVector2 {
    return new MutableVector2(values[0], values[1]);
  }

  public static fromCustom(
    ...invokes: InvokeOf<MutableVector2>[]
  ): MutableVector2 {
    return invokeOnObject(Vector2.fromZero(), invokes);
  }

  public static fromObject(vector: Vector2): MutableVector2 {
    return new MutableVector2(vector.x, vector.y);
  }

  public static fromXY(x: number, y: number): MutableVector2 {
    return new MutableVector2(x, y);
  }

  public static fromZero(): MutableVector2 {
    return new MutableVector2(0, 0);
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

  public dot(rhs: Vector3): number {
    return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z;
  }

  public len(): number {
    const { x, y, z } = this;

    return Math.sqrt(x * x + y * y + z * z);
  }

  public map(callback: (v: number) => number): void {
    this.x = callback(this.x);
    this.y = callback(this.y);
    this.z = callback(this.z);
  }

  public normalize(): void {
    const length = this.len();

    if (length !== 0) {
      const lengthInverse = 1 / length;

      this.x *= lengthInverse;
      this.y *= lengthInverse;
      this.z *= lengthInverse;
    }
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

  public sub(rhs: Vector3): void {
    this.x -= rhs.x;
    this.y -= rhs.y;
    this.z -= rhs.z;
  }
}

class Vector3 {
  public static fromArray(values: number[]): MutableVector3 {
    return new MutableVector3(values[0], values[1], values[2]);
  }

  public static fromCustom(
    ...invokes: InvokeOf<MutableVector3>[]
  ): MutableVector3 {
    return invokeOnObject(Vector3.fromZero(), invokes);
  }

  public static fromObject(vector: Vector3): MutableVector3 {
    return new MutableVector3(vector.x, vector.y, vector.z);
  }

  public static fromXYZ(x: number, y: number, z: number): MutableVector3 {
    return new MutableVector3(x, y, z);
  }

  public static fromZero(): MutableVector3 {
    return new MutableVector3(0, 0, 0);
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
}

class Vector4 {
  public static fromArray(values: number[]): MutableVector4 {
    return new MutableVector4(values[0], values[1], values[2], values[3]);
  }

  public static fromCustom(
    ...invokes: InvokeOf<MutableVector4>[]
  ): MutableVector4 {
    return invokeOnObject(Vector4.fromZero(), invokes);
  }

  public static fromObject(vector: Vector4): MutableVector4 {
    return new MutableVector4(vector.x, vector.y, vector.z, vector.w);
  }

  public static fromXYZW(
    x: number,
    y: number,
    z: number,
    w: number
  ): MutableVector4 {
    return new MutableVector4(x, y, z, w);
  }

  public static fromZero(): MutableVector4 {
    return new MutableVector4(0, 0, 0, 0);
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
