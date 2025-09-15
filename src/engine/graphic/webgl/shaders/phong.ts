import { resultLightType } from "./light";
import { shaderWhen, shaderCase, GlShaderFunction } from "../shader";

const enum PhongLightVariant {
  Standard,
  BlinnPhong,
}

const phongLightType = "PhongLight";

const phongLightApply: GlShaderFunction<
  { diffuse: boolean; specular: boolean },
  { lightCast: string; diffuseColor: string; specularColor: string }
> = {
  declare: ({ diffuse, specular }) => `
struct ${phongLightType} {
  vec3 color;
  float diffuseStrength;
  float specularStrength;
};

vec3 phongLightApply(in ${phongLightType} lightCast, in vec3 diffuseColor, in vec3 specularColor) {
  float diffuse = ${shaderWhen(diffuse, "1.0", "0.0")};
  float specular = ${shaderWhen(specular, "1.0", "0.0")};

  return
    lightCast.diffuseStrength * lightCast.color * diffuseColor * diffuse +
    lightCast.specularStrength * lightCast.color * specularColor * specular;
}`,

  invoke: ({ lightCast, diffuseColor, specularColor }) =>
    `phongLightApply(${lightCast}, ${diffuseColor}, ${specularColor})`,
};

const phongLightCast: GlShaderFunction<
  { variant: PhongLightVariant },
  { light: string; shininess: string; normal: string; eye: string }
> = {
  declare: ({ variant }) => `
float phongLightDiffuseStrength(in ${resultLightType} light, in vec3 normal) {
  float lightNormalCosine = dot(normal, light.direction);

  return clamp(lightNormalCosine, 0.0, 1.0);
}

float phongLightSpecularStrength(in ${resultLightType} light, in float shininess, in vec3 normal, in vec3 eye) {
  float lightNormalCosine = dot(normal, light.direction);
  float lightVisible = sqrt(max(lightNormalCosine, 0.0));

  ${shaderCase(
    variant,
    [
      PhongLightVariant.BlinnPhong, // Blinn-Phong model
      `
  vec3 cameraLightMidway = normalize(eye + light.direction);

  float lightCosine = max(dot(normal, cameraLightMidway), 0.0);`,
    ],
    [
      PhongLightVariant.Standard, // Phong model
      `
  vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - light.direction);

  float lightCosine = max(dot(specularReflection, eye), 0.0);`,
    ]
  )}

  return pow(lightCosine, shininess) * lightVisible;
}

${phongLightType} phongLightCast(in ${resultLightType} light, in float shininess, in vec3 normal, in vec3 eye) {
  float diffuseStrength = phongLightDiffuseStrength(light, normal);
  float specularStrength = phongLightSpecularStrength(light, shininess, normal, eye);

  return ${phongLightType}(light.color, diffuseStrength * light.strength, specularStrength * light.strength);
}`,

  invoke: ({ light, shininess, normal, eye }) =>
    `phongLightCast(${light}, ${shininess}, ${normal}, ${eye})`,
};

export { PhongLightVariant, phongLightApply, phongLightCast, phongLightType };
