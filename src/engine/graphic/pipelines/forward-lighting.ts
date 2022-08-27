import { getDirectiveOrValue } from "./snippets/compiler";
import { range } from "../../language/functional";
import {
  sourceDeclare,
  sourceInvokeDirectional,
  sourceInvokePoint,
  sourceTypeDirectional,
  sourceTypePoint,
  sourceTypeResult,
} from "./snippets/light";
import { sampleDeclare, sampleInvoke, sampleType } from "./snippets/material";
import { MaterialPainter } from "../painters/material";
import { SingularPainter } from "../painters/singular";
import { Matrix4 } from "../../math/matrix";
import * as normal from "./snippets/normal";
import * as parallax from "./snippets/parallax";
import * as pbr from "./snippets/pbr";
import * as phong from "./snippets/phong";
import * as rgb from "./snippets/rgb";
import { Vector3 } from "../../math/vector";
import * as webgl from "../webgl";

type ForwardLightingConfiguration = {
  light?: LightConfiguration;
  material?: MaterialConfiguration;
  noMaterialShader?: boolean;
};

enum ForwardLightingModel {
  None,
  Phong,
  Physical,
}

interface DirectionalLight extends webgl.DirectionalLight {
  shadowMap: WebGLTexture;
  shadowViewMatrix: Matrix4;
}

type LightConfiguration = {
  maxDirectionalLights?: number;
  maxPointLights?: number;
  model?: ForwardLightingModel;
  modelPhongNoAmbient?: boolean;
  modelPhongNoDiffuse?: boolean;
  modelPhongNoSpecular?: boolean;
  modelPhysicalNoAmbient?: boolean;
  modelPhysicalNoIBL?: boolean;
  noShadow?: boolean;
};

