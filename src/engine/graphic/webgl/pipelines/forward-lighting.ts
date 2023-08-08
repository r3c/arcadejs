import { range } from "../../../language/functional";
import {
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
import * as normal from "./snippets/normal";
import * as parallax from "./snippets/parallax";
import * as pbr from "./snippets/pbr";
import * as phong from "./snippets/phong";
import * as rgb from "./snippets/rgb";
import { Vector3 } from "../../../math/vector";
import {
  GlDirectionalLight,
  GlPainter,
  GlPipeline,
  GlPointLight,
  GlScene,
  GlShader,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  GlTransform,
  uniform,
} from "../../webgl";

type ForwardLightingConfiguration = {
  light?: LightConfiguration;
  material?: MaterialConfiguration;
};

enum ForwardLightingModel {
  None,
  Phong,
  Physical,
}

interface DirectionalLight extends GlDirectionalLight {
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
  pointLights: GlPointLight[]; // FIXME: extend PointLight with extra properties
  projectionMatrix: Matrix4;
  shadowProjectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

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

${rgb.linearToStandardDeclare()}
${rgb.standardToLinearDeclare()}

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

${normal.perturbDeclare("normalMap")}
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
	color = mix(color, color * texture(occlusionMap, coordParallax).r, occlusionStrength);

	// Apply emissive component
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
  gl: WebGL2RenderingContext,
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
      if (!lightConfiguration.modelPhysicalNoIBL) {
        directives.push({ name: "LIGHT_MODEL_PBR_IBL", value: 1 });
      }

      directives.push({
        name: "LIGHT_AMBIENT",
        value: lightConfiguration.modelPhysicalNoAmbient ? 0 : 1,
      });

      break;
  }

  if (!lightConfiguration.noShadow) {
    directives.push({ name: "HAS_SHADOW", value: 1 });
  }

  const shader = new GlShader<LightState>(
    gl,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  // Bind geometry attributes
  shader.setAttributePerPolygon("coords", ({ coords }) => coords);
  shader.setAttributePerPolygon("normals", ({ normals }) => normals);
  shader.setAttributePerPolygon("points", ({ points }) => points);
  shader.setAttributePerPolygon("tangents", ({ tangents }) => tangents);

  // Bind matrix uniforms
  shader.setUniformPerMesh(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerMesh(
    "normalMatrix",
    uniform.numberMatrix3(({ normalMatrix }) => normalMatrix)
  );
  shader.setUniformPerTarget(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerTarget(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  if (!lightConfiguration.noShadow) {
    shader.setUniformPerTarget(
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
    case ForwardLightingModel.Phong:
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

    case ForwardLightingModel.Physical:
      if (!lightConfiguration.modelPhysicalNoIBL) {
        shader.setUniformPerTarget(
          "environmentBrdfMap",
          uniform.blackQuadTexture(
            ({ environmentLight }) => environmentLight?.brdf
          )
        );
        shader.setUniformPerTarget(
          "environmentDiffuseMap",
          uniform.cubeTexture(
            ({ environmentLight }) => environmentLight?.diffuse
          )
        );
        shader.setUniformPerTarget(
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

  shader.setUniformPerTarget(
    "ambientLightColor",
    uniform.numberVector3(({ ambientLightColor }) => ambientLightColor)
  );

  for (let i = 0; i < maxDirectionalLights; ++i) {
    const index = i;

    if (!lightConfiguration.noShadow) {
      shader.setUniformPerTarget(
        `directionalLights[${index}].castShadow`,
        uniform.booleanScalar(
          (state) =>
            index < state.directionalLights.length &&
            state.directionalLights[index].shadow
        )
      );
      shader.setUniformPerTarget(
        `directionalLights[${index}].shadowViewMatrix`,
        uniform.numberMatrix4(({ directionalLights }) =>
          index < directionalLights.length
            ? directionalLights[index].shadowViewMatrix
            : Matrix4.fromIdentity()
        )
      );
      shader.setUniformPerTarget(
        `directionalLightShadowMaps[${index}]`,
        uniform.blackQuadTexture(
          ({ directionalLights }) => directionalLights[index].shadowMap
        )
      );
    }

    shader.setUniformPerTarget(
      `directionalLights[${i}].color`,
      uniform.numberVector3(({ directionalLights }) =>
        index < directionalLights.length
          ? directionalLights[index].color
          : defaultColor
      )
    );
    shader.setUniformPerTarget(
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

    shader.setUniformPerTarget(
      `pointLights[${i}].color`,
      uniform.numberVector3(({ pointLights }) =>
        index < pointLights.length ? pointLights[index].color : defaultColor
      )
    );
    shader.setUniformPerTarget(
      `pointLights[${i}].position`,
      uniform.numberVector3(({ pointLights }) =>
        index < pointLights.length
          ? pointLights[index].position
          : defaultPosition
      )
    );
    shader.setUniformPerTarget(
      `pointLights[${i}].radius`,
      uniform.numberScalar(({ pointLights }) =>
        index < pointLights.length ? pointLights[index].radius : 0
      )
    );
  }

  return shader;
};

const loadShadowDirectional = (gl: WebGL2RenderingContext) => {
  const shader = new GlShader<ShadowState>(
    gl,
    shadowDirectionalVertexShader,
    shadowDirectionalFragmentShader
  );

  shader.setAttributePerPolygon("points", (geometry) => geometry.points);
  shader.setUniformPerMesh(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerTarget(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerTarget(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  return shader;
};

const loadShadowPoint = (gl: WebGL2RenderingContext) => {
  // Not implemented
  return new GlShader<ShadowState>(
    gl,
    shadowDirectionalVertexShader,
    shadowDirectionalFragmentShader
  );
};

class ForwardLightingPipeline implements GlPipeline {
  public readonly directionalShadowBuffers: WebGLTexture[];
  public readonly pointShadowBuffers: WebGLTexture[];

  private readonly directionalShadowPainter: GlPainter<ShadowState>;
  private readonly directionalShadowProjectionMatrix: Matrix4;
  private readonly directionalShadowTargets: GlTarget[];
  private readonly gl: WebGL2RenderingContext;
  private readonly lightPainter: GlPainter<LightState>;
  private readonly maxDirectionalLights: number;
  private readonly maxPointLights: number;
  private readonly pointShadowPainter: GlPainter<ShadowState>;
  private readonly pointShadowProjectionMatrix: Matrix4;
  private readonly pointShadowTargets: GlTarget[];

  public constructor(
    gl: WebGL2RenderingContext,
    configuration: ForwardLightingConfiguration
  ) {
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
      loadShadowDirectional(gl)
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
    this.gl = gl;
    this.lightPainter = new SingularPainter(
      loadLight(gl, materialConfiguration, lightConfiguration)
    );
    this.maxDirectionalLights = maxDirectionalLights;
    this.maxPointLights = maxPointLights;
    this.pointShadowBuffers = pointShadowTargets.map((target) =>
      target.setupDepthTexture(GlTextureFormat.Depth16, GlTextureType.Quad)
    );
    this.pointShadowPainter = new SingularPainter(loadShadowPoint(gl));
    this.pointShadowProjectionMatrix = Matrix4.fromPerspective(
      Math.PI * 0.5,
      targetWidth / targetHeight,
      0.1,
      100
    );
    this.pointShadowTargets = pointShadowTargets;
  }

  public process(target: GlTarget, transform: GlTransform, scene: GlScene) {
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
      ambientLightColor: scene.ambientLightColor ?? Vector3.zero,
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
