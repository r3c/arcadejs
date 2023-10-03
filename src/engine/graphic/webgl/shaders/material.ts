import { GlShaderFunction } from "../language";
import { standardToLinear } from "./rgb";

const materialType = "Material";

const materialSample: GlShaderFunction<
  [],
  [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string
  ]
> = {
  declare: () => `
struct ${materialType} {
  vec4 diffuseColor;
  float specularColor;
  float metalness;
  float roughness;
  float shininess;
};

${materialType} materialSample(
  in vec4 diffuseColor, in sampler2D diffuseMap, in float specularColor, in sampler2D specularMap,
  in sampler2D metalnessMap, in float metalnessStrength, in sampler2D roughnessMap, in float roughnessStrength,
  in float shininess, in vec2 coordinate) {
  vec4 diffuseSample = texture(diffuseMap, coordinate);
  vec4 combinedDiffuseColor = diffuseColor * vec4(${standardToLinear.invoke(
    `diffuseSample.rgb`
  )}, diffuseSample.a);
  float combinedSpecularColor = specularColor * texture(specularMap, coordinate).r;
  float metalness = metalnessStrength * texture(metalnessMap, coordinate).r;
  float roughness = roughnessStrength * texture(roughnessMap, coordinate).r;

  return ${materialType}(
    combinedDiffuseColor,
    combinedSpecularColor,
    clamp(metalness, 0.0, 1.0),
    clamp(roughness, 0.04, 1.0),
    shininess
  );
}`,

  invoke: (
    diffuseColor: string,
    diffuseMap: string,
    specularColor: string,
    specularMap: string,
    metalnessMap: string,
    metalnessStrength: string,
    roughnessMap: string,
    roughnessStrength: string,
    shininess: string,
    coordinate: string
  ) =>
    `materialSample(${diffuseColor}, ${diffuseMap}, ${specularColor}, ${specularMap}, ${metalnessMap}, ${metalnessStrength}, ${roughnessMap}, ${roughnessStrength}, ${shininess}, ${coordinate})`,
};

export { materialSample, materialType };
