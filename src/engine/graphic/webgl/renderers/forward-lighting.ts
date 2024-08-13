import { range } from "../../../language/iterable";
import {
  DirectionalLight,
  PointLight,
  directionalLight,
  directionalLightType,
  pointLight,
  pointLightType,
  resultLightType,
} from "../shaders/light";
import { materialSample, materialType } from "../shaders/material";
import { ObjectScene, createObjectPainter } from "../painters/object";
import { Matrix4 } from "../../../math/matrix";
import { normalPerturb } from "../shaders/normal";
import { parallaxPerturb } from "../shaders/parallax";
import { pbrEnvironment, pbrLight } from "../shaders/pbr";
import {
  phongLightApply,
  phongLightCast,
  phongLightType,
} from "../shaders/phong";
import { linearToStandard, standardToLinear } from "../shaders/rgb";
import { Vector2, Vector3 } from "../../../math/vector";
import {
  GlGeometry,
  GlPainter,
  GlRuntime,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
} from "../../webgl";
import {
  GlShader,
  GlShaderDirectives,
  shaderDirective,
  shaderUniform,
} from "../shader";
import { Renderer } from "../../display";
import { GlMaterial, GlObject, GlPolygon } from "../model";
import { GlTexture } from "../texture";

type ForwardLightingConfiguration = {
  maxDirectionalLights?: number;
  maxPointLights?: number;
  lightModel?: ForwardLightingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  lightModelPhysicalNoAmbient?: boolean;
  lightModelPhysicalNoIBL?: boolean;
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

type ForwardLightingObject = GlObject & {
  noShadow?: boolean;
};

type ShadowDirectionalLight = DirectionalLight & {
  shadowMap: GlTexture;
  shadowViewMatrix: Matrix4;
};

type EnvironmentLight = {
  brdf: GlTexture;
  diffuse: GlTexture;
  specular: GlTexture;
};

type ForwardLightingScene = {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  environmentLight?: EnvironmentLight;
  objects: Iterable<ForwardLightingObject>;
  pointLights?: PointLight[];
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type LightScene = {
  ambientLightColor: Vector3;
  directionalShadowLights: ShadowDirectionalLight[];
  environmentLight?: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
  objects: Iterable<GlObject>;
  pointShadowLights: PointLight[]; // FIXME: extend PointLight with extra properties
  projectionMatrix: Matrix4;
  projectionShadowMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type ShadowScene = ObjectScene & {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const lightHeaderShader = (
  maxDirectionalLights: number,
  maxPointLights: number
) => `
${directionalLight.declare("HAS_SHADOW")}
${pointLight.declare("HAS_SHADOW")}

const mat4 texUnitConverter = mat4(
  0.5, 0.0, 0.0, 0.0,
  0.0, 0.5, 0.0, 0.0,
  0.0, 0.0, 0.5, 0.0,
  0.5, 0.5, 0.5, 1.0
);

uniform vec3 ambientLightColor;

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform ${directionalLightType} directionalLights[${Math.max(
  maxDirectionalLights,
  1
)}];
uniform ${pointLightType} pointLights[max(${Math.max(maxPointLights, 1)}, 1)];

// FIXME: adding shadowMap as field to *Light structures doesn't work for some reason
uniform sampler2D directionalLightShadowMaps[${Math.max(
  maxDirectionalLights,
  1
)}];
uniform sampler2D pointLightShadowMaps[${Math.max(maxPointLights, 1)}];
`;

const lightVertexShader = (
  maxDirectionalLights: number,
  maxPointLights: number
) => `
${lightHeaderShader(maxDirectionalLights, maxPointLights)}

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 shadowProjectionMatrix;
uniform mat4 viewMatrix;

in vec2 coordinate;
in vec3 normals;
in vec3 position;
in vec3 tangents;

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space
out vec3 normal; // Normal at point in camera space
out vec3 tangent; // Tangent at point in camera space

out vec3 directionalLightDistances[${Math.max(maxDirectionalLights, 1)}];
out vec3 directionalLightShadows[${Math.max(maxDirectionalLights, 1)}];

out vec3 pointLightDistances[${Math.max(maxPointLights, 1)}];
out vec3 pointLightShadows[${Math.max(maxPointLights, 1)}];

vec3 toCameraDirection(in vec3 worldDirection) {
  return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
  return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
  vec4 pointWorld = modelMatrix * vec4(position, 1.0);
  vec4 pointCamera = viewMatrix * pointWorld;

  // Process directional lights
  for (int i = 0; i < ${maxDirectionalLights}; ++i) {
    #ifdef HAS_SHADOW
      if (directionalLights[i].castShadow) {
        vec4 pointShadow = texUnitConverter * shadowProjectionMatrix * directionalLights[i].shadowViewMatrix * pointWorld;

        directionalLightShadows[i] = pointShadow.xyz;
      }
    #endif

    directionalLightDistances[i] = toCameraDirection(directionalLights[i].direction);
  }

  // Process point lights
  for (int i = 0; i < ${maxPointLights}; ++i) {
    #ifdef HAS_SHADOW
      // FIXME: shadow map code
    #endif

    pointLightDistances[i] = toCameraPosition(pointLights[i].position) - pointCamera.xyz;
  }

  coord = coordinate;
  eye = -pointCamera.xyz;
  normal = normalize(normalMatrix * normals);
  tangent = normalize(normalMatrix * tangents);
  bitangent = cross(normal, tangent);

  gl_Position = projectionMatrix * pointCamera;
}`;

const lightFragmentShader = (
  maxDirectionalLights: number,
  maxPointLights: number
) => `
${lightHeaderShader(maxDirectionalLights, maxPointLights)}

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

${linearToStandard.declare()}
${standardToLinear.declare()}
${materialSample.declare()}
${normalPerturb.declare()}
${parallaxPerturb.declare()}

#if LIGHT_MODEL == ${ForwardLightingLightModel.Phong}
${phongLightApply.declare(
  "LIGHT_MODEL_PHONG_DIFFUSE",
  "LIGHT_MODEL_PHONG_SPECULAR"
)}
${phongLightCast.declare()}
#elif LIGHT_MODEL == ${ForwardLightingLightModel.Physical}
${pbrEnvironment.declare("LIGHT_MODEL_PBR_IBL")}
${pbrLight.declare()}
#endif

in vec3 bitangent;
in vec2 coord;
in vec3 eye;
in vec3 normal;
in vec3 tangent;

in vec3 directionalLightDistances[${Math.max(maxDirectionalLights, 1)}];
in vec3 directionalLightShadows[${Math.max(maxDirectionalLights, 1)}];

in vec3 pointLightDistances[${Math.max(maxPointLights, 1)}];
in vec3 pointLightShadows[${Math.max(maxPointLights, 1)}];

layout(location=0) out vec4 fragColor;

vec3 getLight(in ${resultLightType} light, in ${materialType} material, in vec3 normal, in vec3 eyeDirection) {
  #if LIGHT_MODEL == ${ForwardLightingLightModel.Phong}
    ${phongLightType} phongLight = ${phongLightCast.invoke(
  "light",
  "material.shininess",
  "normal",
  "eyeDirection"
)};

    return ${phongLightApply.invoke(
      "phongLight",
      "material.diffuseColor.rgb",
      "material.specularColor.rgb"
    )};
  #elif LIGHT_MODEL == ${ForwardLightingLightModel.Physical}
    return ${pbrLight.invoke("light", "material", "normal", "eyeDirection")};
  #endif
}

void main(void) {
  mat3 tbn = mat3(tangent, bitangent, normal);

  vec3 eyeDirection = normalize(eye);
  vec2 coordParallax = ${parallaxPerturb.invoke(
    "heightMap",
    "coord",
    "eyeDirection",
    "heightParallaxScale",
    "heightParallaxBias",
    "tbn"
  )};
  vec3 modifiedNormal = ${normalPerturb.invoke(
    "normalMap",
    "coordParallax",
    "tbn"
  )};

  ${materialType} material = ${materialSample.invoke(
  "diffuseColor",
  "diffuseMap",
  "specularColor",
  "specularMap",
  "metalnessMap",
  "metalnessStrength",
  "roughnessMap",
  "roughnessStrength",
  "shininess",
  "coordParallax"
)};

  // Apply environment (ambient or influence-based) lighting
  #if LIGHT_MODEL == ${ForwardLightingLightModel.Phong}
  vec3 color = material.diffuseColor.rgb * ambientLightColor * float(LIGHT_AMBIENT);
  #elif LIGHT_MODEL == ${ForwardLightingLightModel.Physical}
  vec3 color = ${pbrEnvironment.invoke(
    "environmentBrdfMap",
    "environmentDiffuseMap",
    "environmentSpecularMap",
    "material",
    "normal",
    "eyeDirection"
  )} * ambientLightColor * float(LIGHT_AMBIENT);
  #endif

  // Apply components from directional lights
  ${range(maxDirectionalLights)
    .map(
      (i) => `
  #ifdef HAS_SHADOW
  float shadowMapSample${i} = texture(directionalLightShadowMaps[${i}], directionalLightShadows[${i}].xy).r;

  if (!directionalLights[${i}].castShadow || shadowMapSample${i} >= directionalLightShadows[${i}].z) {
  #endif

    ${resultLightType} directionalLight${i} = ${directionalLight.invoke(
        `directionalLights[${i}]`,
        `directionalLightDistances[${i}]`
      )};

    color += getLight(directionalLight${i}, material, modifiedNormal, eyeDirection);

  #ifdef HAS_SHADOW
  }
  #endif`
    )
    .join("\n")}

  // Apply components from point lights
  ${range(maxPointLights)
    .map(
      (i) => `
  #ifdef HAS_SHADOW
  if (true) { // FIXME
  #endif

    ${resultLightType} pointLight${i} = ${pointLight.invoke(
        `pointLights[${i}]`,
        `pointLightDistances[${i}]`
      )};

    color += getLight(pointLight${i}, material, modifiedNormal, eyeDirection);

  #ifdef HAS_SHADOW
  }
  #endif`
    )
    .join("\n")}

  // Apply occlusion component
  color = mix(color, color * texture(occlusionMap, coordParallax).r, occlusionStrength);

  // Apply emissive component
  color += emissiveColor.rgb * ${standardToLinear.invoke(
    "texture(emissiveMap, coordParallax).rgb"
  )};

  fragColor = vec4(${linearToStandard.invoke("color")}, 1.0);
}`;

const shadowDirectionalVertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 position;

void main(void) {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * position;
}`;

const shadowDirectionalFragmentShader = `
layout(location=0) out vec4 fragColor;

void main(void) {
  fragColor = vec4(1, 1, 1, 1);
}`;

const createLightShader = (
  runtime: GlRuntime,
  configuration: Required<ForwardLightingConfiguration>
): GlShader => {
  const directives: GlShaderDirectives = {
    ["LIGHT_MODEL"]: shaderDirective.number(configuration.lightModel),
  };

  switch (configuration.lightModel) {
    case ForwardLightingLightModel.Phong:
      directives["LIGHT_AMBIENT"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoAmbient
      );
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoSpecular
      );

      break;

    case ForwardLightingLightModel.Physical:
      if (!configuration.lightModelPhysicalNoIBL) {
        directives["LIGHT_MODEL_PBR_IBL"] = shaderDirective.number(1);
      }

      directives["LIGHT_AMBIENT"] = shaderDirective.boolean(
        !configuration.lightModelPhysicalNoAmbient
      );

      break;
  }

  if (!configuration.noShadow) {
    directives["HAS_SHADOW"] = shaderDirective.number(1);
  }

  return runtime.createShader(
    lightVertexShader(
      configuration.maxDirectionalLights,
      configuration.maxPointLights
    ),
    lightFragmentShader(
      configuration.maxDirectionalLights,
      configuration.maxPointLights
    ),
    directives
  );
};

