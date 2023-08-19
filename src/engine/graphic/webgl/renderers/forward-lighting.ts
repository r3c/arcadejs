import { range } from "../../../language/functional";
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
import { SingularPainter } from "../painters/singular";
import { Matrix4 } from "../../../math/matrix";
import { perturbNormal } from "../shaders/normal";
import * as parallax from "./snippets/parallax";
import * as pbr from "./snippets/pbr";
import * as phong from "./snippets/phong";
import { linearToStandard, standardToLinear } from "../shaders/rgb";
import { Vector3 } from "../../../math/vector";
import {
  GlObject,
  GlPainter,
  GlRenderer,
  GlRuntime,
  GlScene,
  GlShader,
  GlShaderDirective,
  GlTarget,
  GlTexture,
  GlTextureFormat,
  GlTextureType,
  directive,
  uniform,
} from "../../webgl";
import { GlPolygon } from "./objects/polygon";

type ForwardLightingConfiguration = {
  light?: LightConfiguration;
  material?: MaterialConfiguration;
};

enum ForwardLightingLightModel {
  None,
  Phong,
  Physical,
}

type ForwardLightingObject = GlObject<GlPolygon> & {
  noShadow: boolean;
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

type LightConfiguration = {
  maxDirectionalLights?: number;
  maxPointLights?: number;
  model?: ForwardLightingLightModel;
  modelPhongNoAmbient?: boolean;
  modelPhongNoDiffuse?: boolean;
  modelPhongNoSpecular?: boolean;
  modelPhysicalNoAmbient?: boolean;
  modelPhysicalNoIBL?: boolean;
  noShadow?: boolean;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  environmentLight?: EnvironmentLight;
  pointLights?: PointLight[];
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type LightSceneState = State & {
  ambientLightColor: Vector3;
  directionalLights: ShadowDirectionalLight[];
  environmentLight?: {
    brdf: GlTexture;
    diffuse: GlTexture;
    specular: GlTexture;
  };
  pointLights: PointLight[]; // FIXME: extend PointLight with extra properties
  projectionMatrix: Matrix4;
  shadowProjectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type MaterialConfiguration = {
  noAlbedoMap?: boolean;
  noEmissiveMap?: boolean;
  noGlossMap?: boolean;
  noHeightMap?: boolean;
  noMetalnessMap?: boolean;
  noNormalMap?: boolean;
  noOcclusionMap?: boolean;
  noRoughnessMap?: boolean;
};

type ShadowSceneState = State;

type State = {
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

${perturbNormal.declare()}
${parallax.perturbDeclare("heightMap")}
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

in vec3 directionalLightDistances[${Math.max(maxDirectionalLights, 1)}];
in vec3 directionalLightShadows[${Math.max(maxDirectionalLights, 1)}];

in vec3 pointLightDistances[${Math.max(maxPointLights, 1)}];
in vec3 pointLightShadows[${Math.max(maxPointLights, 1)}];

layout(location=0) out vec4 fragColor;

vec3 getLight(in ${sourceTypeResult} light, in ${sampleType} material, in vec3 normal, in vec3 eyeDirection) {
	#if LIGHT_MODEL == ${ForwardLightingLightModel.Phong}
		return ${phong.lightInvoke(
      "light",
      "material.albedo.rgb",
      "material.glossiness",
      "material.shininess",
      "normal",
      "eyeDirection"
    )};
	#elif LIGHT_MODEL == ${ForwardLightingLightModel.Physical}
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
	vec3 modifiedNormal = ${perturbNormal.invoke(
    "normalMap",
    "coordParallax",
    "t",
    "b",
    "n"
  )};

	${sampleType} material = ${sampleInvoke("coordParallax")};

	// Apply environment (ambient or influence-based) lighting
	vec3 color = ${pbr.environmentInvoke(
    "material",
    "normal",
    "eyeDirection"
  )} * ambientLightColor * float(LIGHT_AMBIENT);

	// Apply components from directional lights
  ${range(
    maxDirectionalLights,
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
  ).join("\n")}

	// Apply components from point lights
  ${range(
    maxPointLights,
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
  ).join("\n")}

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

const loadLight = (
  runtime: GlRuntime,
  materialConfiguration: MaterialConfiguration,
  lightConfiguration: LightConfiguration
) => {
  const maxDirectionalLights = lightConfiguration.maxDirectionalLights ?? 0;
  const maxPointLights = lightConfiguration.maxPointLights ?? 0;

  const directives: GlShaderDirective = {
    ["LIGHT_MODEL"]: directive.number(<number>lightConfiguration.model),
  };

  switch (lightConfiguration.model) {
    case ForwardLightingLightModel.Phong:
      directives["LIGHT_AMBIENT"] = directive.boolean(
        !lightConfiguration.modelPhongNoAmbient
      );
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = directive.boolean(
        !lightConfiguration.modelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = directive.boolean(
        !lightConfiguration.modelPhongNoSpecular
      );

      break;

    case ForwardLightingLightModel.Physical:
      if (!lightConfiguration.modelPhysicalNoIBL) {
        directives["LIGHT_MODEL_PBR_IBL"] = directive.number(1);
      }

      directives["LIGHT_AMBIENT"] = directive.boolean(
        !lightConfiguration.modelPhysicalNoAmbient
      );

      break;
  }

  if (!lightConfiguration.noShadow) {
    directives["HAS_SHADOW"] = directive.number(1);
  }

  const shader = new GlShader<LightSceneState, GlPolygon>(
    runtime,
    lightVertexShader(maxDirectionalLights, maxPointLights),
    lightFragmentShader(maxDirectionalLights, maxPointLights),
    directives
  );

  // Bind geometry attributes
  shader.setAttributePerPolygon("coordinate", ({ coordinate }) => coordinate);
  shader.setAttributePerPolygon("normals", ({ normal }) => normal); // FIXME: remove plural
  shader.setAttributePerPolygon("position", ({ position }) => position);
  shader.setAttributePerPolygon("tangents", ({ tangent }) => tangent);

  // Bind matrix uniforms
  shader.setUniformPerGeometry(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerGeometry(
    "normalMatrix",
    uniform.numberMatrix3(({ normalMatrix }) => normalMatrix)
  );
  shader.setUniformPerScene(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerScene(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  if (!lightConfiguration.noShadow) {
    shader.setUniformPerScene(
      "shadowProjectionMatrix",
      uniform.numberMatrix4(
        ({ shadowProjectionMatrix }) => shadowProjectionMatrix
      )
    );
  }

  // Bind material uniforms
  shader.setUniformPerMaterial(
    "albedoMap",
    materialConfiguration.noAlbedoMap !== true
      ? uniform.whiteQuadTexture(({ albedoMap }) => albedoMap)
      : uniform.whiteQuadTexture(() => undefined)
  );
  shader.setUniformPerMaterial(
    "albedoFactor",
    uniform.numberArray4(({ albedoFactor }) => albedoFactor)
  );

  switch (lightConfiguration.model) {
    case ForwardLightingLightModel.Phong:
      shader.setUniformPerMaterial(
        "glossinessMap",
        materialConfiguration.noGlossMap !== true
          ? uniform.blackQuadTexture(({ glossMap }) => glossMap)
          : uniform.blackQuadTexture(() => undefined)
      );
      shader.setUniformPerMaterial(
        "glossinessStrength",
        uniform.numberScalar(({ glossFactor }) => glossFactor[0])
      );
      shader.setUniformPerMaterial(
        "shininess",
        uniform.numberScalar(({ shininess }) => shininess)
      );

      break;

    case ForwardLightingLightModel.Physical:
      if (!lightConfiguration.modelPhysicalNoIBL) {
        shader.setUniformPerScene(
          "environmentBrdfMap",
          uniform.blackQuadTexture(
            ({ environmentLight }) => environmentLight?.brdf
          )
        );
        shader.setUniformPerScene(
          "environmentDiffuseMap",
          uniform.cubeTexture(
            ({ environmentLight }) => environmentLight?.diffuse
          )
        );
        shader.setUniformPerScene(
          "environmentSpecularMap",
          uniform.cubeTexture(
            ({ environmentLight }) => environmentLight?.specular
          )
        );
      }
      shader.setUniformPerMaterial(
        "metalnessMap",
        materialConfiguration.noMetalnessMap !== true
          ? uniform.blackQuadTexture(({ metalnessMap }) => metalnessMap)
          : uniform.blackQuadTexture(() => undefined)
      );
      shader.setUniformPerMaterial(
        "roughnessMap",
        materialConfiguration.noRoughnessMap !== true
          ? uniform.blackQuadTexture(({ roughnessMap }) => roughnessMap)
          : uniform.blackQuadTexture(() => undefined)
      );
      shader.setUniformPerMaterial(
        "metalnessStrength",
        uniform.numberScalar(({ metalnessStrength }) => metalnessStrength)
      );
      shader.setUniformPerMaterial(
        "roughnessStrength",
        uniform.numberScalar(({ roughnessStrength }) => roughnessStrength)
      );

      break;
  }

  shader.setUniformPerMaterial(
    "emissiveMap",
    materialConfiguration.noEmissiveMap !== true
      ? uniform.blackQuadTexture(({ emissiveMap }) => emissiveMap)
      : uniform.blackQuadTexture(() => undefined)
  );
  shader.setUniformPerMaterial(
    "emissiveFactor",
    uniform.numberArray4(({ emissiveFactor }) => emissiveFactor)
  );
  shader.setUniformPerMaterial(
    "heightMap",
    materialConfiguration.noHeightMap !== true
      ? uniform.blackQuadTexture(({ heightMap }) => heightMap)
      : uniform.blackQuadTexture(() => undefined)
  );
  shader.setUniformPerMaterial(
    "heightParallaxBias",
    uniform.numberScalar(({ heightParallaxBias }) => heightParallaxBias)
  );
  shader.setUniformPerMaterial(
    "heightParallaxScale",
    uniform.numberScalar(({ heightParallaxScale }) => heightParallaxScale)
  );
  shader.setUniformPerMaterial(
    "normalMap",
    materialConfiguration.noNormalMap !== true
      ? uniform.blackQuadTexture(({ normalMap }) => normalMap)
      : uniform.blackQuadTexture(() => undefined)
  );
  shader.setUniformPerMaterial(
    "occlusionMap",
    materialConfiguration.noOcclusionMap !== true
      ? uniform.blackQuadTexture(({ occlusionMap }) => occlusionMap)
      : uniform.blackQuadTexture(() => undefined)
  );
  shader.setUniformPerMaterial(
    "occlusionStrength",
    uniform.numberScalar(({ occlusionStrength }) => occlusionStrength)
  );

  // Bind light uniforms
  const defaultColor = Vector3.zero;
  const defaultDirection = { x: 1, y: 0, z: 0 };
  const defaultPosition = Vector3.zero;

  shader.setUniformPerScene(
    "ambientLightColor",
    uniform.numberVector3(({ ambientLightColor }) => ambientLightColor)
  );

  for (let i = 0; i < maxDirectionalLights; ++i) {
    const index = i;

    if (!lightConfiguration.noShadow) {
      shader.setUniformPerScene(
        `directionalLights[${index}].castShadow`,
        uniform.booleanScalar(
          ({ directionalLights }) =>
            index < directionalLights.length && directionalLights[index].shadow
        )
      );
      shader.setUniformPerScene(
        `directionalLights[${index}].shadowViewMatrix`,
        uniform.numberMatrix4(({ directionalLights }) =>
          index < directionalLights.length
            ? directionalLights[index].shadowViewMatrix
            : Matrix4.identity
        )
      );
      shader.setUniformPerScene(
        `directionalLightShadowMaps[${index}]`,
        uniform.blackQuadTexture(({ directionalLights }) =>
          index < directionalLights.length
            ? directionalLights[index].shadowMap
            : undefined
        )
      );
    }

    shader.setUniformPerScene(
      `directionalLights[${i}].color`,
      uniform.numberVector3(({ directionalLights }) =>
        index < directionalLights.length
          ? directionalLights[index].color
          : defaultColor
      )
    );
    shader.setUniformPerScene(
      `directionalLights[${i}].direction`,
      uniform.numberVector3(({ directionalLights }) =>
        index < directionalLights.length
          ? directionalLights[index].direction
          : defaultDirection
      )
    );
  }

  for (let i = 0; i < maxPointLights; ++i) {
    const index = i;

    shader.setUniformPerScene(
      `pointLights[${i}].color`,
      uniform.numberVector3(({ pointLights }) =>
        index < pointLights.length ? pointLights[index].color : defaultColor
      )
    );
    shader.setUniformPerScene(
      `pointLights[${i}].position`,
      uniform.numberVector3(({ pointLights }) =>
        index < pointLights.length
          ? pointLights[index].position
          : defaultPosition
      )
    );
    shader.setUniformPerScene(
      `pointLights[${i}].radius`,
      uniform.numberScalar(({ pointLights }) =>
        index < pointLights.length ? pointLights[index].radius : 0
      )
    );
  }

  return shader;
};

const loadShadowDirectional = (runtime: GlRuntime) => {
  const shader = new GlShader<ShadowSceneState, GlPolygon>(
    runtime,
    shadowDirectionalVertexShader,
    shadowDirectionalFragmentShader,
    {}
  );

  shader.setAttributePerPolygon("position", ({ position }) => position);
  shader.setUniformPerGeometry(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerScene(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerScene(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  return shader;
};

const loadShadowPoint = (runtime: GlRuntime) => {
  // Not implemented
  return new GlShader<ShadowSceneState, GlPolygon>(
    runtime,
    shadowDirectionalVertexShader,
    shadowDirectionalFragmentShader,
    {}
  );
};

class ForwardLightingRenderer
  implements GlRenderer<SceneState, ForwardLightingObject>
{
  public readonly directionalShadowBuffers: GlTexture[];
  public readonly pointShadowBuffers: GlTexture[];

  private readonly directionalShadowPainter: GlPainter<
    ShadowSceneState,
    GlPolygon
  >;
  private readonly directionalShadowProjectionMatrix: Matrix4;
  private readonly directionalShadowTargets: GlTarget[];
  private readonly lightPainter: GlPainter<LightSceneState, GlPolygon>;
  private readonly maxDirectionalLights: number;
  private readonly maxPointLights: number;
  private readonly pointShadowPainter: GlPainter<ShadowSceneState, GlPolygon>;
  private readonly pointShadowProjectionMatrix: Matrix4;
  private readonly pointShadowTargets: GlTarget[];
  private readonly runtime: GlRuntime;

  public constructor(
    runtime: GlRuntime,
    configuration: ForwardLightingConfiguration
  ) {
    const gl = runtime.context;
    const lightConfiguration = configuration.light ?? {};
    const materialConfiguration = configuration.material ?? {};
    const maxDirectionalLights = lightConfiguration.maxDirectionalLights ?? 0;
    const maxPointLights = lightConfiguration.maxPointLights ?? 0;
    const targetHeight = 1024;
    const targetWidth = 1024;

    const directionalShadowTargets = range(
      maxDirectionalLights,
      () => new GlTarget(gl, targetWidth, targetHeight)
    );
    const pointShadowTargets = range(
      maxPointLights,
      () => new GlTarget(gl, targetWidth, targetHeight)
    );

    this.directionalShadowBuffers = directionalShadowTargets.map((target) =>
      target.setupDepthTexture(GlTextureFormat.Depth16, GlTextureType.Quad)
    );
    this.directionalShadowPainter = new SingularPainter(
      loadShadowDirectional(runtime)
    );
    this.directionalShadowProjectionMatrix = Matrix4.fromOrthographic(
      -10,
      10,
      -10,
      10,
      -10,
      20
    );
    this.directionalShadowTargets = directionalShadowTargets;
    this.lightPainter = new SingularPainter(
      loadLight(runtime, materialConfiguration, lightConfiguration)
    );
    this.maxDirectionalLights = maxDirectionalLights;
    this.maxPointLights = maxPointLights;
    this.pointShadowBuffers = pointShadowTargets.map((target) =>
      target.setupDepthTexture(GlTextureFormat.Depth16, GlTextureType.Quad)
    );
    this.pointShadowPainter = new SingularPainter(loadShadowPoint(runtime));
    this.pointShadowProjectionMatrix = Matrix4.fromPerspective(
      Math.PI * 0.5,
      targetWidth / targetHeight,
      0.1,
      100
    );
    this.pointShadowTargets = pointShadowTargets;
    this.runtime = runtime;
  }

  public dispose() {}

  public render(
    target: GlTarget,
    scene: GlScene<SceneState, ForwardLightingObject>
  ) {
    const { objects, state } = scene;

    const directionalLights = state.directionalLights || [];
    const gl = this.runtime.context;
    const pointLights = state.pointLights || [];

    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    // Create list of opaque objects
    const obstacles: GlObject<GlPolygon>[] = [];

    for (const { matrix, model, noShadow } of objects) {
      if (!noShadow) {
        obstacles.push({ matrix, model });
      }
    }

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

      const viewMatrix = Matrix4.fromCustom(
        ["translate", { x: 0, y: 0, z: -10 }],
        [
          "multiply",
          Matrix4.fromDirection(shadowDirection, { x: 0, y: 1, z: 0 }),
        ]
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
          viewMatrix,
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

    this.lightPainter.paint(target, objects, state.viewMatrix, {
      ambientLightColor: state.ambientLightColor ?? Vector3.zero,
      directionalLights: directionalLightStates,
      environmentLight: state.environmentLight,
      pointLights,
      projectionMatrix: state.projectionMatrix,
      shadowProjectionMatrix: this.directionalShadowProjectionMatrix,
      viewMatrix: state.viewMatrix,
    });
  }

  public resize(_width: number, _height: number) {}
}

export {
  type ForwardLightingConfiguration,
  type ForwardLightingObject,
  type SceneState,
  ForwardLightingLightModel,
  ForwardLightingRenderer,
};
