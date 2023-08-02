import { Context2DScreen } from "./display";
import { Matrix4 } from "../math/matrix";
import { Attribute, Material, Model, Mesh } from "../graphic/model";
import { Vector2, Vector3, Vector4 } from "../math/vector";

enum DrawMode {
  Default,
  Wire,
}

interface Image {
  colors: Uint8ClampedArray;
  depths: Float32Array;
  height: number;
  width: number;
}

interface Vertex {
  color: Vector4;
  coord: Vector2;
  point: Vector3;
}

const defaultAttribute = {
  buffer: new Float32Array(4).fill(0),
  stride: 0,
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
    if (x0 >= 0 && x0 < image.width && y0 >= 0 && y0 < image.height) {
      const index = (x0 + y0 * image.width) * 4;

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

const drawMeshes = (
  image: Image,
  meshes: Iterable<Mesh>,
  modelViewProjection: Matrix4,
  drawMode: DrawMode
) => {
  const halfWidth = image.width * 0.5;
  const halfHeight = image.height * 0.5;
  const drawTriangle =
    drawMode === DrawMode.Default ? drawTriangleTexture : drawTriangleWireframe;

  for (const mesh of meshes) {
    drawMeshes(image, mesh.children, modelViewProjection, drawMode);

    for (const polygon of mesh.polygons) {
      const colors = polygon.colors || defaultAttribute;
      const coords = polygon.coords || defaultAttribute;
      const indices = polygon.indices;
      const material = polygon.material;
      const points = polygon.points;

      for (let i = 0; i + 3 <= indices.length; i += 3) {
        const vertex0 = projectVertexToScreen(
          modelViewProjection,
          halfWidth,
          halfHeight,
          points,
          colors,
          coords,
          indices[i + 0]
        );

        const vertex1 = projectVertexToScreen(
          modelViewProjection,
          halfWidth,
          halfHeight,
          points,
          colors,
          coords,
          indices[i + 1]
        );

        const vertex2 = projectVertexToScreen(
          modelViewProjection,
          halfWidth,
          halfHeight,
          points,
          colors,
          coords,
          indices[i + 2]
        );

        drawTriangle(image, vertex0, vertex1, vertex2, material);
      }
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
  if (y < 0 || y >= image.height) {
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

  const offset = ~~y * image.width;
  const length = Math.max(end.x - begin.x, 1);
  const start = Math.max(begin.x, 0);
  const stop = Math.min(end.x, image.width - 1);

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
      // Albedo color
      if (material.albedoFactor !== undefined) {
        color.x *= material.albedoFactor.x;
        color.y *= material.albedoFactor.y;
        color.z *= material.albedoFactor.z;
        color.w *= material.albedoFactor.w;
      }

      // Albedo map
      if (material.albedoMap !== undefined) {
        const coord = lerpVector2(begin.coord, end.coord, ratio);
        const image = material.albedoMap.image;

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
  const point = Matrix4.transform(modelViewProjection, {
    x: position.x,
    y: position.y,
    z: position.z,
    w: 1,
  });

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
  points: Attribute,
  colors: Attribute,
  coords: Attribute,
  index: number
) => {
  return {
    color: {
      x: colors.buffer[index * colors.stride + 0],
      y: colors.buffer[index * colors.stride + 1],
      z: colors.buffer[index * colors.stride + 2],
      w: colors.buffer[index * colors.stride + 3],
    },
    coord: {
      x: coords.buffer[index * coords.stride + 0],
      y: coords.buffer[index * coords.stride + 1],
    },
    point: projectPointToScreen(modelViewProjection, halfWidth, halfHeight, {
      x: points.buffer[index * points.stride + 0],
      y: points.buffer[index * points.stride + 1],
      z: points.buffer[index * points.stride + 2],
    }),
  };
};

class Renderer {
  private readonly screen: Context2DScreen;

  public constructor(screen: Context2DScreen) {
    this.screen = screen;
  }

  public clear() {
    const screen = this.screen;

    screen.context.fillStyle = "black";
    screen.context.fillRect(0, 0, screen.getWidth(), screen.getHeight());
  }

  public draw(
    model: Model,
    projection: Matrix4,
    modelView: Matrix4,
    drawMode: DrawMode
  ) {
    const screen = this.screen;
    const capture = screen.context.getImageData(
      0,
      0,
      screen.getWidth(),
      screen.getHeight()
    );

    const image = {
      colors: capture.data,
      depths: new Float32Array(capture.width * capture.height),
      height: capture.height,
      width: capture.width,
    };

    image.depths.fill(Math.pow(2, 127));

    const viewModelProjection = Matrix4.fromObject(projection);

    viewModelProjection.multiply(modelView);

    drawMeshes(image, model.meshes, viewModelProjection, drawMode);

    screen.context.putImageData(capture, 0, 0);
  }
}

export { DrawMode, Renderer };
