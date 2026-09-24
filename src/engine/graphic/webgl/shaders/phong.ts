import { resultLightType } from "./light";
import {
  shaderWhen,
  shaderCase,
  createSingletonFunction,
  createUniqueFunctionTemplate,
  shader,
} from "../shader";

const enum PhongLightVariant {
  Standard,
  BlinnPhong,
}

const phongLightTypeName = "PhongLight";
const phongLightType = createSingletonFunction<[]>(
  shader`\
struct ${phongLightTypeName} {
  vec3 color;
  float diffuseStrength;
  float specularStrength;
};`,
  () => phongLightTypeName,
);

const phongLightApplyTemplate = createUniqueFunctionTemplate<
  [{ diffuse: boolean; specular: boolean }],
  [{ lightCast: string; diffuseColor: string; specularColor: string }]
>(
  (unique, { diffuse, specular }) =>
    ({ lightCast, diffuseColor, specularColor }) => ({
      require: shader`\
vec3 phongLightApply_${unique}(in ${phongLightType()} lightCast, in vec3 diffuseColor, in vec3 specularColor) {
  float diffuse = ${shaderWhen(diffuse, "1.0", "0.0")};
  float specular = ${shaderWhen(specular, "1.0", "0.0")};

  return
    lightCast.diffuseStrength * lightCast.color * diffuseColor * diffuse +
    lightCast.specularStrength * lightCast.color * specularColor * specular;
}`,

      source: shader`phongLightApply_${unique}(${lightCast}, ${diffuseColor}, ${specularColor})`,
    }),
);

const phongLightCastTemplate = createUniqueFunctionTemplate<
  [{ variant: PhongLightVariant }],
  [{ light: string; shininess: string; normal: string; eye: string }]
>((unique, { variant }) => ({ light, shininess, normal, eye }) => ({
  require: shader`\
float phongLightDiffuseStrength_${unique}(in ${resultLightType()} light, in vec3 normal) {
  float lightNormalCosine = dot(normal, light.direction);

  return clamp(lightNormalCosine, 0.0, 1.0);
}

float phongLightSpecularStrength_${unique}(in ${resultLightType()} light, in float shininess, in vec3 normal, in vec3 eye) {
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

${phongLightType()} phongLightCast_${unique}(in ${resultLightType()} light, in float shininess, in vec3 normal, in vec3 eye) {
  float diffuseStrength = phongLightDiffuseStrength_${unique}(light, normal);
  float specularStrength = phongLightSpecularStrength_${unique}(light, shininess, normal, eye);

  return ${phongLightType()}(light.color, diffuseStrength * light.strength, specularStrength * light.strength);
}`,

  source: shader`phongLightCast_${unique}(${light}, ${shininess}, ${normal}, ${eye})`,
}));

export {
  PhongLightVariant,
  phongLightApplyTemplate,
  phongLightCastTemplate,
  phongLightType,
};
