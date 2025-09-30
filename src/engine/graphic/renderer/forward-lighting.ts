import { Releasable } from "../../io/resource";
import { range } from "../../language/iterable";
import {
  DirectionalLight,
  PointLight,
  directionalLight,
  directionalLightType,
  pointLight,
  pointLightType,
  resultLightType,
} from "../webgl/shaders/light";
import { materialSample, materialType } from "../webgl/shaders/material";
import { Matrix4 } from "../../math/matrix";
import { normalPerturb } from "../webgl/shaders/normal";
import { parallaxPerturb } from "../webgl/shaders/parallax";
import { pbrEnvironment, pbrLight } from "../webgl/shaders/pbr";
import {
  phongLightApply,
  phongLightCast,
  phongLightType,
  PhongLightVariant,
} from "../webgl/shaders/phong";
import { linearToStandard, standardToLinear } from "../webgl/shaders/rgb";
import { Vector3 } from "../../math/vector";
import { GlRuntime, GlTarget, GlTextureFormat, GlTextureType } from "../webgl";
import {
  shaderWhen,
  shaderCase,
  uniform,
  GlShaderSource,
  shaderLoop,
} from "../webgl/shader";
import { GlMaterial, GlMesh, GlPolygon } from "../webgl/model";
import { GlTexture } from "../webgl/texture";
import {
  GlMeshBinder,
  GlMeshFeature,
  GlMeshMatrix,
  GlMeshRendererMode,
  GlMeshScene,
  createGlMeshRenderer,
} from "./gl-mesh";
import { Renderer } from "./definition";

type ForwardLightingConfiguration = {
  lightModel?: ForwardLightingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  lightModelPhysicalNoAmbient?: boolean;
  lightModelPhysicalNoIBL?: boolean;
  maxDirectionalLights?: number;
  maxPointLights?: number;
  noDiffuseMap?: boolean;
  noEmissiveMap?: boolean;
  noHeightMap?: boolean;
  noMetalnessMap?: boolean;
  noNormalMap?: boolean;
  noOcclusionMap?: boolean;
  noRoughnessMap?: boolean;
  noShadow?: boolean;
  noSpecularMap?: boolean;
};

enum ForwardLightingLightModel {
  None,
  Phong,
  Physical,
}

type ShadowDirectionalLight = DirectionalLight & {
  shadowMap: GlTexture;
  shadowView: Matrix4;
};

type EnvironmentLight = {
  brdf: GlTexture;
  diffuse: GlTexture;
  specular: GlTexture;
};

type ForwardLightingRenderer = Releasable &
  Renderer<GlTarget, ForwardLightingScene, ForwardLightingSubject> & {
    // FIXME: debug
    directionalShadowBuffers: GlTexture[];
  };

type ForwardLightingScene = GlMeshScene & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  environmentLight?: EnvironmentLight;
  pointLights?: PointLight[];
  projection: Matrix4;
};

type ForwardLightingSubject = {
  mesh: GlMesh;
  noShadow?: boolean;
};

type LightScene = GlMeshScene & {
  ambientLightColor: Vector3;
  directionalShadowLights: ShadowDirectionalLight[];
  environmentLight?: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
  pointShadowLights: PointLight[]; // FIXME: extend PointLight with extra properties
  projection: Matrix4;
  projectionShadow: Matrix4;
};

type ShadowScene = GlMeshScene & {
  projection: Matrix4;
};

type Directive = {
  hasShadow: boolean;
  lightModel: ForwardLightingLightModel;
  lightModelPhongAmbient: boolean;
  lightModelPhongDiffuse: boolean;
  lightModelPhongSpecular: boolean;
  lightModelPhongVariant: PhongLightVariant;
  lightModelPhysicalAmbient: boolean;
  lightModelPhysicalIBL: boolean;
  maxDirectionalLights: number;
  maxPointLights: number;
};

