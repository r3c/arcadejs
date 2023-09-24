import { GlShaderFunction } from "../language";
import { resultLightType } from "./light";

const phongLightType = "PhongLight";

const phongLightApply: GlShaderFunction<[string, string], [string, string]> = {
  declare: (diffuseDirective: string, specularDirective: string) => `
struct ${phongLightType} {
  vec3 color;
  float diffuseFactor;
  float specularFactor;
};

vec3 phongLightApply(in ${phongLightType} lightCast, in vec3 materialAlbedo) {
  return
    lightCast.diffuseFactor * lightCast.color * materialAlbedo * float(${diffuseDirective}) +
    lightCast.specularFactor * lightCast.color * float(${specularDirective});
}`,

  invoke: (lightCast: string, materialAlbedo: string) =>
    `phongLightApply(${lightCast}, ${materialAlbedo})`,
};

const phongLightCast: GlShaderFunction<
  [],
  [string, string, string, string, string]
> = {
  declare: () => `
float phongLightDiffusePower(in ${resultLightType} light, in vec3 normal) {
  float lightNormalCosine = dot(normal, light.direction);

  return clamp(lightNormalCosine, 0.0, 1.0);
}

float phongLightSpecularPower(in ${resultLightType} light, in float materialGlossiness, in float materialShininess, in vec3 normal, in vec3 eye) {
  float lightNormalCosine = dot(normal, light.direction);
  float lightVisible = sqrt(max(lightNormalCosine, 0.0));

  #ifdef LIGHT_MODEL_PHONG_STANDARD
    // Phong model
    vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - light.direction);

    float lightCosine = max(dot(specularReflection, eye), 0.0);
  #else
    // Blinn-Phong model
    vec3 cameraLightMidway = normalize(eye + light.direction);

    float lightCosine = max(dot(normal, cameraLightMidway), 0.0);
  #endif

  return materialGlossiness * pow(lightCosine, materialShininess) * lightVisible;
}

${phongLightType} phongLightCast(in ${resultLightType} light, in float materialGlossiness, in float materialShininess, in vec3 normal, in vec3 eye) {
  float diffuseFactor = phongLightDiffusePower(light, normal);
  float specularFactor = phongLightSpecularPower(light, materialGlossiness, materialShininess, normal, eye);

  return ${phongLightType}(light.color, diffuseFactor * light.power, specularFactor * light.power);
}`,

  invoke: (
    light: string,
    materialGlossiness: string,
    materialShininess: string,
    normal: string,
    eye: string
  ) =>
    `phongLightCast(${light}, ${materialGlossiness}, ${materialShininess}, ${normal}, ${eye})`,
};

export { phongLightApply, phongLightCast, phongLightType };
