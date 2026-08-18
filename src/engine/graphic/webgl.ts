import { Interpolation, TextureSampler, Wrap, defaultSampler } from "./mesh";
import { Vector4 } from "../math/vector";
import { GlContext } from "./webgl/resource";
import { Releasable } from "../io/resource";
import { GlFormat, GlMap, GlTexture, createTexture } from "./webgl/texture";
import { GlShader, GlShaderSource, createShader } from "./webgl/shader";

type GlRuntime = Releasable & {
  createShader: (source: GlShaderSource) => GlShader;
  context: GlContext;
};

const createRuntime = (gl: GlContext): GlRuntime => {
  const sampler = {
    magnifier: Interpolation.Nearest,
    minifier: Interpolation.Nearest,
    mipmap: false,
    wrap: Wrap.Clamp,
  };

  const createPixelImageData = (color: Vector4) =>
    new ImageData(
      new Uint8ClampedArray(
        Vector4.toArray(
          Vector4.fromSource(color, ["scale", 255], ["map", Math.floor]),
        ),
      ),
      1,
      1,
    );

  const createColorCubeTexture = (color: Vector4) => {
    const imageData = createPixelImageData(color);

    return loadTextureCube(
      gl,
      imageData,
      imageData,
      imageData,
      imageData,
      imageData,
      imageData,
      sampler,
    );
  };

  const createColorQuadTexture = (color: Vector4) => {
    const imageData = createPixelImageData(color);

    return loadTextureQuad(gl, imageData, sampler);
  };

  const cubeBlack = createColorCubeTexture({ x: 0, y: 0, z: 0, w: 0 });
  const quadBlack = createColorQuadTexture({ x: 0, y: 0, z: 0, w: 0 });
  const quadNormal = createColorQuadTexture({ x: 0.5, y: 0.5, z: 1, w: 1 });
  const quadWhite = createColorQuadTexture({ x: 1, y: 1, z: 1, w: 1 });
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

const loadTextureCube = (
  gl: GlContext,
  facePositiveX: ImageData,
  faceNegativeX: ImageData,
  facePositiveY: ImageData,
  faceNegativeY: ImageData,
  facePositiveZ: ImageData,
  faceNegativeZ: ImageData,
  sampler?: TextureSampler,
): GlTexture => {
  return createTexture(
    gl,
    GlMap.Cube,
    { x: facePositiveX.width, y: facePositiveX.height },
    GlFormat.RGBA8,
    sampler ?? defaultSampler,
    [
      facePositiveX,
      faceNegativeX,
      facePositiveY,
      faceNegativeY,
      facePositiveZ,
      faceNegativeZ,
    ],
  );
};

const loadTextureQuad = (
  gl: GlContext,
  image: ImageData,
  sampler?: TextureSampler,
): GlTexture => {
  return createTexture(
    gl,
    GlMap.Quad,
    { x: image.width, y: image.height },
    GlFormat.RGBA8,
    sampler ?? defaultSampler,
    image,
  );
};

export {
  type GlRuntime,
  GlFormat,
  GlMap,
  createRuntime,
  loadTextureCube,
  loadTextureQuad,
};
