import { Vector3 } from "../../../math/vector";
import { GlShaderFunction } from "../language";

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

const directionalLight: GlShaderFunction<[string], [string, string]> = {
  declare: (hasShadow: string) => `
struct ${directionalLightType} {
  vec3 color;
  vec3 direction;
#ifdef ${hasShadow}
  bool castShadow;
  mat4 shadowViewMatrix;
#endif
};

#ifndef LIGHT_RESULT_TYPE
#define LIGHT_RESULT_TYPE
struct ${resultLightType} {
  vec3 color;
  vec3 direction;
  float strength;
};
#endif

${resultLightType} lightSourceDirectional(in ${directionalLightType} light, in vec3 distanceCamera) {
  return ${resultLightType}(
    light.color,
    normalize(distanceCamera),
    1.0
  );
}`,

  invoke: (light: string, distanceCamera: string) =>
    `lightSourceDirectional(${light}, ${distanceCamera})`,
};

const pointLight: GlShaderFunction<[string], [string, string]> = {
  declare: () => `
struct ${pointLightType} {
  vec3 color;
  vec3 position;
  float radius;
};

#ifndef LIGHT_RESULT_TYPE
#define LIGHT_RESULT_TYPE
struct ${resultLightType} {
  vec3 color;
  vec3 direction;
  float strength;
};
#endif

${resultLightType} lightSourcePoint(in ${pointLightType} light, in vec3 distanceCamera) {
  return ${resultLightType}(
    light.color,
    normalize(distanceCamera),
    max(1.0 - length(distanceCamera) / light.radius, 0.0)
  );
}`,

  invoke: (light: string, distanceCamera: string): string =>
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
