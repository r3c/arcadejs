import { TextureSampler, defaultSampler } from "./mesh";
import { Vector4 } from "../math/vector";
import { GlContext } from "./webgl/resource";
import { Releasable } from "../io/resource";
import { GlFormat, GlMap, GlTexture, createTexture } from "./webgl/texture";
import { GlShader, GlShaderSource, createShader } from "./webgl/shader";

type GlRuntime = Releasable & {
  createShader: (source: GlShaderSource) => GlShader;
  context: GlContext;
};

const createRuntime = (context: GlContext): GlRuntime => {
  const createConstantTexture = (color: Vector4) =>
    createTexture(
      context,
      GlMap.Quad,
      { x: 1, y: 1 },
      GlFormat.RGBA8,
      defaultSampler,
      new ImageData(
        new Uint8ClampedArray(
          Vector4.toArray(
            Vector4.fromSource(color, ["scale", 255], ["map", Math.floor])
          )
        ),
        1,
        1
      )
    );

  const textureBlack = createConstantTexture({ x: 0, y: 0, z: 0, w: 0 });
  const textureNormal = createConstantTexture({ x: 0.5, y: 0.5, z: 1, w: 1 });
  const textureWhite = createConstantTexture({ x: 1, y: 1, z: 1, w: 1 });
  const shaderDefault = { textureBlack, textureNormal, textureWhite };

  let currentProgram: WebGLProgram | undefined = undefined;

  // Forward call to `gl.useProgram` if given program is not already active
  // (may be premature optimization e.g. duplicate of underlying implementation)
  const useProgram = (program: WebGLProgram): void => {
    if (currentProgram !== program) {
      context.useProgram(program);
    }
  };

  return {
    release: () => {
      textureBlack.release();
      textureNormal.release();
      textureWhite.release();
    },
    createShader: (source) =>
      createShader(context, useProgram, shaderDefault, source),
    context,
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
  filter?: TextureSampler
): GlTexture => {
  return createTexture(
    gl,
    GlMap.Cube,
    { x: facePositiveX.width, y: facePositiveX.height },
    GlFormat.RGBA8,
    filter ?? defaultSampler,
    [
      facePositiveX,
      faceNegativeX,
      facePositiveY,
      faceNegativeY,
      facePositiveZ,
      faceNegativeZ,
    ]
  );
};

const loadTextureQuad = (
  gl: GlContext,
  image: ImageData,
  filter?: TextureSampler
): GlTexture => {
  return createTexture(
    gl,
    GlMap.Quad,
    { x: image.width, y: image.height },
    GlFormat.RGBA8,
    filter ?? defaultSampler,
    image
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
