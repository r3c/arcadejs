import { createSingletonFunction, shader } from "../shader";

const parallaxPerturb = createSingletonFunction<{
  coordinate: string;
  eyeDirection: string;
  parallaxScale: string;
  parallaxBias: string;
  sampler: string;
  tbn: string;
}>(
  shader`\
vec2 heightParallax(in sampler2D sampler, in vec2 coordinate, in vec3 eyeDirection, in float parallaxScale, in float parallaxBias, in mat3 tbn) {
  vec3 eyeDirectionFace = normalize(vec3(dot(eyeDirection, tbn[0]), dot(eyeDirection, tbn[1]), dot(eyeDirection, tbn[2])));

  return coordinate + (texture(sampler, coordinate).r * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
}`,
  ({ coordinate, eyeDirection, parallaxScale, parallaxBias, sampler, tbn }) =>
    `heightParallax(${sampler}, ${coordinate}, ${eyeDirection}, ${parallaxScale}, ${parallaxBias}, ${tbn})`,
);

export { parallaxPerturb };
