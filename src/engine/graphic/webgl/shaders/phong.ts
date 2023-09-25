import { GlShaderFunction } from "../language";
import { resultLightType } from "./light";

const phongLightType = "PhongLight";

const phongLightApply: GlShaderFunction<
  [string, string],
  [string, string, string]
> = {
  declare: (diffuseDirective: string, specularDirective: string) => `
struct ${phongLightType} {
  vec3 color;
  float diffuseStrength;
  float specularStrength;
};

vec3 phongLightApply(in ${phongLightType} lightCast, in vec3 albedo, in float glossiness) {
  return
    lightCast.diffuseStrength * lightCast.color * albedo * float(${diffuseDirective}) +
    lightCast.specularStrength * lightCast.color * glossiness * float(${specularDirective});
}`,

  invoke: (lightCast: string, albedo: string, glossiness: string) =>
    `phongLightApply(${lightCast}, ${albedo}, ${glossiness})`,
};

const phongLightCast: GlShaderFunction<[], [string, string, string, string]> = {
  declare: () => `
float phongLightDiffuseStrength(in ${resultLightType} light, in vec3 normal) {
  float lightNormalCosine = dot(normal, light.direction);

  return clamp(lightNormalCosine, 0.0, 1.0);
}

float phongLightSpecularStrength(in ${resultLightType} light, in float shininess, in vec3 normal, in vec3 eye) {
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

  return pow(lightCosine, shininess) * lightVisible;
}

${phongLightType} phongLightCast(in ${resultLightType} light, in float shininess, in vec3 normal, in vec3 eye) {
  float diffuseStrength = phongLightDiffuseStrength(light, normal);
  float specularStrength = phongLightSpecularStrength(light, shininess, normal, eye);

  return ${phongLightType}(light.color, diffuseStrength * light.strength, specularStrength * light.strength);
}`,

  invoke: (light: string, shininess: string, normal: string, eye: string) =>
    `phongLightCast(${light}, ${shininess}, ${normal}, ${eye})`,
};

export { phongLightApply, phongLightCast, phongLightType };