const createLightSource = (
  directive: Directive,
  feature: GlMeshFeature
): GlShaderSource => {
  const header = `
${directionalLight.declare(directive)}
${pointLight.declare(directive)}

const mat4 texUnitConverter = mat4(
  0.5, 0.0, 0.0, 0.0,
  0.0, 0.5, 0.0, 0.0,
  0.0, 0.0, 0.5, 0.0,
  0.5, 0.5, 0.5, 1.0
);

uniform vec3 ambientLightColor;

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform ${directionalLightType} directionalLights[${Math.max(
    directive.maxDirectionalLights,
    1
  )}];
uniform ${pointLightType} pointLights[max(${Math.max(
    directive.maxPointLights,
    1
  )}, 1)];

// FIXME: adding shadowMap as field to *Light structures doesn't work for some reason
uniform sampler2D directionalLightShadowMaps[${Math.max(
    directive.maxDirectionalLights,
    1
  )}];
uniform sampler2D pointLightShadowMaps[${Math.max(
    directive.maxPointLights,
    1
  )}];
`;

  return {
    vertex: `
${header}

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 shadowProjectionMatrix;
uniform mat4 viewMatrix;

${shaderWhen(feature.hasCoordinate, `in vec2 coordinates;`)}
${shaderWhen(feature.hasNormal, `in vec3 normals;`)}
in vec3 positions;
${shaderWhen(feature.hasTangent, `in vec3 tangents;`)}
${shaderWhen(feature.hasTint, `in vec4 tints;`)}

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coordinate; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space
out vec3 normal; // Normal at point in camera space
out vec3 tangent; // Tangent at point in camera space
out vec4 tint; // Tint at point

out vec3 directionalLightDistances[${Math.max(
      directive.maxDirectionalLights,
      1
    )}];
out vec3 directionalLightShadows[${Math.max(
      directive.maxDirectionalLights,
      1
    )}];

out vec3 pointLightDistances[${Math.max(directive.maxPointLights, 1)}];
out vec3 pointLightShadows[${Math.max(directive.maxPointLights, 1)}];

vec3 toCameraDirection(in vec3 worldDirection) {
  return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
  return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
  vec4 pointWorld = modelMatrix * vec4(positions, 1.0);
  vec4 pointCamera = viewMatrix * pointWorld;

  // Process directional lights
  for (int i = 0; i < ${directive.maxDirectionalLights}; ++i) {
    ${shaderWhen(
      directive.hasShadow,
      `
    if (directionalLights[i].castShadow) {
      vec4 pointShadow = texUnitConverter * shadowProjectionMatrix * directionalLights[i].shadowViewMatrix * pointWorld;

      directionalLightShadows[i] = pointShadow.xyz;
    }`
    )}

    directionalLightDistances[i] = toCameraDirection(directionalLights[i].direction);
  }

  // Process point lights
  for (int i = 0; i < ${directive.maxPointLights}; ++i) {
 ${shaderWhen(
   directive.hasShadow,
   `
    // FIXME: shadow map code`
 )}

    pointLightDistances[i] = toCameraPosition(pointLights[i].position) - pointCamera.xyz;
  }

  coordinate = coordinates;
  tint = ${shaderWhen(feature.hasTint, "tints", "vec4(1.0)")};
  eye = -pointCamera.xyz;
  normal = normalize(normalMatrix * normals);
  tangent = normalize(normalMatrix * tangents);
  bitangent = cross(normal, tangent);

  gl_Position = projectionMatrix * pointCamera;
}`,

    fragment: `
${header}

uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform vec4 emissiveColor;
uniform sampler2D emissiveMap;
uniform vec4 specularColor;
uniform sampler2D specularMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D metalnessMap;
uniform float metalnessStrength;
uniform sampler2D normalMap;
uniform sampler2D occlusionMap;
uniform float occlusionStrength;
uniform sampler2D roughnessMap;
uniform float roughnessStrength;
uniform float shininess;

uniform sampler2D environmentBrdfMap;
uniform samplerCube environmentDiffuseMap;
uniform samplerCube environmentSpecularMap;

${linearToStandard.declare({})}
${standardToLinear.declare({})}
${materialSample.declare({})}
${normalPerturb.declare({})}
${parallaxPerturb.declare({})}