const createLightPainter = (
  shader: GlShader,
  configuration: Required<ForwardLightingConfiguration>
): GlPainter<LightScene> => {
  // Bind geometry attributes
  const polygonBinding = shader.declare<GlPolygon>();

  polygonBinding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  polygonBinding.setAttribute("normals", ({ normal }) => normal); // FIXME: remove plural
  polygonBinding.setAttribute("position", ({ position }) => position);
  polygonBinding.setAttribute("tangents", ({ tangent }) => tangent);

  // Bind matrix uniforms
  const geometryBinding = shader.declare<GlGeometry>();

  geometryBinding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );
  geometryBinding.setUniform(
    "normalMatrix",
    shaderUniform.matrix3f(({ normalMatrix }) => normalMatrix)
  );

  const sceneBinding = shader.declare<LightScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  if (!configuration.noShadow) {
    sceneBinding.setUniform(
      "shadowProjectionMatrix",
      shaderUniform.matrix4f(
        ({ projectionShadowMatrix: shadowProjectionMatrix }) =>
          shadowProjectionMatrix
      )
    );
  }

  // Bind material uniforms
  const materialBinding = shader.declare<GlMaterial>();

  materialBinding.setUniform(
    "diffuseColor",
    shaderUniform.vector4f(({ diffuseColor }) => diffuseColor)
  );
  materialBinding.setUniform(
    "diffuseMap",
    !configuration.noDiffuseMap
      ? shaderUniform.tex2dWhite(({ diffuseMap }) => diffuseMap)
      : shaderUniform.tex2dWhite(() => undefined)
  );

  switch (configuration.lightModel) {
    case ForwardLightingLightModel.Phong:
      materialBinding.setUniform(
        "shininess",
        shaderUniform.number(({ shininess }) => shininess)
      );
      materialBinding.setUniform(
        "specularColor",
        shaderUniform.vector4f(({ specularColor }) => specularColor)
      );
      materialBinding.setUniform(
        "specularMap",
        !configuration.noSpecularMap
          ? shaderUniform.tex2dWhite(
              ({ diffuseMap: d, specularMap: s }) => s ?? d
            )
          : shaderUniform.tex2dWhite(() => undefined)
      );

      break;

    case ForwardLightingLightModel.Physical:
      if (!configuration.lightModelPhysicalNoIBL) {
        sceneBinding.setUniform(
          "environmentBrdfMap",
          shaderUniform.tex2dBlack(
            ({ environmentLight }) => environmentLight?.brdf
          )
        );
        sceneBinding.setUniform(
          "environmentDiffuseMap",
          shaderUniform.tex3d(
            ({ environmentLight }) => environmentLight?.diffuse
          )
        );
        sceneBinding.setUniform(
          "environmentSpecularMap",
          shaderUniform.tex3d(
            ({ environmentLight }) => environmentLight?.specular
          )
        );
      }

      materialBinding.setUniform(
        "metalnessMap",
        !configuration.noMetalnessMap
          ? shaderUniform.tex2dBlack(({ metalnessMap }) => metalnessMap)
          : shaderUniform.tex2dBlack(() => undefined)
      );
      materialBinding.setUniform(
        "roughnessMap",
        !configuration.noRoughnessMap
          ? shaderUniform.tex2dBlack(({ roughnessMap }) => roughnessMap)
          : shaderUniform.tex2dBlack(() => undefined)
      );
      materialBinding.setUniform(
        "metalnessStrength",
        shaderUniform.number(({ metalnessStrength }) => metalnessStrength)
      );
      materialBinding.setUniform(
        "roughnessStrength",
        shaderUniform.number(({ roughnessStrength }) => roughnessStrength)
      );

      break;
  }

  materialBinding.setUniform(
    "emissiveMap",
    !configuration.noEmissiveMap
      ? shaderUniform.tex2dBlack(({ emissiveMap }) => emissiveMap)
      : shaderUniform.tex2dBlack(() => undefined)
  );
  materialBinding.setUniform(
    "emissiveColor",
    shaderUniform.vector4f(({ emissiveColor }) => emissiveColor)
  );
  materialBinding.setUniform(
    "heightMap",
    !configuration.noHeightMap
      ? shaderUniform.tex2dBlack(({ heightMap }) => heightMap)
      : shaderUniform.tex2dBlack(() => undefined)
  );
  materialBinding.setUniform(
    "heightParallaxBias",
    shaderUniform.number(({ heightParallaxBias }) => heightParallaxBias)
  );
  materialBinding.setUniform(
    "heightParallaxScale",
    shaderUniform.number(({ heightParallaxScale }) => heightParallaxScale)
  );
  materialBinding.setUniform(
    "normalMap",
    !configuration.noNormalMap
      ? shaderUniform.tex2dNormal(({ normalMap }) => normalMap)
      : shaderUniform.tex2dNormal(() => undefined)
  );
  materialBinding.setUniform(
    "occlusionMap",
    !configuration.noOcclusionMap
      ? shaderUniform.tex2dBlack(({ occlusionMap }) => occlusionMap)
      : shaderUniform.tex2dBlack(() => undefined)
  );
  materialBinding.setUniform(
    "occlusionStrength",
    shaderUniform.number(({ occlusionStrength }) => occlusionStrength)
  );

  // Bind light uniforms
  const defaultColor = Vector3.zero;
  const defaultDirection = { x: 1, y: 0, z: 0 };
  const defaultPosition = Vector3.zero;

  sceneBinding.setUniform(
    "ambientLightColor",
    shaderUniform.vector3f(({ ambientLightColor }) => ambientLightColor)
  );

  for (let i = 0; i < configuration.maxDirectionalLights; ++i) {
    const index = i;

    if (!configuration.noShadow) {
      sceneBinding.setUniform(
        `directionalLights[${index}].castShadow`,
        shaderUniform.boolean(
          ({ directionalShadowLights }) =>
            index < directionalShadowLights.length &&
            directionalShadowLights[index].shadow
        )
      );
      sceneBinding.setUniform(
        `directionalLights[${index}].shadowViewMatrix`,
        shaderUniform.matrix4f(({ directionalShadowLights }) =>
          index < directionalShadowLights.length
            ? directionalShadowLights[index].shadowViewMatrix
            : Matrix4.identity
        )
      );
      sceneBinding.setUniform(
        `directionalLightShadowMaps[${index}]`,
        shaderUniform.tex2dBlack(({ directionalShadowLights }) =>
          index < directionalShadowLights.length
            ? directionalShadowLights[index].shadowMap
            : undefined
        )
      );
    }

    sceneBinding.setUniform(
      `directionalLights[${i}].color`,
      shaderUniform.vector3f(({ directionalShadowLights }) =>
        index < directionalShadowLights.length
          ? directionalShadowLights[index].color
          : defaultColor
      )
    );
    sceneBinding.setUniform(
      `directionalLights[${i}].direction`,
      shaderUniform.vector3f(({ directionalShadowLights }) =>
        index < directionalShadowLights.length
          ? directionalShadowLights[index].direction
          : defaultDirection
      )
    );
  }

  for (let i = 0; i < configuration.maxPointLights; ++i) {
    const index = i;

    sceneBinding.setUniform(
      `pointLights[${i}].color`,
      shaderUniform.vector3f(({ pointShadowLights }) =>
        index < pointShadowLights.length
          ? pointShadowLights[index].color
          : defaultColor
      )
    );
    sceneBinding.setUniform(
      `pointLights[${i}].position`,
      shaderUniform.vector3f(({ pointShadowLights }) =>
        index < pointShadowLights.length
          ? pointShadowLights[index].position
          : defaultPosition
      )
    );
    sceneBinding.setUniform(
      `pointLights[${i}].radius`,
      shaderUniform.number(({ pointShadowLights }) =>
        index < pointShadowLights.length ? pointShadowLights[index].radius : 0
      )
    );
  }

  return createObjectPainter(
    sceneBinding,
    geometryBinding,
    materialBinding,
    polygonBinding
  );
};

