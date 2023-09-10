import { range } from "../../../language/iterable";
import {
  DirectionalLight,
  PointLight,
  sourceDeclare,
  sourceInvokeDirectional,
  sourceInvokePoint,
  sourceTypeDirectional,
  sourceTypePoint,
  sourceTypeResult,
} from "./snippets/light";
import { sampleDeclare, sampleInvoke, sampleType } from "./snippets/material";
import { ObjectScene, createObjectPainter } from "../painters/object";
import { Matrix4 } from "../../../math/matrix";
import { normalPerturb } from "../shaders/normal";
import { parallaxPerturb } from "../shaders/parallax";
import {
  pbrDeclare,
  pbrEnvironmentInvoke,
  pbrLightInvoke,
} from "./snippets/pbr";
import { lightDeclare, lightInvoke } from "./snippets/phong";
import { linearToStandard, standardToLinear } from "../shaders/rgb";
import { Vector3 } from "../../../math/vector";
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
  model?: ForwardLightingLightModel;
  modelPhongNoAmbient?: boolean;
  modelPhongNoDiffuse?: boolean;
  modelPhongNoSpecular?: boolean;
  modelPhysicalNoAmbient?: boolean;
  modelPhysicalNoIBL?: boolean;
  noAlbedoMap?: boolean;
  noEmissiveMap?: boolean;
  noGlossMap?: boolean;
  noHeightMap?: boolean;
  noMetalnessMap?: boolean;
  noNormalMap?: boolean;
  noOcclusionMap?: boolean;
  noRoughnessMap?: boolean;
  noShadow?: boolean;
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
${sourceDeclare("HAS_SHADOW")}

const mat4 texUnitConverter = mat4(
	0.5, 0.0, 0.0, 0.0,
	0.0, 0.5, 0.0, 0.0,
	0.0, 0.0, 0.5, 0.0,
	0.5, 0.5, 0.5, 1.0
);

uniform vec3 ambientLightColor;

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform ${sourceTypeDirectional} directionalLights[${Math.max(
  maxDirectionalLights,
  1
)}];
uniform ${sourceTypePoint} pointLights[max(${Math.max(maxPointLights, 1)}, 1)];

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

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform vec4 emissiveFactor;
uniform sampler2D emissiveMap;
uniform float glossinessStrength;
uniform sampler2D glossinessMap;
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

${sampleDeclare(
  "albedoMap",
  "albedoFactor",
  "glossinessMap",
  "glossinessStrength",
  "metalnessMap",
  "metalnessStrength",
  "roughnessMap",
  "roughnessStrength",
  "shininess"
)}

