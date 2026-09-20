import { standardToLinear } from "./rgb";
import { createSingletonFunction, shader } from "../shader";

const materialTypeName = "Material";
const materialType = createSingletonFunction<void>(
  shader`\
struct ${materialTypeName} {
  vec4 diffuseColor;
  vec4 specularColor;
  float metalness;
  float roughness;
  float shininess;
};`,
  () => materialTypeName,
);

const materialSample = createSingletonFunction<{
  diffuseColor: string;
  diffuseMap: string;
  specularColor: string;
  specularMap: string;
  metalnessMap: string;
  metalnessStrength: string;
  roughnessMap: string;
  roughnessStrength: string;
  shininess: string;
  coordinate: string;
}>(
  shader`\
${materialType()} materialSample(
  in vec4 diffuseColor, in sampler2D diffuseMap, in vec4 specularColor, in sampler2D specularMap,
  in sampler2D metalnessMap, in float metalnessStrength, in sampler2D roughnessMap, in float roughnessStrength,
  in float shininess, in vec2 coordinate) {
  vec4 diffuseSample = texture(diffuseMap, coordinate);
  vec4 diffuseLinear = vec4(${standardToLinear({
    standard: `diffuseSample.rgb`,
  })}, diffuseSample.a);
  vec4 combinedDiffuseColor = diffuseColor * diffuseLinear;

  vec4 specularSample = texture(specularMap, coordinate);
  vec4 specularLinear = vec4(${standardToLinear({
    standard: `specularSample.rgb`,
  })}, specularSample.a);
  vec4 combinedSpecularColor = specularColor * specularLinear;

  float metalness = metalnessStrength * texture(metalnessMap, coordinate).r;
  float roughness = roughnessStrength * texture(roughnessMap, coordinate).r;

  return ${materialType()}(
    combinedDiffuseColor,
    combinedSpecularColor,
    clamp(metalness, 0.0, 1.0),
    clamp(roughness, 0.04, 1.0),
    shininess
  );
}`,
  ({
    diffuseColor,
    diffuseMap,
    specularColor,
    specularMap,
    metalnessMap,
    metalnessStrength,
    roughnessMap,
    roughnessStrength,
    shininess,
    coordinate,
  }) =>
    `materialSample(${diffuseColor}, ${diffuseMap}, ${specularColor}, ${specularMap}, ${metalnessMap}, ${metalnessStrength}, ${roughnessMap}, ${roughnessStrength}, ${shininess}, ${coordinate})`,
);

export { materialSample, materialType };