interface LightState extends State {
  ambientLightColor: Vector3;
  directionalLights: DirectionalLight[];
  environmentLight?: {
    brdf: WebGLTexture;
    diffuse: WebGLTexture;
    specular: WebGLTexture;
  };
  pointLights: webgl.PointLight[]; // FIXME: extend PointLight with extra properties
  projectionMatrix: Matrix4;
  shadowProjectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

type MaterialConfiguration = {
  forceAlbedoMap?: boolean;
  forceEmissiveMap?: boolean;
  forceGlossMap?: boolean;
  forceHeightMap?: boolean;
  forceMetalnessMap?: boolean;
  forceNormalMap?: boolean;
  forceOcclusionMap?: boolean;
  forceRoughnessMap?: boolean;
};

interface ShadowState extends State {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

interface State {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

const lightHeaderShader = `
${sourceDeclare("HAS_SHADOW")}

const mat4 texUnitConverter = mat4(
	0.5, 0.0, 0.0, 0.0,
	0.0, 0.5, 0.0, 0.0,
	0.0, 0.0, 0.5, 0.0,
	0.5, 0.5, 0.5, 1.0
);

uniform vec3 ambientLightColor;

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform ${sourceTypeDirectional} directionalLights[max(MAX_DIRECTIONAL_LIGHTS, 1)];
uniform ${sourceTypePoint} pointLights[max(MAX_POINT_LIGHTS, 1)];

// FIXME: adding shadowMap as field to *Light structures doesn't work for some reason
#ifdef HAS_SHADOW
uniform sampler2D directionalLightShadowMaps[max(MAX_DIRECTIONAL_LIGHTS, 1)];
uniform sampler2D pointLightShadowMaps[max(MAX_POINT_LIGHTS, 1)];
#endif`;

const lightVertexShader = `
${lightHeaderShader}

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 shadowProjectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space
out vec3 normal; // Normal at point in camera space
out vec3 tangent; // Tangent at point in camera space

out vec3 directionalLightDistances[max(MAX_DIRECTIONAL_LIGHTS, 1)];
out vec3 directionalLightShadows[max(MAX_DIRECTIONAL_LIGHTS, 1)];

out vec3 pointLightDistances[max(MAX_POINT_LIGHTS, 1)];
out vec3 pointLightShadows[max(MAX_POINT_LIGHTS, 1)];

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 pointWorld = modelMatrix * vec4(points, 1.0);
	vec4 pointCamera = viewMatrix * pointWorld;

	// Process directional lights
	for (int i = 0; i < MAX_DIRECTIONAL_LIGHTS; ++i) {
		#ifdef HAS_SHADOW
			if (directionalLights[i].castShadow) {
				vec4 pointShadow = texUnitConverter * shadowProjectionMatrix * directionalLights[i].shadowViewMatrix * pointWorld;

				directionalLightShadows[i] = pointShadow.xyz;
			}
		#endif

		directionalLightDistances[i] = toCameraDirection(directionalLights[i].direction);
	}

	// Process point lights
	for (int i = 0; i < MAX_POINT_LIGHTS; ++i) {
		#ifdef HAS_SHADOW
			// FIXME: shadow map code
		#endif

		pointLightDistances[i] = toCameraPosition(pointLights[i].position) - pointCamera.xyz;
	}

	coord = coords;
	eye = -pointCamera.xyz;
	normal = normalize(normalMatrix * normals);
	tangent = normalize(normalMatrix * tangents);
	bitangent = cross(normal, tangent);

	gl_Position = projectionMatrix * pointCamera;
}`;

const lightFragmentShader = `
${lightHeaderShader}

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform bool albedoMapEnabled;
uniform vec4 emissiveFactor;
uniform sampler2D emissiveMap;
uniform bool emissiveMapEnabled;
uniform float glossinessStrength;
uniform sampler2D glossinessMap;
uniform bool glossinessMapEnabled;
uniform sampler2D heightMap;
uniform bool heightMapEnabled;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D metalnessMap;
uniform bool metalnessMapEnabled;
uniform float metalnessStrength;
uniform sampler2D normalMap;
uniform bool normalMapEnabled;
uniform sampler2D occlusionMap;
uniform bool occlusionMapEnabled;
uniform float occlusionStrength;
uniform sampler2D roughnessMap;
uniform bool roughnessMapEnabled;
uniform float roughnessStrength;
uniform float shininess;

uniform sampler2D environmentBrdfMap;
uniform samplerCube environmentDiffuseMap;
uniform samplerCube environmentSpecularMap;

${rgb.linearToStandardDeclare()}
${rgb.standardToLinearDeclare()}

${sampleDeclare(
  "FORCE_ALBEDO_MAP",
  "albedoMapEnabled",
  "albedoMap",
  "albedoFactor",
  "FORCE_GLOSSINESS_MAP",
  "glossinessMapEnabled",
  "glossinessMap",
  "glossinessStrength",
  "FORCE_METALNESS_MAP",
  "metalnessMapEnabled",
  "metalnessMap",
  "metalnessStrength",
  "FORCE_ROUGHNESS_MAP",
  "roughnessMapEnabled",
  "roughnessMap",
  "roughnessStrength",
  "shininess"
)}

${normal.perturbDeclare("FORCE_NORMAL_MAP", "normalMapEnabled", "normalMap")}
${parallax.perturbDeclare("FORCE_HEIGHT_MAP", "heightMapEnabled", "heightMap")}
${phong.lightDeclare("LIGHT_MODEL_PHONG_DIFFUSE", "LIGHT_MODEL_PHONG_SPECULAR")}
${pbr.declare(
  "LIGHT_MODEL_PBR_IBL",
  "environmentBrdfMap",
  "environmentDiffuseMap",
  "environmentSpecularMap"
)}

in vec3 bitangent;
in vec2 coord;
in vec3 eye;
in vec3 normal;
in vec3 tangent;

in vec3 directionalLightDistances[max(MAX_DIRECTIONAL_LIGHTS, 1)];
in vec3 directionalLightShadows[max(MAX_DIRECTIONAL_LIGHTS, 1)];

in vec3 pointLightDistances[max(MAX_POINT_LIGHTS, 1)];
in vec3 pointLightShadows[max(MAX_POINT_LIGHTS, 1)];

layout(location=0) out vec4 fragColor;

vec3 getLight(in ${sourceTypeResult} light, in ${sampleType} material, in vec3 normal, in vec3 eyeDirection) {
	#if LIGHT_MODEL == ${ForwardLightingModel.Phong}
		return ${phong.lightInvoke(
      "light",
      "material.albedo.rgb",
      "material.glossiness",
      "material.shininess",
      "normal",
      "eyeDirection"
    )};
	#elif LIGHT_MODEL == ${ForwardLightingModel.Physical}
		return ${pbr.lightInvoke("light", "material", "normal", "eyeDirection")};
	#endif
}

void main(void) {
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);
	vec3 t = normalize(tangent);

	vec3 eyeDirection = normalize(eye);
	vec2 coordParallax = ${parallax.perturbInvoke(
    "coord",
    "eyeDirection",
    "heightParallaxScale",
    "heightParallaxBias",
    "t",
    "b",
    "n"
  )};
	vec3 modifiedNormal = ${normal.perturbInvoke("coordParallax", "t", "b", "n")};

	${sampleType} material = ${sampleInvoke("coordParallax")};

	// Apply environment (ambient or influence-based) lighting
	vec3 color = ${pbr.environmentInvoke(
    "material",
    "normal",
    "eyeDirection"
  )} * ambientLightColor * float(LIGHT_AMBIENT);

	// Apply components from directional lights
	for (int i = 0; i < MAX_DIRECTIONAL_LIGHTS; ++i) {
		#ifdef HAS_SHADOW
			float shadowMapSample = texture(directionalLightShadowMaps[i], directionalLightShadows[i].xy).r;

			if (directionalLights[i].castShadow && shadowMapSample < directionalLightShadows[i].z)
				continue;
		#endif

		${sourceTypeResult} light = ${sourceInvokeDirectional(
  "directionalLights[i]",
  "directionalLightDistances[i]"
)};

		color += getLight(light, material, modifiedNormal, eyeDirection);
	}

	// Apply components from point lights
	for (int i = 0; i < MAX_POINT_LIGHTS; ++i) {
		${sourceTypeResult} light = ${sourceInvokePoint(
  "pointLights[i]",
  "pointLightDistances[i]"
)};

		color += getLight(light, material, modifiedNormal, eyeDirection);
	}

	// Apply occlusion component
	if (bool(${getDirectiveOrValue("FORCE_OCCLUSION_MAP", "occlusionMapEnabled")}))
		color = mix(color, color * texture(occlusionMap, coordParallax).r, occlusionStrength);

	// Apply emissive component
	if (bool(${getDirectiveOrValue("FORCE_EMISSIVE_MAP", "emissiveMapEnabled")}))
		color += emissiveFactor.rgb * ${rgb.standardToLinearInvoke(
      "texture(emissiveMap, coordParallax).rgb"
    )};

	fragColor = vec4(${rgb.linearToStandardInvoke("color")}, 1.0);
}`;

const shadowDirectionalVertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const shadowDirectionalFragmentShader = `
layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = vec4(1, 1, 1, 1);
}`;

const loadLight = (
  gl: WebGLRenderingContext,
  materialConfiguration: MaterialConfiguration,
  lightConfiguration: LightConfiguration
) => {
  const maxDirectionalLights = lightConfiguration.maxDirectionalLights ?? 0;
  const maxPointLights = lightConfiguration.maxPointLights ?? 0;

  const directives = [
    { name: "LIGHT_MODEL", value: <number>lightConfiguration.model },
    { name: "MAX_DIRECTIONAL_LIGHTS", value: maxDirectionalLights },
    { name: "MAX_POINT_LIGHTS", value: maxPointLights },
  ];

  switch (lightConfiguration.model) {
    case ForwardLightingModel.Phong:
      directives.push({
        name: "LIGHT_AMBIENT",
        value: lightConfiguration.modelPhongNoAmbient ? 0 : 1,
      });
      directives.push({
        name: "LIGHT_MODEL_PHONG_DIFFUSE",
        value: lightConfiguration.modelPhongNoDiffuse ? 0 : 1,
      });
      directives.push({
        name: "LIGHT_MODEL_PHONG_SPECULAR",
        value: lightConfiguration.modelPhongNoSpecular ? 0 : 1,
      });

      break;

    case ForwardLightingModel.Physical:
      if (!lightConfiguration.modelPhysicalNoIBL)
        directives.push({ name: "LIGHT_MODEL_PBR_IBL", value: 1 });

      directives.push({
        name: "LIGHT_AMBIENT",
        value: lightConfiguration.modelPhysicalNoAmbient ? 0 : 1,
      });

      break;
  }

  if (materialConfiguration.forceAlbedoMap !== undefined)
    directives.push({
      name: "FORCE_ALBEDO_MAP",
      value: materialConfiguration.forceAlbedoMap ? 1 : 0,
    });

  if (materialConfiguration.forceEmissiveMap !== undefined)
    directives.push({
      name: "FORCE_EMISSIVE_MAP",
      value: materialConfiguration.forceEmissiveMap ? 1 : 0,
    });

  if (materialConfiguration.forceGlossMap !== undefined)
    directives.push({
      name: "FORCE_GLOSSINESS_MAP",
      value: materialConfiguration.forceGlossMap ? 1 : 0,
    });

  if (materialConfiguration.forceHeightMap !== undefined)
    directives.push({
      name: "FORCE_HEIGHT_MAP",
      value: materialConfiguration.forceHeightMap ? 1 : 0,
    });

  if (materialConfiguration.forceMetalnessMap !== undefined)
    directives.push({
      name: "FORCE_METALNESS_MAP",
      value: materialConfiguration.forceMetalnessMap ? 1 : 0,
    });

  if (materialConfiguration.forceNormalMap !== undefined)
    directives.push({
      name: "FORCE_NORMAL_MAP",
      value: materialConfiguration.forceNormalMap ? 1 : 0,
    });

  if (materialConfiguration.forceOcclusionMap !== undefined)
    directives.push({
      name: "FORCE_OCCLUSION_MAP",
      value: materialConfiguration.forceOcclusionMap ? 1 : 0,
    });

  if (materialConfiguration.forceRoughnessMap !== undefined)
    directives.push({
      name: "FORCE_ROUGHNESS_MAP",
      value: materialConfiguration.forceRoughnessMap ? 1 : 0,
    });

  if (!lightConfiguration.noShadow)
    directives.push({ name: "HAS_SHADOW", value: 1 });

  const shader = new webgl.Shader<LightState>(
    gl,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  // Bind geometry attributes
  shader.setupAttributePerGeometry("normals", (geometry) => geometry.normals);
  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  if (
    materialConfiguration.forceAlbedoMap !== false ||
    materialConfiguration.forceEmissiveMap !== false ||
    materialConfiguration.forceGlossMap !== false ||
    materialConfiguration.forceHeightMap !== false ||
    materialConfiguration.forceMetalnessMap !== false ||
    materialConfiguration.forceNormalMap !== false ||
    materialConfiguration.forceOcclusionMap !== false ||
    materialConfiguration.forceRoughnessMap !== false
  )
    shader.setupAttributePerGeometry("coords", (geometry) => geometry.coords);
  else shader.clearAttributePerGeometry("coords");

  if (
    materialConfiguration.forceHeightMap !== false ||
    materialConfiguration.forceNormalMap !== false
  )
    shader.setupAttributePerGeometry(
      "tangents",
      (geometry) => geometry.tangents
    );
  else {
    shader.clearAttributePerGeometry("tangents");
  }

  // Bind matrix uniforms
  shader.setupMatrix4PerNode("modelMatrix", (state) => state.modelMatrix);
  shader.setupMatrix3PerNode("normalMatrix", (state) => state.normalMatrix);
  shader.setupMatrix4PerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix
  );
  shader.setupMatrix4PerTarget("viewMatrix", (state) => state.viewMatrix);

  if (!lightConfiguration.noShadow) {
    shader.setupMatrix4PerTarget(
      "shadowProjectionMatrix",
      (state) => state.shadowProjectionMatrix
    );
  }

  // Bind material uniforms
  if (materialConfiguration.forceAlbedoMap !== false) {
    shader.setupTexturePerMaterial(
      "albedoMap",
      materialConfiguration.forceAlbedoMap !== true
        ? "albedoMapEnabled"
        : undefined,
      webgl.TextureType.Quad,
      (material) => material.albedoMap
    );
  }

  shader.setupPropertyPerMaterial(
    "albedoFactor",
    (material) => material.albedoFactor,
    (gl) => gl.uniform4fv
  );

  switch (lightConfiguration.model) {
    case ForwardLightingModel.Phong:
      if (materialConfiguration.forceGlossMap !== false)
        shader.setupTexturePerMaterial(
          "glossinessMap",
          materialConfiguration.forceGlossMap !== true
            ? "glossinessMapEnabled"
            : undefined,
          webgl.TextureType.Quad,
          (material) => material.glossMap
        );

      shader.setupPropertyPerMaterial(
        "glossinessStrength",
        (material) => material.glossFactor[0],
        (gl) => gl.uniform1f
      );
      shader.setupPropertyPerMaterial(
        "shininess",
        (material) => material.shininess,
        (gl) => gl.uniform1f
      );

      break;

    case ForwardLightingModel.Physical:
      if (!lightConfiguration.modelPhysicalNoIBL) {
        shader.setupTexturePerTarget(
          "environmentBrdfMap",
          undefined,
          webgl.TextureType.Quad,
          (state) =>
            state.environmentLight !== undefined
              ? state.environmentLight.brdf
              : undefined
        );
        shader.setupTexturePerTarget(
          "environmentDiffuseMap",
          undefined,
          webgl.TextureType.Cube,
          (state) =>
            state.environmentLight !== undefined
              ? state.environmentLight.diffuse
              : undefined
        );
        shader.setupTexturePerTarget(
          "environmentSpecularMap",
          undefined,
          webgl.TextureType.Cube,
          (state) =>
            state.environmentLight !== undefined
              ? state.environmentLight.specular
              : undefined
        );
      }

      if (materialConfiguration.forceMetalnessMap !== false)
        shader.setupTexturePerMaterial(
          "metalnessMap",
          materialConfiguration.forceMetalnessMap !== true
            ? "metalnessMapEnabled"
            : undefined,
          webgl.TextureType.Quad,
          (material) => material.metalnessMap
        );

      if (materialConfiguration.forceRoughnessMap !== false)
        shader.setupTexturePerMaterial(
          "roughnessMap",
          materialConfiguration.forceRoughnessMap !== true
            ? "roughnessMapEnabled"
            : undefined,
          webgl.TextureType.Quad,
          (material) => material.roughnessMap
        );

      shader.setupPropertyPerMaterial(
        "metalnessStrength",
        (material) => material.metalnessStrength,
        (gl) => gl.uniform1f
      );
      shader.setupPropertyPerMaterial(
        "roughnessStrength",
        (material) => material.roughnessStrength,
        (gl) => gl.uniform1f
      );

      break;
  }

  if (materialConfiguration.forceEmissiveMap !== false) {
    shader.setupTexturePerMaterial(
      "emissiveMap",
      materialConfiguration.forceEmissiveMap !== true
        ? "emissiveMapEnabled"
        : undefined,
      webgl.TextureType.Quad,
      (material) => material.emissiveMap
    );
    shader.setupPropertyPerMaterial(
      "emissiveFactor",
      (material) => material.emissiveFactor,
      (gl) => gl.uniform4fv
    );
  }

  if (materialConfiguration.forceHeightMap !== false) {
    shader.setupTexturePerMaterial(
      "heightMap",
      materialConfiguration.forceHeightMap !== true
        ? "heightMapEnabled"
        : undefined,
      webgl.TextureType.Quad,
      (material) => material.heightMap
    );
    shader.setupPropertyPerMaterial(
      "heightParallaxBias",
      (material) => material.heightParallaxBias,
      (gl) => gl.uniform1f
    );
    shader.setupPropertyPerMaterial(
      "heightParallaxScale",
      (material) => material.heightParallaxScale,
      (gl) => gl.uniform1f
    );
  }

  if (materialConfiguration.forceNormalMap !== false)
    shader.setupTexturePerMaterial(
      "normalMap",
      materialConfiguration.forceNormalMap !== true
        ? "normalMapEnabled"
        : undefined,
      webgl.TextureType.Quad,
      (material) => material.normalMap
    );

  if (materialConfiguration.forceOcclusionMap !== false) {
    shader.setupTexturePerMaterial(
      "occlusionMap",
      materialConfiguration.forceOcclusionMap !== true
        ? "occlusionMapEnabled"
        : undefined,
      webgl.TextureType.Quad,
      (material) => material.occlusionMap
    );
    shader.setupPropertyPerMaterial(
      "occlusionStrength",
      (material) => material.occlusionStrength,
      (gl) => gl.uniform1f
    );
  }

  // Bind light uniforms
  const defaultColor = [0, 0, 0];
  const defaultDirection = [1, 0, 0];
  const defaultPosition = [0, 0, 0];

  shader.setupPropertyPerTarget(
    "ambientLightColor",
    (state) => Vector3.toArray(state.ambientLightColor),
    (gl) => gl.uniform3fv
  );

  for (let i = 0; i < maxDirectionalLights; ++i) {
    const index = i;

    if (!lightConfiguration.noShadow) {
      shader.setupPropertyPerTarget(
        `directionalLights[${index}].castShadow`,
        (state) =>
          index < state.directionalLights.length &&
          state.directionalLights[index].shadow
            ? 1
            : 0,
        (gl) => gl.uniform1i
      );
      shader.setupMatrix4PerTarget(
        `directionalLights[${index}].shadowViewMatrix`,
        (state) =>
          index < state.directionalLights.length
            ? state.directionalLights[index].shadowViewMatrix
            : Matrix4.createIdentity()
      );
      shader.setupTexturePerTarget(
        `directionalLightShadowMaps[${index}]`,
        undefined,
        webgl.TextureType.Quad,
        (state) => state.directionalLights[index].shadowMap
      );
    }

    shader.setupPropertyPerTarget(
      `directionalLights[${i}].color`,
      (state) =>
        index < state.directionalLights.length
          ? Vector3.toArray(state.directionalLights[index].color)
          : defaultColor,
      (gl) => gl.uniform3fv
    );
    shader.setupPropertyPerTarget(
      `directionalLights[${i}].direction`,
      (state) =>
        index < state.directionalLights.length
          ? Vector3.toArray(state.directionalLights[index].direction)
          : defaultDirection,
      (gl) => gl.uniform3fv
    );
  }

  for (let i = 0; i < maxPointLights; ++i) {
    const index = i;

    shader.setupPropertyPerTarget(
      `pointLights[${i}].color`,
      (state) =>
        index < state.pointLights.length
          ? Vector3.toArray(state.pointLights[index].color)
          : defaultColor,
      (gl) => gl.uniform3fv
    );
    shader.setupPropertyPerTarget(
      `pointLights[${i}].position`,
      (state) =>
        index < state.pointLights.length
          ? Vector3.toArray(state.pointLights[index].position)
          : defaultPosition,
      (gl) => gl.uniform3fv
    );
    shader.setupPropertyPerTarget(
      `pointLights[${i}].radius`,
      (state) =>
        index < state.pointLights.length ? state.pointLights[index].radius : 0,
      (gl) => gl.uniform1f
    );
  }

  return shader;
};

const loadShadowDirectional = (gl: WebGLRenderingContext) => {
  const shader = new webgl.Shader<ShadowState>(
    gl,
    shadowDirectionalVertexShader,
    shadowDirectionalFragmentShader
  );

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);
  shader.setupMatrix4PerNode("modelMatrix", (state) => state.modelMatrix);
  shader.setupMatrix4PerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix
  );
  shader.setupMatrix4PerTarget("viewMatrix", (state) => state.viewMatrix);

