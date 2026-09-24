import { Vector3 } from "../../../math/vector";
import {
  shaderWhen,
  createSingletonFunction,
  createUniqueFunctionTemplate,
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
const directionalLightTypeTemplate = createUniqueFunctionTemplate<
  [{ hasShadow: boolean }],
  []
>((unique, { hasShadow }) => () => ({
  require: shader`\
struct ${directionalLightTypeName}_${unique} {
  vec3 color;
  vec3 direction;
${shaderWhen(
  hasShadow,
  `\
  bool castShadow;
  mat4 shadowViewMatrix;`,
)}
};`,

  source: shader`${directionalLightTypeName}_${unique}`,
}));

const pointLightTypeName = "PointLight";
const pointLightTypeTemplate = createUniqueFunctionTemplate<
  [{ hasShadow: boolean }],
  []
>((unique, { hasShadow }) => () => ({
  require: shader`\
struct ${pointLightTypeName}_${unique} {
  vec3 color;
  vec3 position;
  float radius;
${shaderWhen(
  hasShadow,
  `\
  bool castShadow;`,
)}
};`,
  source: shader`${pointLightTypeName}_${unique}`,
}));

const resultLightTypeName = "ResultLight";
const resultLightType = createSingletonFunction<[]>(
  shader`\
struct ${resultLightTypeName} {
  vec3 color;
  vec3 direction;
  float strength;
};`,
  () => resultLightTypeName,
);

const directionalLightCreateTemplate = createUniqueFunctionTemplate<
  [{ hasShadow: boolean }],
  [{ light: string; distanceCamera: string }]
>((unique, { hasShadow }) => {
  const directionalLightType = directionalLightTypeTemplate({ hasShadow });

  return ({ light, distanceCamera }) => ({
    require: shader`\
${resultLightType()} lightSourceDirectional_${unique}(in ${directionalLightType()} light, in vec3 distanceCamera) {
  return ${resultLightType()}(
    light.color,
    normalize(distanceCamera),
    1.0
  );
}`,
    source: shader`lightSourceDirectional_${unique}(${light}, ${distanceCamera})`,
  });
});

const pointLightCreateTemplate = createUniqueFunctionTemplate<
  [{ hasShadow: boolean }],
  [{ light: string; distanceCamera: string }]
>((unique, { hasShadow }) => {
  const pointLightType = pointLightTypeTemplate({ hasShadow });

  return ({ light, distanceCamera }) => ({
    require: shader`\
${resultLightType()} lightSourcePoint_${unique}(in ${pointLightType()} light, in vec3 distanceCamera) {
  return ${resultLightType()}(
    light.color,
    normalize(distanceCamera),
    max(1.0 - length(distanceCamera) / light.radius, 0.0)
  );
}`,
    source: shader`lightSourcePoint_${unique}(${light}, ${distanceCamera})`,
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
