import { GlShaderFunction } from "../language";
import { resultLightType } from "./light";

const phongLight: GlShaderFunction<
  [string, string],
  [string, string, string, string, string, string]
> = {
  declare: (diffuseDirective: string, specularDirective: string): string => `
  float phongLightDiffusePower(in ${resultLightType} light, in vec3 normal) {
    float lightNormalCosine = dot(normal, light.direction);
  
    return clamp(lightNormalCosine, 0.0, 1.0);
  }
  
  float phongLightSpecularPower(in ${resultLightType} light, in float materialGlossiness, in float materialShininess, in vec3 normal, in vec3 eyeDirection) {
    float lightNormalCosine = dot(normal, light.direction);
    float lightVisible = sqrt(max(lightNormalCosine, 0.0));
  
    #ifdef LIGHT_MODEL_PHONG_STANDARD
      // Phong model
      vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - light.direction);
  
      float lightCosine = max(dot(specularReflection, eyeDirection), 0.0);
    #else
      // Blinn-Phong model
      vec3 cameraLightMidway = normalize(eyeDirection + light.direction);
  
      float lightCosine = max(dot(normal, cameraLightMidway), 0.0);
    #endif
  
    return materialGlossiness * pow(lightCosine, materialShininess) * lightVisible;
  }
  
  vec3 phongLight(in ${resultLightType} light, in vec3 materialAlbedo, in float materialGlossiness, in float materialShininess, in vec3 normal, in vec3 eyeDirection) {
    return light.power * (
      phongLightDiffusePower(light, normal) * light.color * materialAlbedo * float(${diffuseDirective}) +
      phongLightSpecularPower(light, materialGlossiness, materialShininess, normal, eyeDirection) * light.color * float(${specularDirective})
    );
  }`,

  invoke: (
    light: string,
    materialAlbedo: string,
    materialGloss: string,
    materialShininess: string,
    normal: string,
    eyeDirection: string
  ): string =>
    `phongLight(${light}, ${materialAlbedo}, ${materialGloss}, ${materialShininess}, ${normal}, ${eyeDirection})`,
};

// FIXME: direct access hack, should be declared
const phoneLightInvokeDiffusePower = (light: string, normal: string): string =>
  `phongLightDiffusePower(${light}, ${normal})`;

// FIXME: direct access hack, should be declared
const phoneLightInvokeSpecularPower = (
  light: string,
  materialGloss: string,
  materialShininess: string,
  normal: string,
  eyeDirection: string
): string =>
  `phongLightSpecularPower(${light}, ${materialGloss}, ${materialShininess}, ${normal}, ${eyeDirection})`;

export {
  phongLight,
  phoneLightInvokeDiffusePower,
  phoneLightInvokeSpecularPower,
};