  return shader;
};

const loadShadowPoint = (gl: WebGLRenderingContext) => {
  // Not implemented
  return new webgl.Shader<ShadowState>(
    gl,
    shadowDirectionalVertexShader,
    shadowDirectionalFragmentShader
  );
};

class ForwardLightingPipeline implements webgl.Pipeline {
  public readonly directionalShadowBuffers: WebGLTexture[];
  public readonly pointShadowBuffers: WebGLTexture[];

  private readonly directionalShadowPainter: webgl.Painter<ShadowState>;
  private readonly directionalShadowProjectionMatrix: Matrix4;
  private readonly directionalShadowTargets: webgl.Target[];
  private readonly gl: WebGL2RenderingContext;
  private readonly lightPainter: webgl.Painter<LightState>;
  private readonly maxDirectionalLights: number;
  private readonly maxPointLights: number;
  private readonly pointShadowPainter: webgl.Painter<ShadowState>;
  private readonly pointShadowProjectionMatrix: Matrix4;
  private readonly pointShadowTargets: webgl.Target[];

  public constructor(
    gl: WebGL2RenderingContext,
    configuration: ForwardLightingConfiguration
  ) {
    const materialClassifier = (material: webgl.Material) =>
      (material.albedoMap !== undefined ? 1 : 0) +
      (material.emissiveMap !== undefined ? 2 : 0) +
      (material.glossMap !== undefined ? 4 : 0) +
      (material.heightMap !== undefined ? 8 : 0) +
      (material.metalnessMap !== undefined ? 16 : 0) +
      (material.normalMap !== undefined ? 32 : 0) +
      (material.occlusionMap !== undefined ? 64 : 0) +
      (material.roughnessMap !== undefined ? 128 : 0);

    const materialConfigurator = (
      configuration: MaterialConfiguration,
      material: webgl.Material
    ) => ({
      forceAlbedoMap:
        configuration.forceAlbedoMap ?? material.albedoMap !== undefined,
      forceEmissiveMap:
        configuration.forceEmissiveMap ?? material.emissiveMap !== undefined,
      forceGlossMap:
        configuration.forceGlossMap ?? material.glossMap !== undefined,
      forceHeightMap:
        configuration.forceHeightMap ?? material.heightMap !== undefined,
      forceMetalnessMap:
        configuration.forceMetalnessMap ?? material.metalnessMap !== undefined,
      forceNormalMap:
        configuration.forceNormalMap ?? material.normalMap !== undefined,
      forceOcclusionMap:
        configuration.forceOcclusionMap ?? material.occlusionMap !== undefined,
      forceRoughnessMap:
        configuration.forceRoughnessMap ?? material.roughnessMap !== undefined,
    });

    const lightConfiguration = configuration.light ?? {};
    const materialConfiguration = configuration.material ?? {};
    const maxDirectionalLights = lightConfiguration.maxDirectionalLights ?? 0;
    const maxPointLights = lightConfiguration.maxPointLights ?? 0;
    const targetHeight = 1024;
    const targetWidth = 1024;

    const directionalShadowTargets = range(
      maxDirectionalLights,
      () => new webgl.Target(gl, targetWidth, targetHeight)
    );
    const pointShadowTargets = range(
      maxPointLights,
      () => new webgl.Target(gl, targetWidth, targetHeight)
    );

    this.directionalShadowBuffers = directionalShadowTargets.map((target) =>
      target.setupDepthTexture(
        webgl.TextureFormat.Depth16,
        webgl.TextureType.Quad
      )
    );
    this.directionalShadowPainter = new SingularPainter(
      loadShadowDirectional(gl)
    );
    this.directionalShadowProjectionMatrix = Matrix4.createOrthographic(
      -10,
      10,
      -10,
      10,
      -10,
      20
    );
    this.directionalShadowTargets = directionalShadowTargets;
    this.gl = gl;
    this.lightPainter = configuration.noMaterialShader
      ? new SingularPainter(
          loadLight(gl, materialConfiguration, lightConfiguration)
        )
      : new MaterialPainter(materialClassifier, (material) =>
          loadLight(
            gl,
            materialConfigurator(materialConfiguration, material),
            lightConfiguration
          )
        );
    this.maxDirectionalLights = maxDirectionalLights;
    this.maxPointLights = maxPointLights;
    this.pointShadowBuffers = pointShadowTargets.map((target) =>
      target.setupDepthTexture(
        webgl.TextureFormat.Depth16,
        webgl.TextureType.Quad
      )
    );
    this.pointShadowPainter = new SingularPainter(loadShadowPoint(gl));
    this.pointShadowProjectionMatrix = Matrix4.createPerspective(
      Math.PI * 0.5,
      targetWidth / targetHeight,
      0.1,
      100
    );
    this.pointShadowTargets = pointShadowTargets;
  }

