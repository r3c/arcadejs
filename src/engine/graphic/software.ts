import { Context2DScreen } from "./display";
import { Matrix4 } from "../math/matrix";
import { Material, Mesh, defaultColor } from "./mesh";
import { Vector2, Vector3, Vector4 } from "../math/vector";
import { Renderer } from "./display";

const enum SoftwareDrawMode {
  Default,
  Wire,
}

type Image = {
  colors: Uint8ClampedArray;
  depths: Float32Array;
  size: Vector2;
};

type Vertex = {
  color: Vector4;
  coord: Vector2;
  point: Vector3;
};

const drawLine = (image: Image, begin: Vector3, end: Vector3) => {
  let x0 = ~~begin.x;
  const x1 = ~~end.x;
  let y0 = ~~begin.y;
  const y1 = ~~end.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;

  let err = dx - dy;

  while (x0 !== x1 || y0 !== y1) {
    if (x0 >= 0 && x0 < image.size.x && y0 >= 0 && y0 < image.size.y) {
      const index = (x0 + y0 * image.size.x) * 4;

      image.colors[index + 0] = 255;
      image.colors[index + 1] = 255;
      image.colors[index + 2] = 255;
      image.colors[index + 3] = 255;
    }

    const e2 = err * 2;

    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }

    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
};

const drawMesh = (
  image: Image,
  mesh: Mesh,
  modelViewProjection: Matrix4,
  drawMode: SoftwareDrawMode
) => {
  const halfWidth = image.size.x * 0.5;
  const halfHeight = image.size.y * 0.5;
  const drawTriangle =
    drawMode === SoftwareDrawMode.Default
      ? drawTriangleTexture
      : drawTriangleWireframe;

  for (const child of mesh.children) {
    drawMesh(image, child, modelViewProjection, drawMode);
  }

  for (const polygon of mesh.polygons) {
    const { coordinates, indices, material, positions, tints } = polygon;

    for (let i = 0; i < indices.length; ++i) {
      const vertex0 = projectVertexToScreen(
        modelViewProjection,
        halfWidth,
        halfHeight,
        positions,
        tints,
        coordinates,
        indices[i].x
      );

      const vertex1 = projectVertexToScreen(
        modelViewProjection,
        halfWidth,
        halfHeight,
        positions,
        tints,
        coordinates,
        indices[i].y
      );

      const vertex2 = projectVertexToScreen(
        modelViewProjection,
        halfWidth,
        halfHeight,
        positions,
        tints,
        coordinates,
        indices[i].z
      );

      drawTriangle(image, vertex0, vertex1, vertex2, material);
    }
  }
};

const drawScanline = (
  image: Image,
  y: number,
  va: Vertex,
  vb: Vertex,
  vc: Vertex,
  vd: Vertex,
  material: Material | undefined
) => {
  if (y < 0 || y >= image.size.y) {
    return;
  }

  const ratio1 = (y - va.point.y) / Math.max(vb.point.y - va.point.y, 1);
  const ratio2 = (y - vc.point.y) / Math.max(vd.point.y - vc.point.y, 1);

  let begin = {
    color: lerpVector4(va.color, vb.color, ratio1),
    coord: lerpVector2(va.coord, vb.coord, ratio1),
    depth: lerpScalar(va.point.z, vb.point.z, ratio1),
    x: lerpScalar(va.point.x, vb.point.x, ratio1),
  };

  let end = {
    color: lerpVector4(vc.color, vd.color, ratio2),
    coord: lerpVector2(vc.coord, vd.coord, ratio2),
    depth: lerpScalar(vc.point.z, vd.point.z, ratio2),
    x: lerpScalar(vc.point.x, vd.point.x, ratio2),
  };

  if (begin.x > end.x) {
    [begin, end] = [end, begin];
  }

  const offset = ~~y * image.size.x;
  const length = Math.max(end.x - begin.x, 1);
  const start = Math.max(begin.x, 0);
  const stop = Math.min(end.x, image.size.x - 1);

  for (var x = start; x <= stop; ++x) {
    const ratio = (x - begin.x) / length;

    // Vertex depth
    const depth = lerpScalar(begin.depth, end.depth, ratio);
    const depthIndex = offset + ~~x;

    if (depth >= image.depths[depthIndex]) {
      continue;
    }

    image.depths[depthIndex] = depth;

    // Vertex color
    const color = lerpVector4(begin.color, end.color, ratio);
    const colorIndex = depthIndex * 4;

    // Apply material properties
    if (material !== undefined) {
      // Diffuse color
      if (material.diffuseColor !== undefined) {
        color.x *= material.diffuseColor.x;
        color.y *= material.diffuseColor.y;
        color.z *= material.diffuseColor.z;
        color.w *= material.diffuseColor.w;
      }

      // Diffuse map
      if (material.diffuseMap !== undefined) {
        const coord = lerpVector2(begin.coord, end.coord, ratio);
        const image = material.diffuseMap.image;

        const x = ~~(coord.x * image.width) % image.width;
        const y = ~~(coord.y * image.height) % image.height;

        const coordIndex = (x + y * image.width) * 4;

        color.x *= image.data[coordIndex + 0] / 255;
        color.y *= image.data[coordIndex + 1] / 255;
        color.z *= image.data[coordIndex + 2] / 255;
        color.w *= image.data[coordIndex + 3] / 255;
      }
    }

    // Set pixels
    image.colors[colorIndex + 0] = color.x * 255;
    image.colors[colorIndex + 1] = color.y * 255;
    image.colors[colorIndex + 2] = color.z * 255;
    image.colors[colorIndex + 3] = color.w * 255;
  }
};

