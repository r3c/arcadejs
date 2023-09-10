import { GlShaderFunction } from "../language";

const parallaxPerturb: GlShaderFunction<
  [],
  [string, string, string, string, string, string]
> = {
  declare: (): string => `
  vec2 heightParallax(in sampler2D sampler, in vec2 coord, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in mat3 tbn) {
    vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, tbn[0]), dot(eyeDirection, tbn[1]), dot(eyeDirection, tbn[2])));
  
    return coord + (texture(sampler, coord).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
  }`,

  invoke: (
    sampler: string,
    coord: string,
    eyeDirection: string,
    parallaxScale: string,
    parallaxBias: string,
    tbn: string
  ): string =>
    `heightParallax(${sampler}, ${coord}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${tbn})`,
};

export { parallaxPerturb };
