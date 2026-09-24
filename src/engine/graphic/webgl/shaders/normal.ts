import { createSingletonFunction, shader } from "../shader";

const normalDecode = createSingletonFunction<[string]>(
  shader`\
vec3 normalDecode(in vec2 encoded) {
  // Spheremap transform
  // See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
  vec2 fenc = encoded * 4.0 - 2.0;
  float f = dot(fenc, fenc);
  float g = sqrt(1.0 - f * 0.25);

  return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}`,

  (encoded) => `normalDecode(${encoded})`,
);

const normalEncode = createSingletonFunction<[string]>(
  shader`\
vec2 normalEncode(in vec3 decoded) {
  // Spheremap transform
  // See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
  return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}`,

  (decoded) => `normalEncode(${decoded})`,
);

const normalPerturb = createSingletonFunction<
  [
    {
      coordinate: string;
      sampler: string;
      tbn: string;
    },
  ]
>(
  shader`\
vec3 normalPerturb(in sampler2D sampler, in vec2 coordinate, in mat3 tbn) {
  vec3 normal = 2.0 * texture(sampler, coordinate).rgb - 1.0;

  return normalize(tbn * normal);
}`,

  ({ coordinate, sampler, tbn }) =>
    `normalPerturb(${sampler}, ${coordinate}, ${tbn})`,
);

export { normalDecode, normalEncode, normalPerturb };
