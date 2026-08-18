import { TextureSampler, color, sampler } from "./mesh";
import { Vector4 } from "../math/vector";
import { GlContext } from "./webgl/resource";
import { Releasable } from "../io/resource";
import {
  GlFormat,
  GlTexture,
  createColorPixels,
  createCubeTextureFromPixels,
  createQuadTextureFromPixels,
} from "./webgl/texture";
import { GlShader, GlShaderSource, createShader } from "./webgl/shader";

type GlRuntime = Releasable & {
  createShader: (source: GlShaderSource) => GlShader;
  context: GlContext;
};

const createColorCubeTexture = (gl: GlContext, color: Vector4) => {
  const format = GlFormat.RGBA8;
  const size = { x: 1, y: 1 };
  const pixels = createColorPixels(size, format, color);

  return createCubeTextureFromPixels(
    gl,
    size,
    format,
    sampler.pixelized,
    pixels,
    pixels,
    pixels,
    pixels,
    pixels,
    pixels,
  );
};

const createColorQuadTexture = (gl: GlContext, color: Vector4) => {
  const format = GlFormat.RGBA8;
  const size = { x: 1, y: 1 };
  const pixels = createColorPixels(size, format, color);

  return createQuadTextureFromPixels(
    gl,
    size,
    format,
    sampler.pixelized,
    pixels,
  );
};

const createRuntime = (gl: GlContext): GlRuntime => {
  const cubeBlack = createColorCubeTexture(gl, color.black);
  const quadBlack = createColorQuadTexture(gl, color.black);
  const quadNormal = createColorQuadTexture(gl, { x: 0.5, y: 0.5, z: 1, w: 1 });
  const quadWhite = createColorQuadTexture(gl, color.white);
  const fallback = { cubeBlack, quadBlack, quadNormal, quadWhite };

  // Forward call to `gl.useProgram` if given program is not already active
  // (may be premature optimization e.g. duplicate of underlying implementation)
  let currentProgram: WebGLProgram | undefined = undefined;

  const useProgram = (program: WebGLProgram): void => {
    if (currentProgram !== program) {
      gl.useProgram(program);
    }
  };

  return {
    release: () => {
      cubeBlack.release();
      quadBlack.release();
      quadNormal.release();
      quadWhite.release();
    },
    createShader: (source) => createShader(gl, useProgram, fallback, source),
    context: gl,
  };
};

const loadCubeTextureFromImage = (
  gl: GlContext,
  sampler: TextureSampler,
  xPositiveImage: ImageData,
  xNegativeImage: ImageData,
  yPositiveImage: ImageData,
  yNegativeImage: ImageData,
  zPositiveImage: ImageData,
  zNegativeImage: ImageData,
): GlTexture => {
  return createCubeTextureFromPixels(
    gl,
    { x: xPositiveImage.width, y: xPositiveImage.height },
    GlFormat.RGBA8,
    sampler,
    xPositiveImage.data,
    xNegativeImage.data,
    yPositiveImage.data,
    yNegativeImage.data,
    zPositiveImage.data,
    zNegativeImage.data,
  );
};

const loadQuadTextureFromImage = (
  gl: GlContext,
  sampler: TextureSampler,
  image: ImageData,
): GlTexture => {
  return createQuadTextureFromPixels(
    gl,
    { x: image.width, y: image.height },
    GlFormat.RGBA8,
    sampler,
    image.data,
  );
};

export {
  type GlRuntime,
  GlFormat,
  createRuntime,
  loadCubeTextureFromImage,
  loadQuadTextureFromImage,
};
