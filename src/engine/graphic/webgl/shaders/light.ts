import { Vector3 } from "../../../math/vector";
import {
  shaderWhen,
  createSingletonFunction,
  createUniqueTemplate,
  shader,
} from "../shader";

type DirectionalLight = {
  color: Vector3;
  direction: Vector3;
  shadow: boolean;
};

type PointLight = {
  color: Vector3;
  position: Vector3;
  radius: number;
  shadow: boolean;
};

const directionalLightTypeName = "DirectionalLight";
const directionalLightTypeTemplate = createUniqueTemplate<
  { hasShadow: boolean },
  void
>(({ hasShadow }) => () => ({
  require: shader`\
struct ${directionalLightTypeName} {
  vec3 color;
  vec3 direction;
${shaderWhen(
  hasShadow,
  `\
  bool castShadow;
  mat4 shadowViewMatrix;`,
)}
};`,

  source: shader`${directionalLightTypeName}`,
}));

const pointLightTypeName = "PointLight";
const pointLightTypeTemplate = createUniqueTemplate<
  { hasShadow: boolean },
  void
>(({ hasShadow }) => () => ({
  require: shader`\
  struct ${pointLightTypeName} {
  vec3 color;
  vec3 position;
  float radius;
${shaderWhen(
  hasShadow,
  `\
  bool castShadow;`,
)}
};`,
  source: shader`${pointLightTypeName}`,
}));

const resultLightTypeName = "ResultLight";
const resultLightType = createSingletonFunction<void>(
  shader`\
struct ${resultLightTypeName} {
  vec3 color;
  vec3 direction;
  float strength;
};`,
  () => resultLightTypeName,
);

const directionalLightCreateTemplate = createUniqueTemplate<
  { hasShadow: boolean },
  { light: string; distanceCamera: string }
>((declare) => {
  const directionalLightType = directionalLightTypeTemplate(declare);

  return ({ light, distanceCamera }) => ({
    require: shader`\
${resultLightType()} lightSourceDirectional(in ${directionalLightType()} light, in vec3 distanceCamera) {
  return ${resultLightType()}(
    light.color,
    normalize(distanceCamera),
    1.0
  );
}`,
    source: shader`lightSourceDirectional(${light}, ${distanceCamera})`,
  });
});

const pointLightCreateTemplate = createUniqueTemplate<
  { hasShadow: boolean },
  { light: string; distanceCamera: string }
>((declare) => {
  const pointLightType = pointLightTypeTemplate(declare);

  return ({ light, distanceCamera }) => ({
    require: shader`\
${resultLightType()} lightSourcePoint(in ${pointLightType()} light, in vec3 distanceCamera) {
  return ${resultLightType()}(
    light.color,
    normalize(distanceCamera),
    max(1.0 - length(distanceCamera) / light.radius, 0.0)
  );
}`,
    source: shader`lightSourcePoint(${light}, ${distanceCamera})`,
  });
});

export {
  type DirectionalLight,
  type PointLight,
  directionalLightCreateTemplate,
  directionalLightTypeTemplate,
  pointLightCreateTemplate,
  pointLightTypeTemplate,
  resultLightType,
};