const createDirectionalShadowPainter = (
  shader: GlShader
): GlPainter<ShadowScene> => {
  const polygonBinding = shader.declare<GlPolygon>();

  polygonBinding.setAttribute("position", ({ position }) => position);

  const geometryBinding = shader.declare<GlGeometry>();

  geometryBinding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );

  const sceneBinding = shader.declare<ShadowScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  return createObjectPainter<ShadowScene>(
    sceneBinding,
    geometryBinding,
    undefined,
    polygonBinding
  );
};

// FIXME: not implemented
const createPointShadowPainter = (): GlPainter<ShadowScene> => {
  return {
    paint: () => {},
  };
};

class ForwardLightingRenderer implements Renderer<ForwardLightingScene> {
  public readonly directionalShadowBuffers: GlTexture[];
  public readonly pointShadowBuffers: GlTexture[];

  private readonly directionalShadowPainter: GlPainter<ShadowScene>;
  private readonly directionalShadowProjectionMatrix: Matrix4;
  private readonly directionalShadowShader: GlShader;
  private readonly directionalShadowTargets: GlTarget[];
  private readonly lightPainter: GlPainter<LightScene>;
  private readonly lightShader: GlShader;
  private readonly maxDirectionalLights: number;
  private readonly maxPointLights: number;
  private readonly pointShadowPainter: GlPainter<ShadowScene>;
  private readonly pointShadowProjectionMatrix: Matrix4;
  private readonly pointShadowTargets: GlTarget[];
  private readonly runtime: GlRuntime;
  private readonly target: GlTarget;