${normalPerturb.declare()}
${parallaxPerturb.declare()}
${lightDeclare("LIGHT_MODEL_PHONG_DIFFUSE", "LIGHT_MODEL_PHONG_SPECULAR")}
${pbrDeclare(
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

in vec3 directionalLightDistances[${Math.max(maxDirectionalLights, 1)}];
in vec3 directionalLightShadows[${Math.max(maxDirectionalLights, 1)}];

in vec3 pointLightDistances[${Math.max(maxPointLights, 1)}];
in vec3 pointLightShadows[${Math.max(maxPointLights, 1)}];

layout(location=0) out vec4 fragColor;

vec3 getLight(in ${sourceTypeResult} light, in ${sampleType} material, in vec3 normal, in vec3 eyeDirection) {
	#if LIGHT_MODEL == ${ForwardLightingLightModel.Phong}
		return ${lightInvoke(
      "light",
      "material.albedo.rgb",
      "material.glossiness",
      "material.shininess",
      "normal",
      "eyeDirection"
    )};
	#elif LIGHT_MODEL == ${ForwardLightingLightModel.Physical}
		return ${pbrLightInvoke("light", "material", "normal", "eyeDirection")};
	#endif
}

void main(void) {
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);
	vec3 t = normalize(tangent);

	vec3 eyeDirection = normalize(eye);
	vec2 coordParallax = ${parallaxPerturb.invoke(
    "heightMap",
    "coord",
    "eyeDirection",
    "heightParallaxScale",
    "heightParallaxBias",
    "t",
    "b",
    "n"
  )};
	vec3 modifiedNormal = ${normalPerturb.invoke(
    "normalMap",
    "coordParallax",
    "t",
    "b",
    "n"
  )};

	${sampleType} material = ${sampleInvoke("coordParallax")};

	// Apply environment (ambient or influence-based) lighting
	vec3 color = ${pbrEnvironmentInvoke(
    "material",
    "normal",
    "eyeDirection"
  )} * ambientLightColor * float(LIGHT_AMBIENT);

	// Apply components from directional lights
  ${range(maxDirectionalLights)
    .map(
      (i) => `
  #ifdef HAS_SHADOW
  float shadowMapSample${i} = texture(directionalLightShadowMaps[${i}], directionalLightShadows[${i}].xy).r;

  if (!directionalLights[${i}].castShadow || shadowMapSample${i} >= directionalLightShadows[${i}].z) {
  #endif

    ${sourceTypeResult} light${i} = ${sourceInvokeDirectional(
        `directionalLights[${i}]`,
        `directionalLightDistances[${i}]`
      )};

    color += getLight(light${i}, material, modifiedNormal, eyeDirection);

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

    ${sourceTypeResult} light${i} = ${sourceInvokePoint(
        `pointLights[${i}]`,
        `pointLightDistances[${i}]`
      )};

    color += getLight(light${i}, material, modifiedNormal, eyeDirection);

  #ifdef HAS_SHADOW
  }
  #endif`
    )
    .join("\n")}

	// Apply occlusion component
	color = mix(color, color * texture(occlusionMap, coordParallax).r, occlusionStrength);

	// Apply emissive component
  color += emissiveFactor.rgb * ${standardToLinear.invoke(
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
    ["LIGHT_MODEL"]: shaderDirective.number(<number>configuration.model),
  };

  switch (configuration.model) {
    case ForwardLightingLightModel.Phong:
      directives["LIGHT_AMBIENT"] = shaderDirective.boolean(
        !configuration.modelPhongNoAmbient
      );
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = shaderDirective.boolean(
        !configuration.modelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = shaderDirective.boolean(
        !configuration.modelPhongNoSpecular
      );

      break;

    case ForwardLightingLightModel.Physical:
      if (!configuration.modelPhysicalNoIBL) {
        directives["LIGHT_MODEL_PBR_IBL"] = shaderDirective.number(1);
      }

      directives["LIGHT_AMBIENT"] = shaderDirective.boolean(
        !configuration.modelPhysicalNoAmbient
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
    "albedoMap",
    !configuration.noAlbedoMap
      ? shaderUniform.tex2dWhite(({ albedoMap }) => albedoMap)
      : shaderUniform.tex2dWhite(() => undefined)
  );
  materialBinding.setUniform(
    "albedoFactor",
    shaderUniform.array4f(({ albedoFactor }) => albedoFactor)
  );

  switch (configuration.model) {
    case ForwardLightingLightModel.Phong:
      materialBinding.setUniform(
        "glossinessMap",
        !configuration.noGlossMap
          ? shaderUniform.tex2dWhite(({ albedoMap: a, glossMap: g }) => g ?? a)
          : shaderUniform.tex2dWhite(() => undefined)
      );
      materialBinding.setUniform(
        "glossinessStrength",
        shaderUniform.number(({ glossFactor }) => glossFactor[0])
      );
      materialBinding.setUniform(
        "shininess",
        shaderUniform.number(({ shininess }) => shininess)
      );

      break;

    case ForwardLightingLightModel.Physical:
      if (!configuration.modelPhysicalNoIBL) {
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
    "emissiveFactor",
    shaderUniform.array4f(({ emissiveFactor }) => emissiveFactor)
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
          ({ directionalShadowLights: directionalLights }) =>
            index < directionalLights.length && directionalLights[index].shadow
        )
      );
      sceneBinding.setUniform(
        `directionalLights[${index}].shadowViewMatrix`,
        shaderUniform.matrix4f(
          ({ directionalShadowLights: directionalLights }) =>
            index < directionalLights.length
              ? directionalLights[index].shadowViewMatrix
              : Matrix4.identity
        )
      );
      sceneBinding.setUniform(
        `directionalLightShadowMaps[${index}]`,
        shaderUniform.tex2dBlack(
          ({ directionalShadowLights: directionalLights }) =>
            index < directionalLights.length
              ? directionalLights[index].shadowMap
              : undefined
        )
      );
    }

    sceneBinding.setUniform(
      `directionalLights[${i}].color`,
      shaderUniform.vector3f(({ directionalShadowLights: directionalLights }) =>
        index < directionalLights.length
          ? directionalLights[index].color
          : defaultColor
      )
    );
    sceneBinding.setUniform(
      `directionalLights[${i}].direction`,
      shaderUniform.vector3f(({ directionalShadowLights: directionalLights }) =>
        index < directionalLights.length
          ? directionalLights[index].direction
          : defaultDirection
      )
    );
  }

  for (let i = 0; i < configuration.maxPointLights; ++i) {
    const index = i;

    sceneBinding.setUniform(
      `pointLights[${i}].color`,
      shaderUniform.vector3f(({ pointShadowLights: pointLights }) =>
        index < pointLights.length ? pointLights[index].color : defaultColor
      )
    );
    sceneBinding.setUniform(
      `pointLights[${i}].position`,
      shaderUniform.vector3f(({ pointShadowLights: pointLights }) =>
        index < pointLights.length
          ? pointLights[index].position
          : defaultPosition
      )
    );
    sceneBinding.setUniform(
      `pointLights[${i}].radius`,
      shaderUniform.number(({ pointShadowLights: pointLights }) =>
        index < pointLights.length ? pointLights[index].radius : 0
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
    const targetHeight = 1024;
    const targetWidth = 1024;

    const fullConfiguration: Required<ForwardLightingConfiguration> = {
      maxDirectionalLights: configuration.maxDirectionalLights ?? 0,
      maxPointLights: configuration.maxPointLights ?? 0,
      model: configuration.model ?? ForwardLightingLightModel.Phong,
      modelPhongNoAmbient: configuration.modelPhongNoAmbient ?? false,
      modelPhongNoDiffuse: configuration.modelPhongNoDiffuse ?? false,
      modelPhongNoSpecular: configuration.modelPhongNoSpecular ?? false,
      modelPhysicalNoAmbient: configuration.modelPhysicalNoAmbient ?? false,
      modelPhysicalNoIBL: configuration.modelPhysicalNoIBL ?? false,
      noAlbedoMap: configuration.noAlbedoMap ?? false,
      noEmissiveMap: configuration.noEmissiveMap ?? false,
      noGlossMap: configuration.noGlossMap ?? false,
      noHeightMap: configuration.noHeightMap ?? false,
      noMetalnessMap: configuration.noMetalnessMap ?? false,
      noNormalMap: configuration.noNormalMap ?? false,
      noOcclusionMap: configuration.noOcclusionMap ?? false,
      noRoughnessMap: configuration.noRoughnessMap ?? false,
      noShadow: configuration.noShadow ?? false,
    };

    const directionalShadowTargets = range(
      fullConfiguration.maxDirectionalLights
    ).map(() => new GlTarget(gl, targetWidth, targetHeight));
    const lightShader = createLightShader(runtime, fullConfiguration);
    const pointShadowTargets = range(fullConfiguration.maxPointLights).map(
      () => new GlTarget(gl, targetWidth, targetHeight)
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
    this.directionalShadowProjectionMatrix = Matrix4.fromOrthographic(
      -10,
      10,
      -10,
      10,
      -10,
      20
    );
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

        const viewMatrix = Matrix4.fromCustom(
          ["translate", { x: 0, y: 0, z: -10 }],
          [
            "multiply",
            Matrix4.fromDirection(shadowDirection, { x: 0, y: 1, z: 0 }),
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

  public resize(_width: number, _height: number) {}
}

export {
  type ForwardLightingConfiguration,
  type ForwardLightingObject,
  type ForwardLightingScene,
  ForwardLightingLightModel,
  ForwardLightingRenderer,
};