${shaderCase(
  directive.lightModel,
  [
    ForwardLightingLightModel.Phong,
    `
${phongLightApply.declare({
  diffuse: directive.lightModelPhongDiffuse,
  specular: directive.lightModelPhongSpecular,
})}
${phongLightCast.declare({ variant: directive.lightModelPhongVariant })}`,
  ],
  [
    ForwardLightingLightModel.Physical,
    `
${pbrEnvironment.declare({
  environment: directive.lightModelPhysicalIBL,
})}
${pbrLight.declare({})}`,
  ]
)}

in vec3 bitangent;
in vec2 coordinate;
in vec3 eye;
in vec3 normal;
in vec3 tangent;
in vec4 tint;

in vec3 directionalLightDistances[${Math.max(
      directive.maxDirectionalLights,
      1
    )}];
in vec3 directionalLightShadows[${Math.max(directive.maxDirectionalLights, 1)}];

in vec3 pointLightDistances[${Math.max(directive.maxPointLights, 1)}];
in vec3 pointLightShadows[${Math.max(directive.maxPointLights, 1)}];

layout(location=0) out vec4 fragColor;

vec3 getLight(in ${resultLightType} light, in ${materialType} material, in vec3 normal, in vec3 eyeDirection) {
  ${shaderCase(
    directive.lightModel,
    [
      ForwardLightingLightModel.Phong,
      `
  ${phongLightType} phongLight = ${phongLightCast.invoke({
        eye: "eyeDirection",
        light: "light",
        normal: "normal",
        shininess: "material.shininess",
      })};

  return ${phongLightApply.invoke({
    lightCast: "phongLight",
    diffuseColor: "material.diffuseColor.rgb",
    specularColor: "material.specularColor.rgb",
  })};`,
    ],
    [
      ForwardLightingLightModel.Physical,
      `
  return ${pbrLight.invoke({
    eyeDirection: "eyeDirection",
    light: "light",
    material: "material",
    normal: "normal",
  })};
  `,
    ]
  )}
}

void main(void) {
  mat3 tbn = mat3(tangent, bitangent, normal);

  vec3 eyeDirection = normalize(eye);
  vec2 coordinateParallax = ${parallaxPerturb.invoke({
    coordinate: "coordinate",
    eyeDirection: "eyeDirection",
    parallaxScale: "heightParallaxScale",
    parallaxBias: "heightParallaxBias",
    sampler: "heightMap",
    tbn: "tbn",
  })};
  vec3 modifiedNormal = ${normalPerturb.invoke({
    coordinate: "coordinateParallax",
    sampler: "normalMap",
    tbn: "tbn",
  })};

  ${materialType} material = ${materialSample.invoke({
      coordinate: "coordinateParallax",
      diffuseColor: "diffuseColor * tint",
      diffuseMap: "diffuseMap",
      specularColor: "specularColor",
      specularMap: "specularMap",
      metalnessMap: "metalnessMap",
      metalnessStrength: "metalnessStrength",
      roughnessMap: "roughnessMap",
      roughnessStrength: "roughnessStrength",
      shininess: "shininess",
    })};

  // Apply environment (ambient or influence-based) lighting
  vec3 color = ${shaderCase(
    directive.lightModel,
    [
      ForwardLightingLightModel.Phong,
      `material.diffuseColor.rgb * ambientLightColor * ${shaderWhen(
        directive.lightModelPhongAmbient,
        "1.0",
        "0.0"
      )};`,
    ],
    [
      ForwardLightingLightModel.Physical,
      `${pbrEnvironment.invoke({
        environmentBrdfMap: "environmentBrdfMap",
        environmentDiffuseMap: "environmentDiffuseMap",
        environmentSpecularMap: "environmentSpecularMap",
        eyeDirection: "eyeDirection",
        material: "material",
        normal: "normal",
      })} * ambientLightColor * ${shaderWhen(
        directive.lightModelPhysicalAmbient,
        "1.0",
        "0.0"
      )};`,
    ]
  )}

  // Apply components from directional lights
  ${shaderLoop(
    directive.maxDirectionalLights,
    (i) => `
  bool directionalLightApply;

  ${shaderWhen(
    directive.hasShadow,
    `
  float shadowMapSample = texture(directionalLightShadowMaps[${i}], directionalLightShadows[${i}].xy).r;
  directionalLightApply = !directionalLights[${i}].castShadow || shadowMapSample >= directionalLightShadows[${i}].z;`,
    `
  directionalLightApply = true;`
  )}

  if (directionalLightApply) {
    ${resultLightType} directionalLight = ${directionalLight.invoke({
      light: `directionalLights[${i}]`,
      distanceCamera: `directionalLightDistances[${i}]`,
    })};

    color += getLight(directionalLight, material, modifiedNormal, eyeDirection);
  }`
  )}

  // Apply components from point lights
  ${shaderLoop(
    directive.maxPointLights,
    (i) => `
  bool pointLightApply;
  ${shaderWhen(
    directive.hasShadow,
    `
    pointLightApply = true;`, // FIXME: point light shadows not supported yet
    `
    pointLightApply = true;`
  )}

  if (pointLightApply) {
    ${resultLightType} pointLight = ${pointLight.invoke({
      light: `pointLights[${i}]`,
      distanceCamera: `pointLightDistances[${i}]`,
    })};

    color += getLight(pointLight, material, modifiedNormal, eyeDirection);
  }`
  )}

  // Apply occlusion component
  color = mix(color, color * texture(occlusionMap, coordinateParallax).r, occlusionStrength);

  // Apply emissive component
  color += emissiveColor.rgb * ${standardToLinear.invoke({
    standard: "texture(emissiveMap, coordinateParallax).rgb",
  })};

  fragColor = vec4(${linearToStandard.invoke({ linear: "color" })}, 1.0);
}`,
  };
};

const createShadowDirectionalSource = (): GlShaderSource => ({
  vertex: `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 positions;

