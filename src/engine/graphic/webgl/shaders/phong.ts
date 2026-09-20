import { resultLightType } from "./light";
import {
  shaderWhen,
  shaderCase,
  createSingletonFunction,
  createUniqueTemplate,
  shader,
} from "../shader";

const enum PhongLightVariant {
  Standard,
  BlinnPhong,
}

const phongLightTypeName = "PhongLight";
const phongLightType = createSingletonFunction<void>(
  shader`\
struct ${phongLightTypeName} {
  vec3 color;
  float diffuseStrength;
  float specularStrength;
};`,
  () => phongLightTypeName,
);

const phongLightApplyTemplate = createUniqueTemplate<
  { diffuse: boolean; specular: boolean },
  { lightCast: string; diffuseColor: string; specularColor: string }
>(({ diffuse, specular }) => ({ lightCast, diffuseColor, specularColor }) => ({
  require: shader`\
vec3 phongLightApply(in ${phongLightType()} lightCast, in vec3 diffuseColor, in vec3 specularColor) {
  float diffuse = ${shaderWhen(diffuse, "1.0", "0.0")};
  float specular = ${shaderWhen(specular, "1.0", "0.0")};

  return
    lightCast.diffuseStrength * lightCast.color * diffuseColor * diffuse +
    lightCast.specularStrength * lightCast.color * specularColor * specular;
}`,

  source: shader`phongLightApply(${lightCast}, ${diffuseColor}, ${specularColor})`,
}));

const phongLightCastTemplate = createUniqueTemplate<
  { variant: PhongLightVariant },
  { light: string; shininess: string; normal: string; eye: string }
>(({ variant }) => ({ light, shininess, normal, eye }) => ({
  require: shader`\
float phongLightDiffuseStrength(in ${resultLightType()} light, in vec3 normal) {
  float lightNormalCosine = dot(normal, light.direction);

  return clamp(lightNormalCosine, 0.0, 1.0);
}

float phongLightSpecularStrength(in ${resultLightType()} light, in float shininess, in vec3 normal, in vec3 eye) {
  float lightNormalCosine = dot(normal, light.direction);
  float lightVisible = sqrt(max(lightNormalCosine, 0.0));

  ${shaderCase(
    variant,
    [
      PhongLightVariant.BlinnPhong, // Blinn-Phong model
      `\
  vec3 cameraLightMidway = normalize(eye + light.direction);

  float lightCosine = max(dot(normal, cameraLightMidway), 0.0);`,
    ],
    [
      PhongLightVariant.Standard, // Phong model
      `\
  vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - light.direction);

  float lightCosine = max(dot(specularReflection, eye), 0.0);`,
    ],
  )}

  return pow(lightCosine, shininess) * lightVisible;
}

${phongLightType()} phongLightCast(in ${resultLightType()} light, in float shininess, in vec3 normal, in vec3 eye) {
  float diffuseStrength = phongLightDiffuseStrength(light, normal);
  float specularStrength = phongLightSpecularStrength(light, shininess, normal, eye);

  return ${phongLightType()}(light.color, diffuseStrength * light.strength, specularStrength * light.strength);
}`,

  source: shader`phongLightCast(${light}, ${shininess}, ${normal}, ${eye})`,
}));

export {
  PhongLightVariant,
  phongLightApplyTemplate,
  phongLightCastTemplate,
  phongLightType,
};
