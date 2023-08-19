import { GlShaderFunction } from "../shader";

const parallaxPerturb: GlShaderFunction<
  [string, string, string, string, string, string, string, string]
> = {
  declare: (): string => `
  vec2 heightParallax(in sampler2D sampler, in vec2 coord, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in vec3 t, in vec3 b, in vec3 n) {
    vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n)));
  
    return coord + (texture(sampler, coord).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
  }`,

  invoke: (
    sampler: string,
    coord: string,
    eyeDirection: string,
    parallaxScale: string,
    parallaxBias: string,
    t: string,
    b: string,
    n: string
  ): string =>
    `heightParallax(${sampler}, ${coord}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${t}, ${b}, ${n})`,
};

export { parallaxPerturb };