  public constructor(
    runtime: GlRuntime,
    target: GlTarget,
    configuration: ForwardLightingConfiguration
  ) {
    const gl = runtime.context;
    const targetSize = { x: 1024, y: 1024 };

    const fullConfiguration: Required<ForwardLightingConfiguration> = {
      maxDirectionalLights: configuration.maxDirectionalLights ?? 4,
      maxPointLights: configuration.maxPointLights ?? 4,
      lightModel: configuration.lightModel ?? ForwardLightingLightModel.Phong,
      lightModelPhongNoAmbient: configuration.lightModelPhongNoAmbient ?? false,
      lightModelPhongNoDiffuse: configuration.lightModelPhongNoDiffuse ?? false,
      lightModelPhongNoSpecular:
        configuration.lightModelPhongNoSpecular ?? false,
      lightModelPhysicalNoAmbient:
        configuration.lightModelPhysicalNoAmbient ?? false,
      lightModelPhysicalNoIBL: configuration.lightModelPhysicalNoIBL ?? false,
      noDiffuseMap: configuration.noDiffuseMap ?? false,
      noEmissiveMap: configuration.noEmissiveMap ?? false,
      noHeightMap: configuration.noHeightMap ?? false,
      noMetalnessMap: configuration.noMetalnessMap ?? false,
      noNormalMap: configuration.noNormalMap ?? false,
      noOcclusionMap: configuration.noOcclusionMap ?? false,
      noRoughnessMap: configuration.noRoughnessMap ?? false,
      noShadow: configuration.noShadow ?? false,
      noSpecularMap: configuration.noSpecularMap ?? false,
    };

    const directionalShadowTargets = range(
      fullConfiguration.maxDirectionalLights
    ).map(() => new GlTarget(gl, targetSize));
    const lightShader = createLightShader(runtime, fullConfiguration);
    const pointShadowTargets = range(fullConfiguration.maxPointLights).map(
      () => new GlTarget(gl, targetSize)
    );

    this.directionalShadowBuffers = directionalShadowTargets.map((target) =>
      target.setupDepthTexture(GlTextureFormat.Depth16, GlTextureType.Quad)
    );
    const directionalShadowShader = runtime.createShader(
      shadowDirectionalVertexShader,
      shadowDirectionalFragmentShader,
      {}
    );
    this.directionalShadowPainter = createDirectionalShadowPainter(
      directionalShadowShader
    );
    this.directionalShadowProjectionMatrix = Matrix4.fromIdentity([
      "setFromOrthographic",
      -10,
      10,
      -10,
      10,
      -10,
      20,
    ]);
    this.directionalShadowShader = directionalShadowShader;
    this.directionalShadowTargets = directionalShadowTargets;
    this.lightPainter = createLightPainter(lightShader, fullConfiguration);
    this.lightShader = lightShader;
    this.maxDirectionalLights = fullConfiguration.maxDirectionalLights;
    this.maxPointLights = fullConfiguration.maxPointLights;
    this.pointShadowBuffers = pointShadowTargets.map((target) =>
      target.setupDepthTexture(GlTextureFormat.Depth16, GlTextureType.Quad)
    );
    this.pointShadowPainter = createPointShadowPainter();
    this.pointShadowProjectionMatrix = Matrix4.identity;
    this.pointShadowTargets = pointShadowTargets;
    this.runtime = runtime;
    this.target = target;
  }

