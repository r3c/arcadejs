import { Vector3 } from "../../../math/vector";
import { shaderCondition, GlShaderFunction } from "../shader";

type DirectionalLight = {
  color: Vector3;
  direction: Vector3;
  shadow: boolean;
};

type PointLight = {
  color: Vector3;
  position: Vector3;
  radius: number;
};

const directionalLightType = "DirectionalLight";
const pointLightType = "PointLight";
const resultLightType = "ResultLight";

const resultLightTableDeclare = `
#ifndef LIGHT_RESULT_TYPE
#define LIGHT_RESULT_TYPE
struct ${resultLightType} {
  vec3 color;
  vec3 direction;
  float strength;
};
#endif`;

const directionalLight: GlShaderFunction<
  { hasShadow: boolean },
  { light: string; distanceCamera: string }
> = {
  declare: ({ hasShadow }) => `
struct ${directionalLightType} {
  vec3 color;
  vec3 direction;
${shaderCondition(
  hasShadow,
  `
  bool castShadow;
  mat4 shadowViewMatrix;`
)}
};

${resultLightTableDeclare}

${resultLightType} lightSourceDirectional(in ${directionalLightType} light, in vec3 distanceCamera) {
  return ${resultLightType}(
    light.color,
    normalize(distanceCamera),
    1.0
  );
}`,

  invoke: ({ light, distanceCamera }) =>
    `lightSourceDirectional(${light}, ${distanceCamera})`,
};

const pointLight: GlShaderFunction<
  { hasShadow: boolean },
  { light: string; distanceCamera: string }
> = {
  declare: () => `
struct ${pointLightType} {
  vec3 color;
  vec3 position;
  float radius;
};

${resultLightTableDeclare}

${resultLightType} lightSourcePoint(in ${pointLightType} light, in vec3 distanceCamera) {
  return ${resultLightType}(
    light.color,
    normalize(distanceCamera),
    max(1.0 - length(distanceCamera) / light.radius, 0.0)
  );
}`,

  invoke: ({ light, distanceCamera }) =>
    `lightSourcePoint(${light}, ${distanceCamera})`,
};

export {
  type DirectionalLight,
  type PointLight,
  directionalLight,
  directionalLightType,
  pointLight,
  pointLightType,
  resultLightType,
};