void main(void) {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * positions;
}`,

  fragment: `
layout(location=0) out vec4 fragColor;

void main(void) {
  fragColor = vec4(1, 1, 1, 1);
}`,
});

const createLightBinder = (
  runtime: GlRuntime,
  directive: Directive,
  configuration: Pick<
    ForwardLightingConfiguration,
    | "noDiffuseMap"
    | "noEmissiveMap"
    | "noHeightMap"
    | "noMetalnessMap"
    | "noNormalMap"
    | "noOcclusionMap"
    | "noRoughnessMap"
    | "noSpecularMap"
  >
): GlMeshBinder<LightScene> => {
  // [forward-lighting-feature]
  return (feature) => {
    const shader = runtime.createShader(createLightSource(directive, feature));

    // Bind geometry attributes
    const polygonBinding = shader.declare<GlPolygon>();

    if (feature.hasCoordinate) {
      polygonBinding.setAttribute(
        "coordinates",
        ({ coordinate }) => coordinate
      );
    }

    if (feature.hasNormal) {
      polygonBinding.setAttribute("normals", ({ normal }) => normal);
    }

    if (feature.hasTangent) {
      polygonBinding.setAttribute("tangents", ({ tangent }) => tangent);
    }

    if (feature.hasTint) {
      polygonBinding.setAttribute("tints", ({ tint }) => tint);
    }

    polygonBinding.setAttribute("positions", ({ position }) => position);

    // Bind matrix uniforms
    const matrixBinding = shader.declare<GlMeshMatrix>();

    matrixBinding.setUniform(
      "modelMatrix",
      uniform.matrix4f(({ model }) => model)
    );
    matrixBinding.setUniform(
      "normalMatrix",
      uniform.matrix3f(({ normal }) => normal)
    );

    // Bind scene uniforms
    const sceneBinding = shader.declare<LightScene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      uniform.matrix4f(({ projection }) => projection)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      uniform.matrix4f(({ view }) => view)
    );

    if (directive.hasShadow) {
      sceneBinding.setUniform(
        "shadowProjectionMatrix",
        uniform.matrix4f(({ projectionShadow }) => projectionShadow)
      );
    }

    // Bind material uniforms
    const materialBinding = shader.declare<GlMaterial>();

    materialBinding.setUniform(
      "diffuseColor",
      uniform.vector4f(({ diffuseColor }) => diffuseColor)
    );
    materialBinding.setUniform(
      "diffuseMap",
      !configuration.noDiffuseMap
        ? uniform.tex2dWhite(({ diffuseMap }) => diffuseMap)
        : uniform.tex2dWhite(() => undefined)
    );

    switch (directive.lightModel) {
      case ForwardLightingLightModel.Phong:
        materialBinding.setUniform(
          "shininess",
          uniform.number(({ shininess }) => shininess)
        );
        materialBinding.setUniform(
          "specularColor",
          uniform.vector4f(({ specularColor }) => specularColor)
        );
        materialBinding.setUniform(
          "specularMap",
          !configuration.noSpecularMap
            ? uniform.tex2dWhite(({ diffuseMap: d, specularMap: s }) => s ?? d)
            : uniform.tex2dWhite(() => undefined)
        );

        break;

      case ForwardLightingLightModel.Physical:
        if (directive.lightModelPhysicalIBL) {
          sceneBinding.setUniform(
            "environmentBrdfMap",
            uniform.tex2dBlack(({ environmentLight }) => environmentLight?.brdf)
          );
          sceneBinding.setUniform(
            "environmentDiffuseMap",
            uniform.tex3d(({ environmentLight }) => environmentLight?.diffuse)
          );
          sceneBinding.setUniform(
            "environmentSpecularMap",
            uniform.tex3d(({ environmentLight }) => environmentLight?.specular)
          );
        }

        materialBinding.setUniform(
          "metalnessMap",
          !configuration.noMetalnessMap
            ? uniform.tex2dBlack(({ metalnessMap }) => metalnessMap)
            : uniform.tex2dBlack(() => undefined)
        );
        materialBinding.setUniform(
          "roughnessMap",
          !configuration.noRoughnessMap
            ? uniform.tex2dBlack(({ roughnessMap }) => roughnessMap)
            : uniform.tex2dBlack(() => undefined)
        );
        materialBinding.setUniform(
          "metalnessStrength",
          uniform.number(({ metalnessStrength }) => metalnessStrength)
        );
        materialBinding.setUniform(
          "roughnessStrength",
          uniform.number(({ roughnessStrength }) => roughnessStrength)
        );

        break;
    }

    materialBinding.setUniform(
      "emissiveMap",
      !configuration.noEmissiveMap
        ? uniform.tex2dBlack(({ emissiveMap }) => emissiveMap)
        : uniform.tex2dBlack(() => undefined)
    );
    materialBinding.setUniform(
      "emissiveColor",
      uniform.vector4f(({ emissiveColor }) => emissiveColor)
    );
    materialBinding.setUniform(
      "heightMap",
      !configuration.noHeightMap
        ? uniform.tex2dBlack(({ heightMap }) => heightMap)
        : uniform.tex2dBlack(() => undefined)
    );
    materialBinding.setUniform(
      "heightParallaxBias",
      uniform.number(({ heightParallaxBias }) => heightParallaxBias)
    );
    materialBinding.setUniform(
      "heightParallaxScale",
      uniform.number(({ heightParallaxScale }) => heightParallaxScale)
    );
    materialBinding.setUniform(
      "normalMap",
      !configuration.noNormalMap
        ? uniform.tex2dNormal(({ normalMap }) => normalMap)
        : uniform.tex2dNormal(() => undefined)
    );
    materialBinding.setUniform(
      "occlusionMap",
      !configuration.noOcclusionMap
        ? uniform.tex2dBlack(({ occlusionMap }) => occlusionMap)
        : uniform.tex2dBlack(() => undefined)
    );
    materialBinding.setUniform(
      "occlusionStrength",
      uniform.number(({ occlusionStrength }) => occlusionStrength)
    );

    // Bind light uniforms
    const defaultColor = Vector3.zero;
    const defaultDirection = { x: 1, y: 0, z: 0 };
    const defaultPosition = Vector3.zero;

    sceneBinding.setUniform(
      "ambientLightColor",
      uniform.vector3f(({ ambientLightColor }) => ambientLightColor)
    );

    for (let i = 0; i < directive.maxDirectionalLights; ++i) {
      const index = i;

      if (directive.hasShadow) {
        sceneBinding.setUniform(
          `directionalLights[${index}].castShadow`,
          uniform.boolean(
            ({ directionalShadowLights }) =>
              index < directionalShadowLights.length &&
              directionalShadowLights[index].shadow
          )
        );
        sceneBinding.setUniform(
          `directionalLights[${index}].shadowViewMatrix`,
          uniform.matrix4f(({ directionalShadowLights }) =>
            index < directionalShadowLights.length
              ? directionalShadowLights[index].shadowView
              : Matrix4.identity
          )
        );
        sceneBinding.setUniform(
          `directionalLightShadowMaps[${index}]`,
          uniform.tex2dBlack(({ directionalShadowLights }) =>
            index < directionalShadowLights.length
              ? directionalShadowLights[index].shadowMap
              : undefined
          )
        );
      }

      sceneBinding.setUniform(
        `directionalLights[${i}].color`,
        uniform.vector3f(({ directionalShadowLights }) =>
          index < directionalShadowLights.length
            ? directionalShadowLights[index].color
            : defaultColor
        )
      );
      sceneBinding.setUniform(
        `directionalLights[${i}].direction`,
        uniform.vector3f(({ directionalShadowLights }) =>
          index < directionalShadowLights.length
            ? directionalShadowLights[index].direction
            : defaultDirection
        )
      );
    }

    for (let i = 0; i < directive.maxPointLights; ++i) {
      const index = i;

      sceneBinding.setUniform(
        `pointLights[${i}].color`,
        uniform.vector3f(({ pointShadowLights }) =>
          index < pointShadowLights.length
            ? pointShadowLights[index].color
            : defaultColor
        )
      );
      sceneBinding.setUniform(
        `pointLights[${i}].position`,
        uniform.vector3f(({ pointShadowLights }) =>
          index < pointShadowLights.length
            ? pointShadowLights[index].position
            : defaultPosition
        )
      );
      sceneBinding.setUniform(
        `pointLights[${i}].radius`,
        uniform.number(({ pointShadowLights }) =>
          index < pointShadowLights.length ? pointShadowLights[index].radius : 0
        )
      );
    }

    return {
      release: shader.release,
      material: materialBinding,
      matrix: matrixBinding,
      polygon: polygonBinding,
      scene: sceneBinding,
    };
  };
};

const createDirectionalShadowBinder = (
  runtime: GlRuntime
): GlMeshBinder<ShadowScene> => {
  return () => {
    const shader = runtime.createShader(createShadowDirectionalSource());

    const polygonBinding = shader.declare<GlPolygon>();

    polygonBinding.setAttribute("positions", ({ position }) => position);

    const matrixBinding = shader.declare<GlMeshMatrix>();

    matrixBinding.setUniform(
      "modelMatrix",
      uniform.matrix4f(({ model }) => model)
    );

    const sceneBinding = shader.declare<ShadowScene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      uniform.matrix4f(({ projection }) => projection)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      uniform.matrix4f(({ view }) => view)
    );

    const materialBinding = shader.declare<GlMaterial>();

    return {
      release: shader.release,
      material: materialBinding,
      matrix: matrixBinding,
      polygon: polygonBinding,
      scene: sceneBinding,
    };
  };
};

const createForwardLightingRenderer = (
  runtime: GlRuntime,
  configuration: ForwardLightingConfiguration
): ForwardLightingRenderer => {
  const gl = runtime.context;
  const targetSize = { x: 1024, y: 1024 };

  const directive: Directive = {
    hasShadow: !configuration.noShadow,
    lightModel: configuration.lightModel ?? ForwardLightingLightModel.Phong,
    lightModelPhongAmbient: !configuration.lightModelPhongNoAmbient,
    lightModelPhongDiffuse: !configuration.lightModelPhongNoDiffuse,
    lightModelPhongSpecular: !configuration.lightModelPhongNoSpecular,
    lightModelPhongVariant: PhongLightVariant.Standard,
    lightModelPhysicalAmbient: !configuration.lightModelPhysicalNoAmbient,
    lightModelPhysicalIBL: !configuration.lightModelPhysicalNoIBL,
    maxDirectionalLights: configuration.maxDirectionalLights ?? 4,
    maxPointLights: configuration.maxPointLights ?? 4,
  };

  const directionalShadowTargets = range(directive.maxDirectionalLights).map(
    () => new GlTarget(gl, targetSize)
  );
  const lightBinder = createLightBinder(runtime, directive, configuration);
  const lightRenderer = createGlMeshRenderer(
    GlMeshRendererMode.Triangle,
    lightBinder
  );

  const directionalShadowBuffers = directionalShadowTargets.map((target) =>
    target.setupDepthTexture(GlTextureFormat.Depth16, GlTextureType.Quad)
  );
  const directionalShadowBinder = createDirectionalShadowBinder(runtime);
  const directionalShadowRenderer = createGlMeshRenderer(
    GlMeshRendererMode.Triangle,
    directionalShadowBinder
  );
  const directionalShadowProjection = Matrix4.fromIdentity([
    "setFromOrthographic",
    -10,
    10,
    -10,
    10,
    -10,
    20,
  ]);
  const shadowDirection = Vector3.fromZero();

  return {
    // FIXME: debug
    directionalShadowBuffers,

    release: () => {
      directionalShadowRenderer.release();
      lightRenderer.release();
    },

    append: (subject) => {
      const { mesh, noShadow } = subject;

      const shadowResource =
        noShadow !== true ? directionalShadowRenderer.append(mesh) : undefined;
      const lightResource = lightRenderer.append(mesh);

      return () => {
        shadowResource?.();
        lightResource();
      };
    },

    render: (target, scene) => {
      const {
        ambientLightColor,
        directionalLights,
        environmentLight,
        pointLights,
        projection,
        view,
      } = scene;

      gl.colorMask(false, false, false, false);
      gl.disable(gl.BLEND);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      // Create shadow maps for directional lights
      const directionalShadowLights = [];

      if (directionalLights !== undefined) {
        const nbDirectionalLights = Math.min(
          directionalLights.length,
          directive.maxDirectionalLights
        );

        for (let i = 0; i < nbDirectionalLights; ++i) {
          const light = directionalLights[i];

          shadowDirection.setFromXYZ(
            -light.direction.x,
            -light.direction.y,
            -light.direction.z
          );

          const directionalShadowView = Matrix4.fromSource(
            Matrix4.identity,
            ["translate", { x: 0, y: 0, z: -10 }],
            [
              "multiply",
              Matrix4.fromIdentity([
                "setFromDirection",
                shadowDirection,
                { x: 0, y: 1, z: 0 },
              ]),
            ]
          );

          const directionalShadowTarget = directionalShadowTargets[i];

          directionalShadowTarget.clear(0);

          directionalShadowRenderer.render(directionalShadowTarget, {
            projection: directionalShadowProjection,
            view: directionalShadowView,
          });

          directionalShadowLights.push({
            color: light.color,
            direction: light.direction,
            shadow: light.shadow,
            shadowMap: directionalShadowBuffers[i],
            shadowView: directionalShadowView,
          });
        }
      }

      // Draw scene
      gl.colorMask(true, true, true, true);
      gl.cullFace(gl.BACK);

      lightRenderer.render(target, {
        ambientLightColor: ambientLightColor ?? Vector3.zero,
        directionalShadowLights,
        environmentLight,
        pointShadowLights: pointLights ?? [],
        projection,
        projectionShadow: directionalShadowProjection,
        view,
      });
    },

    resize: () => {},
  };
};

export {
  type ForwardLightingConfiguration,
  type ForwardLightingRenderer,
  type ForwardLightingScene,
  type ForwardLightingSubject,
  ForwardLightingLightModel,
  createForwardLightingRenderer,
};