  public process(
    target: webgl.Target,
    transform: webgl.Transform,
    scene: webgl.Scene
  ) {
    const directionalLights = scene.directionalLights || [];
    const gl = this.gl;
    const pointLights = scene.pointLights || [];

    gl.disable(gl.BLEND);

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    const obstacles = scene.subjects.filter((subject) => !subject.noShadow);
    let bufferIndex = 0;

    // Create shadow maps for directional lights
    const directionalLightStates = [];

    for (
      let i = 0;
      i < Math.min(directionalLights.length, this.maxDirectionalLights);
      ++i
    ) {
      const light = directionalLights[i];
      const shadowDirection = {
        x: -light.direction.x,
        y: -light.direction.y,
        z: -light.direction.z,
      };

      const viewMatrix = Matrix4.createIdentity()
        .translate({ x: 0, y: 0, z: -10 })
        .multiply(
          Matrix4.createDirection(shadowDirection, { x: 0, y: 1, z: 0 })
        );

      gl.colorMask(false, false, false, false);
      gl.cullFace(gl.FRONT);

      this.directionalShadowTargets[bufferIndex].clear(0);
      this.directionalShadowPainter.paint(
        this.directionalShadowTargets[bufferIndex],
        obstacles,
        viewMatrix,
        {
          projectionMatrix: this.directionalShadowProjectionMatrix,
          viewMatrix: viewMatrix,
        }
      );

      directionalLightStates.push({
        color: light.color,
        direction: light.direction,
        shadow: light.shadow,
        shadowMap: this.directionalShadowBuffers[bufferIndex],
        shadowViewMatrix: viewMatrix,
      });

      ++bufferIndex;
    }

    // TODO: create shadow maps for point lights ; following lines only skip compiler warnings
    this.maxPointLights;
    this.pointShadowPainter;
    this.pointShadowProjectionMatrix;
    this.pointShadowTargets;

    // Draw scene
    gl.colorMask(true, true, true, true);
    gl.cullFace(gl.BACK);

    this.lightPainter.paint(target, scene.subjects, transform.viewMatrix, {
      ambientLightColor: scene.ambientLightColor || Vector3.zero,
      directionalLights: directionalLightStates,
      environmentLight: scene.environmentLight,
      pointLights: pointLights,
      projectionMatrix: transform.projectionMatrix,
      shadowProjectionMatrix: this.directionalShadowProjectionMatrix,
      viewMatrix: transform.viewMatrix,
    });
  }

  public resize(_width: number, _height: number) {}
}

export {
  type ForwardLightingConfiguration,
  ForwardLightingModel,
  ForwardLightingPipeline,
};