/*
 ** From: https://www.davrous.com/2013/06/21/tutorial-part-4-learning-how-to-write-a-3d-software-engine-in-c-ts-or-js-rasterization-z-buffering/
 */
const drawTriangleTexture = (
  image: Image,
  v1: Vertex,
  v2: Vertex,
  v3: Vertex,
  material: Material | undefined
) => {
  // Reorder p1, p2 and p3 so that p1.y <= p2.y <= p3.y
  if (v1.point.y > v2.point.y) {
    [v1, v2] = [v2, v1];
  }

  if (v2.point.y > v3.point.y) {
    [v2, v3] = [v3, v2];
  }

  if (v1.point.y > v2.point.y) {
    [v1, v2] = [v2, v1];
  }

  // Compute p1-p2 and p1-p3 slopes
  const slope12 =
    v2.point.y > v1.point.y
      ? (v2.point.x - v1.point.x) / (v2.point.y - v1.point.y)
      : 0;

  const slope13 =
    v3.point.y > v1.point.y
      ? (v3.point.x - v1.point.x) / (v3.point.y - v1.point.y)
      : 0;

  if (slope12 > slope13) {
    for (let y = v1.point.y; y < v2.point.y; ++y) {
      drawScanline(image, y, v1, v3, v1, v2, material);
    }

    for (let y = v2.point.y; y <= v3.point.y; ++y) {
      drawScanline(image, y, v1, v3, v2, v3, material);
    }
  } else {
    for (let y = v1.point.y; y < v2.point.y; ++y) {
      drawScanline(image, y, v1, v2, v1, v3, material);
    }

    for (let y = v2.point.y; y <= v3.point.y; ++y) {
      drawScanline(image, y, v2, v3, v1, v3, material);
    }
  }
};

const drawTriangleWireframe = (
  image: Image,
  v1: Vertex,
  v2: Vertex,
  v3: Vertex
) => {
  drawLine(image, v1.point, v2.point);
  drawLine(image, v1.point, v3.point);
  drawLine(image, v2.point, v3.point);
};

const lerpScalar = (min: number, max: number, ratio: number) => {
  return min + (max - min) * ratio;
};

const lerpVector2 = (min: Vector2, max: Vector2, ratio: number) => {
  return {
    x: lerpScalar(min.x, max.x, ratio),
    y: lerpScalar(min.y, max.y, ratio),
  };
};

const lerpVector4 = (min: Vector4, max: Vector4, ratio: number) => {
  return {
    x: lerpScalar(min.x, max.x, ratio),
    y: lerpScalar(min.y, max.y, ratio),
    z: lerpScalar(min.z, max.z, ratio),
    w: lerpScalar(min.w, max.w, ratio),
  };
};

const projectPointToScreen = (
  modelViewProjection: Matrix4,
  halfWidth: number,
  halfHeight: number,
  position: Vector3
) => {
  const point = Vector4.fromSource(
    {
      x: position.x,
      y: position.y,
      z: position.z,
      w: 1,
    },
    ["transform", modelViewProjection]
  );

  /*
   ** Normalize point and apply following conversions:
   ** - Convert x range from [-1, 1] to [0, screen.width]
   ** - Convert y range from [-1, 1] to [0, screen.height]
   ** - Negate y to use WebGL convension
   */
  return {
    x: (point.x / point.w) * halfWidth + halfWidth,
    y: (-point.y / point.w) * halfHeight + halfHeight,
    z: point.z / point.w,
  };
};

const projectVertexToScreen = (
  modelViewProjection: Matrix4,
  halfWidth: number,
  halfHeight: number,
  points: Vector3[],
  colors: Vector4[] | undefined,
  coords: Vector2[] | undefined,
  index: number
) => {
  return {
    color: colors !== undefined ? colors[index] : defaultColor,
    coord: coords !== undefined ? coords[index] : Vector2.zero,
    point: projectPointToScreen(
      modelViewProjection,
      halfWidth,
      halfHeight,
      points[index]
    ),
  };
};

type SoftwareObject = {
  matrix: Matrix4;
  mesh: Mesh;
};

type SoftwareScene<TSceneState> = {
  objects: Iterable<SoftwareObject>;
  state: TSceneState;
};

type SceneState = {
  projection: Matrix4;
  view: Matrix4;
};

class SoftwareRenderer implements Renderer<SoftwareScene<SceneState>> {
  private readonly drawMode: SoftwareDrawMode;
  private readonly screen: Context2DScreen;

  public constructor(screen: Context2DScreen, drawMode: SoftwareDrawMode) {
    this.drawMode = drawMode;
    this.screen = screen;
  }

  public dispose() {
    // No-op
  }

  public render(scene: SoftwareScene<SceneState>) {
    const { objects, state } = scene;
    const screen = this.screen;
    const size = screen.getSize();

    if (size.x === 0 || size.y === 0) {
      return;
    }

    const image = {
      colors: new Uint8ClampedArray(size.x * size.y * 4),
      depths: new Float32Array(size.x * size.y),
      size,
    };

    image.depths.fill(Math.pow(2, 127));

    const modelViewProjection = Matrix4.fromIdentity();
    const viewProjection = Matrix4.fromSource(state.projection);

    viewProjection.multiply(state.view);

    for (const { matrix, mesh } of objects) {
      modelViewProjection.set(viewProjection);
      modelViewProjection.multiply(matrix);

      drawMesh(image, mesh, modelViewProjection, this.drawMode);
    }

    screen.context.putImageData(
      new ImageData(image.colors, image.size.x, image.size.y),
      0,
      0
    );
  }

  public resize() {
    // No-op
  }
}

export { SoftwareDrawMode, SoftwareRenderer };