  public dispose() {
    this.directionalShadowShader.dispose();
    this.lightShader.dispose();
  }

  public render(scene: ForwardLightingScene) {
    const {
      ambientLightColor,
      directionalLights,
      environmentLight,
      objects,
      pointLights,
      projectionMatrix,
      viewMatrix,
    } = scene;

    const gl = this.runtime.context;

    gl.colorMask(false, false, false, false);
    gl.disable(gl.BLEND);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Create list of opaque objects
    const obstacles: GlObject[] = [];

    for (const { matrix, model, noShadow } of objects) {
      if (noShadow !== true) {
        obstacles.push({ matrix, model });
      }
    }

    let bufferIndex = 0;

    // Create shadow maps for directional lights
    const directionalShadowLights = [];

    if (directionalLights !== undefined) {
      const nbDirectionalLights = Math.min(
        directionalLights.length,
        this.maxDirectionalLights
      );

      for (let i = 0; i < nbDirectionalLights; ++i) {
        const light = directionalLights[i];
        const shadowDirection = {
          x: -light.direction.x,
          y: -light.direction.y,
          z: -light.direction.z,
        };

        const viewMatrix = Matrix4.fromSource(
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

        this.directionalShadowTargets[bufferIndex].clear(0);
        this.directionalShadowPainter.paint(
          this.directionalShadowTargets[bufferIndex],
          {
            objects: obstacles,
            projectionMatrix: this.directionalShadowProjectionMatrix,
            viewMatrix,
          }
        );

        directionalShadowLights.push({
          color: light.color,
          direction: light.direction,
          shadow: light.shadow,
          shadowMap: this.directionalShadowBuffers[bufferIndex],
          shadowViewMatrix: viewMatrix,
        });

        ++bufferIndex;
      }
    }

    // TODO: create shadow maps for point lights ; following lines only skip compiler warnings
    this.maxPointLights;
    this.pointShadowPainter;
    this.pointShadowProjectionMatrix;
    this.pointShadowTargets;

    // Draw scene
    gl.colorMask(true, true, true, true);
    gl.cullFace(gl.BACK);

    this.lightPainter.paint(this.target, {
      ambientLightColor: ambientLightColor ?? Vector3.zero,
      directionalShadowLights,
      environmentLight,
      objects,
      pointShadowLights: pointLights ?? [],
      projectionMatrix,
      projectionShadowMatrix: this.directionalShadowProjectionMatrix,
      viewMatrix,
    });
  }

  public resize(_size: Vector2) {}
}

export {
  type ForwardLightingConfiguration,
  type ForwardLightingObject,
  type ForwardLightingScene,
  ForwardLightingLightModel,
  ForwardLightingRenderer,
};
