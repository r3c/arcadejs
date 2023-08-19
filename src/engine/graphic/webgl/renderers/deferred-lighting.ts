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
import { Matrix4 } from "../../../math/matrix";
import * as normal from "./snippets/normal";
import { SingularPainter } from "../painters/singular";
import * as parallax from "./snippets/parallax";
import * as phong from "./snippets/phong";
import {
  linearToStandardDeclare,
  linearToStandardInvoke,
  standardToLinearDeclare,
  standardToLinearInvoke,
} from "./snippets/rgb";
import * as shininess from "./snippets/shininess";
import { Vector2, Vector3 } from "../../../math/vector";
import {
  GlPainter,
  GlRenderer,
  GlRuntime,
  GlScene,
  GlShader,
  GlObject,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  uniform,
  GlShaderDirective,
  directive,
  GlTexture,
} from "../../webgl";
import {
  GlLightBillboard,
  GlLightPolygon,
  pointLightBillboard,
} from "./objects/billboard";
import { GlPolygon } from "./objects/polygon";

const enum DeferredLightingLightModel {
  None,
  Phong,
}

const enum DeferredLightingLightType {
  Directional,
  Point,
}

const geometryVertexShader = `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coordinate;
in vec3 normals;
in vec3 position;
in vec3 tangents;

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coord; // Texture coordinate
out vec3 normal; // Normal at point in camera space
out vec3 point; // Point position in camera space
out vec3 tangent; // Tangent at point in camera space

void main(void) {
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(position, 1.0);

	coord = coordinate;
	normal = normalize(normalMatrix * normals);
	point = pointCamera.xyz;
	tangent = normalize(normalMatrix * tangents);

	bitangent = cross(normal, tangent);

	gl_Position = projectionMatrix * pointCamera;
}`;

const geometryFragmentShader = `
uniform sampler2D glossinessMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D normalMap;
uniform float shininess;

${normal.encodeDeclare()}
${normal.perturbDeclare("normalMap")}
${parallax.perturbDeclare("heightMap")}
${shininess.encodeDeclare()}

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 normalAndGlossiness;

void main(void) {
	vec3 t = normalize(tangent);
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);

	vec3 eyeDirection = normalize(-point);
	vec2 coordParallax = ${parallax.perturbInvoke(
    "coord",
    "eyeDirection",
    "heightParallaxScale",
    "heightParallaxBias",
    "t",
    "b",
    "n"
  )};

	// Color target: [normal, normal, shininess, glossiness]
	vec3 normalModified = ${normal.perturbInvoke("coordParallax", "t", "b", "n")};
	vec2 normalPack = ${normal.encodeInvoke("normalModified")};

	float glossiness = texture(glossinessMap, coordParallax).r;
	float shininessPack = ${shininess.encodeInvoke("shininess")};

	normalAndGlossiness = vec4(normalPack, shininessPack, glossiness);
}`;

const lightHeaderShader = `
${sourceDeclare("HAS_SHADOW")}

uniform ${sourceTypeDirectional} directionalLight;`;

const lightVertexShader = `
${lightHeaderShader}

uniform mat4 billboardMatrix;
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec3 lightColor;
in vec3 lightPosition;
in float lightRadius;
in vec3 lightShift;

#if LIGHT_TYPE == ${DeferredLightingLightType.Directional}
out vec3 lightDistanceCamera;
#elif LIGHT_TYPE == ${DeferredLightingLightType.Point}
out vec3 lightPositionCamera;
out vec3 pointLightColor;
out vec3 pointLightPosition;
out float pointLightRadius;
#endif

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	#if LIGHT_TYPE == ${DeferredLightingLightType.Directional}
		lightDistanceCamera = toCameraDirection(directionalLight.direction);
	#elif LIGHT_TYPE == ${DeferredLightingLightType.Point}
		lightPositionCamera = toCameraPosition(lightPosition);
    pointLightColor = lightColor;
    pointLightPosition = lightPosition;
    pointLightRadius = lightRadius;
	#endif

	gl_Position =
		projectionMatrix * viewMatrix * modelMatrix * vec4(lightPosition, 1.0) +
		projectionMatrix * billboardMatrix * modelMatrix * vec4(lightShift, 0.0);
}`;

const lightFragmentShader = `
${lightHeaderShader}

#define ZERO 0

uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D depthBuffer;
uniform sampler2D normalAndGlossinessBuffer;

${normal.decodeDeclare()}
${phong.lightDeclare("ZERO", "ZERO")}
${shininess.decodeDeclare()}

#if LIGHT_TYPE == ${DeferredLightingLightType.Directional}
in vec3 lightDistanceCamera;
#elif LIGHT_TYPE == ${DeferredLightingLightType.Point}
in vec3 lightPositionCamera;
in vec3 pointLightColor;
in vec3 pointLightPosition;
in float pointLightRadius;
#endif

layout(location=0) out vec4 fragColor;

vec3 getPoint(in vec2 fragCoord, in float fragDepth) {
	vec4 pointClip = vec4(fragCoord, fragDepth, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

	// Read samples from texture buffers
	vec4 normalAndGlossinessSample = texelFetch(normalAndGlossinessBuffer, bufferCoord, 0);
	vec4 depthSample = texelFetch(depthBuffer, bufferCoord, 0);

	// Decode geometry
	vec3 normal = ${normal.decodeInvoke("normalAndGlossinessSample.rg")};

	// Decode material properties
	float glossiness = normalAndGlossinessSample.a;
	float shininess = ${shininess.decodeInvoke("normalAndGlossinessSample.b")};

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(gl_FragCoord.xy / viewportSize, depthSample.r);
	vec3 eyeDirection = normalize(-point);

	// Compute lightning parameters
	#if LIGHT_TYPE == ${DeferredLightingLightType.Directional}
		${sourceTypeResult} light = ${sourceInvokeDirectional(
  "directionalLight",
  "lightDistanceCamera"
)};
	#elif LIGHT_TYPE == ${DeferredLightingLightType.Point}
    ${sourceTypePoint} pointLight = ${sourceTypePoint}(pointLightColor, pointLightPosition, pointLightRadius);
		${sourceTypeResult} light = ${sourceInvokePoint(
  "pointLight",
  "lightPositionCamera - point"
)};
	#endif

	float lightDiffusePower = ${phong.lightInvokeDiffusePower("light", "normal")};
	float lightSpecularPower = ${phong.lightInvokeSpecularPower(
    "light",
    "glossiness",
    "shininess",
    "normal",
    "eyeDirection"
  )};

	// Emit lighting parameters
	// FIXME: duplicate of "phong.lightInvoke" code
	fragColor = exp2(-vec4(lightDiffusePower * light.color, lightSpecularPower) * light.power);
}`;

const materialVertexShader = `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coordinate;
in vec3 normals;
in vec3 position;
in vec3 tangents;

out vec3 bitangent;
out vec2 coord;
out vec3 normal;
out vec3 point;
out vec3 tangent;

void main(void) {
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(position, 1.0);

	normal = normalize(normalMatrix * normals);
	tangent = normalize(normalMatrix * tangents);

	bitangent = cross(normal, tangent);
	coord = coordinate;
	point = pointCamera.xyz;

	gl_Position = projectionMatrix * pointCamera;
}`;

const materialFragmentShader = `
uniform vec3 ambientLightColor;
uniform sampler2D lightBuffer;

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform float glossinessFactor;
uniform sampler2D glossinessMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;

${parallax.perturbDeclare("heightMap")}
${linearToStandardDeclare()}
${standardToLinearDeclare()}

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 fragColor;

void main(void) {
	// Read light properties from texture buffers
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);
	vec4 lightSample = -log2(texelFetch(lightBuffer, bufferCoord, 0));

	vec3 ambientLight = ambientLightColor * float(LIGHT_MODEL_AMBIENT);
	vec3 diffuseLight = lightSample.rgb * float(LIGHT_MODEL_PHONG_DIFFUSE);
	vec3 specularLight = lightSample.rgb * lightSample.a * float(LIGHT_MODEL_PHONG_SPECULAR); // FIXME: not accurate, depends on diffuse RGB instead of specular RGB

	// Read material properties from uniforms
	vec3 t = normalize(tangent);
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);

	vec3 eyeDirection = normalize(-point);
	vec2 coordParallax = ${parallax.perturbInvoke(
    "coord",
    "eyeDirection",
    "heightParallaxScale",
    "heightParallaxBias",
    "t",
    "b",
    "n"
  )};

	vec3 albedo = albedoFactor.rgb * ${standardToLinearInvoke(
    "texture(albedoMap, coordParallax).rgb"
  )};
	float glossiness = glossinessFactor * texture(glossinessMap, coordParallax).r;

	// Emit final fragment color
	// FIXME: duplicate of "phong.lightInvoke" code
	vec3 color = albedo * (ambientLight + diffuseLight) + glossiness * specularLight;

	fragColor = vec4(${linearToStandardInvoke("color")}, 1.0);
}`;

type Configuration = {
  lightModel: DeferredLightingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  useHeightMap: boolean;
  useNormalMap: boolean;
};

type State = {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type LightState = State & {
  billboardMatrix: Matrix4;
  depthBuffer: GlTexture;
  normalAndGlossinessBuffer: GlTexture;
  viewportSize: Vector2;
};

type DirectionalLightState = LightState & {
  directionalLight: DirectionalLight;
};

type MaterialState = State & {
  ambientLightColor: Vector3;
  lightBuffer: GlTexture;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  pointLights?: PointLight[];
};

const loadGeometryShader = (
  runtime: GlRuntime,
  configuration: Configuration
) => {
  const shader = new GlShader<State, GlPolygon>(
    runtime,
    geometryVertexShader,
    geometryFragmentShader,
    {}
  );

  shader.setAttributePerPolygon("coordinate", ({ coordinate }) => coordinate);
  shader.setAttributePerPolygon("normals", ({ normal }) => normal);
  shader.setAttributePerPolygon("position", ({ position }) => position);
  shader.setAttributePerPolygon("tangents", ({ tangent }) => tangent);

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

  if (configuration.lightModel === DeferredLightingLightModel.Phong) {
    shader.setUniformPerMaterial(
      "glossinessMap",
      uniform.blackQuadTexture(({ glossMap }) => glossMap)
    );
    shader.setUniformPerMaterial(
      "shininess",
      uniform.numberScalar(({ shininess }) => shininess)
    );
  }

  if (configuration.useHeightMap) {
    shader.setUniformPerMaterial(
      "heightMap",
      uniform.blackQuadTexture(({ heightMap }) => heightMap)
    );
    shader.setUniformPerMaterial(
      "heightParallaxBias",
      uniform.numberScalar(({ heightParallaxBias }) => heightParallaxBias)
    );
    shader.setUniformPerMaterial(
      "heightParallaxScale",
      uniform.numberScalar(({ heightParallaxScale }) => heightParallaxScale)
    );
  }

  if (configuration.useNormalMap) {
    shader.setUniformPerMaterial(
      "normalMap",
      uniform.blackQuadTexture(({ normalMap }) => normalMap)
    );
  }

  return shader;
};

const loadLightShader = <TSceneState extends LightState>(
  runtime: GlRuntime,
  _: Configuration,
  type: DeferredLightingLightType
) => {
  const directives = {
    LIGHT_TYPE: directive.number(type),
  };

  // Setup light shader
  const shader = new GlShader<TSceneState, GlLightPolygon>(
    runtime,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  if (type === DeferredLightingLightType.Point) {
    shader.setAttributePerPolygon("lightColor", (p) => p.lightColor);
    shader.setAttributePerPolygon("lightPosition", (p) => p.lightPosition);
    shader.setAttributePerPolygon("lightRadius", (p) => p.lightRadius);
    shader.setAttributePerPolygon("lightShift", (p) => p.lightShift);
  }

  shader.setUniformPerScene(
    "billboardMatrix",
    uniform.numberMatrix4(({ billboardMatrix }) => billboardMatrix)
  );
  shader.setUniformPerGeometry(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerScene(
    "inverseProjectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => {
      const inverseProjectionMatrix = Matrix4.fromObject(projectionMatrix);

      inverseProjectionMatrix.invert();

      return inverseProjectionMatrix;
    })
  );
  shader.setUniformPerScene(
    "projectionMatrix",
    uniform.numberMatrix4(({ projectionMatrix }) => projectionMatrix)
  );
  shader.setUniformPerScene(
    "viewMatrix",
    uniform.numberMatrix4(({ viewMatrix }) => viewMatrix)
  );

  shader.setUniformPerScene(
    "viewportSize",
    uniform.numberVector2(({ viewportSize }) => viewportSize)
  );

  shader.setUniformPerScene(
    "depthBuffer",
    uniform.blackQuadTexture(({ depthBuffer }) => depthBuffer)
  );
  shader.setUniformPerScene(
    "normalAndGlossinessBuffer",
    uniform.blackQuadTexture((state) => state.normalAndGlossinessBuffer)
  );

  return shader;
};

const loadDirectionalLightShader = (
  runtime: GlRuntime,
  configuration: Configuration
) => {
  const shader = loadLightShader<DirectionalLightState>(
    runtime,
    configuration,
    DeferredLightingLightType.Directional
  );

  shader.setUniformPerScene(
    "directionalLight.color",
    uniform.numberVector3(({ directionalLight }) => directionalLight.color)
  );
  shader.setUniformPerScene(
    "directionalLight.direction",
    uniform.numberVector3(({ directionalLight }) => directionalLight.direction)
  );

  return shader;
};

const loadPointLightShader = (
  runtime: GlRuntime,
  configuration: Configuration
) => {
  const shader = loadLightShader<LightState>(
    runtime,
    configuration,
    DeferredLightingLightType.Point
  );

  return shader;
};

const loadMaterialShader = (
  runtime: GlRuntime,
  configuration: Configuration
) => {
  // Build directives from configuration
  const directives: GlShaderDirective = {};

  switch (configuration.lightModel) {
    case DeferredLightingLightModel.Phong:
      directives["LIGHT_MODEL_AMBIENT"] = directive.boolean(
        !configuration.lightModelPhongNoAmbient
      );
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = directive.boolean(
        !configuration.lightModelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = directive.boolean(
        !configuration.lightModelPhongNoSpecular
      );

      break;
  }

  // Setup material shader
  const shader = new GlShader<MaterialState, GlPolygon>(
    runtime,
    materialVertexShader,
    materialFragmentShader,
    directives
  );

  shader.setAttributePerPolygon("coordinate", ({ coordinate }) => coordinate);
  shader.setAttributePerPolygon("normals", ({ normal }) => normal);
  shader.setAttributePerPolygon("position", ({ position }) => position);
  shader.setAttributePerPolygon("tangents", ({ tangent }) => tangent);

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

  shader.setUniformPerScene(
    "ambientLightColor",
    uniform.numberVector3(({ ambientLightColor }) => ambientLightColor)
  );
  shader.setUniformPerScene(
    "lightBuffer",
    uniform.blackQuadTexture(({ lightBuffer }) => lightBuffer)
  );

  shader.setUniformPerMaterial(
    "albedoFactor",
    uniform.numberArray4(({ albedoFactor }) => albedoFactor)
  );
  shader.setUniformPerMaterial(
    "albedoMap",
    uniform.whiteQuadTexture(({ albedoMap }) => albedoMap)
  );

  if (configuration.lightModel >= DeferredLightingLightModel.Phong) {
    shader.setUniformPerMaterial(
      "glossinessFactor",
      uniform.numberScalar(({ glossFactor }) => glossFactor[0])
    );
    shader.setUniformPerMaterial(
      "glossinessMap",
      uniform.blackQuadTexture(({ glossMap }) => glossMap)
    );
  }

  if (configuration.useHeightMap) {
    shader.setUniformPerMaterial(
      "heightMap",
      uniform.blackQuadTexture(({ heightMap }) => heightMap)
    );
    shader.setUniformPerMaterial(
      "heightParallaxBias",
      uniform.numberScalar(({ heightParallaxBias }) => heightParallaxBias)
    );
    shader.setUniformPerMaterial(
      "heightParallaxScale",
      uniform.numberScalar(({ heightParallaxScale }) => heightParallaxScale)
    );
  }

  return shader;
};

class DeferredLightingRenderer
  implements GlRenderer<SceneState, GlObject<GlPolygon>>
{
  public readonly depthBuffer: GlTexture;
  public readonly lightBuffer: GlTexture;
  public readonly normalAndGlossinessBuffer: GlTexture;

  private readonly directionalLightPainter: GlPainter<
    DirectionalLightState,
    GlLightPolygon
  >;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State, GlPolygon>;
  private readonly geometryTarget: GlTarget;
  private readonly lightBillboard: GlLightBillboard;
  private readonly lightObjects: GlObject<GlLightPolygon>[];
  private readonly lightTarget: GlTarget;
  private readonly materialPainter: GlPainter<MaterialState, GlPolygon>;
  private readonly pointLightPainter: GlPainter<LightState, GlLightPolygon>;
  private readonly runtime: GlRuntime;

  public constructor(runtime: GlRuntime, configuration: Configuration) {
    const gl = runtime.context;
    const geometry = new GlTarget(
      gl,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight
    );
    const light = new GlTarget(
      gl,
      gl.drawingBufferWidth,
      gl.drawingBufferWidth
    );

    this.depthBuffer = geometry.setupDepthTexture(
      GlTextureFormat.Depth16,
      GlTextureType.Quad
    );
    this.directionalLightPainter = new SingularPainter(
      loadDirectionalLightShader(runtime, configuration)
    );
    this.fullscreenProjection = Matrix4.fromOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = new SingularPainter(
      loadGeometryShader(runtime, configuration)
    );
    this.geometryTarget = geometry;
    this.lightBillboard = pointLightBillboard(gl);
    this.lightBuffer = light.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.lightObjects = [
      { matrix: Matrix4.identity, model: this.lightBillboard.model },
    ];
    this.lightTarget = light;
    this.materialPainter = new SingularPainter(
      loadMaterialShader(runtime, configuration)
    );
    this.pointLightPainter = new SingularPainter(
      loadPointLightShader(runtime, configuration)
    );
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.runtime = runtime;
  }

  public dispose() {}

  public render(
    target: GlTarget,
    scene: GlScene<SceneState, GlObject<GlPolygon>>
  ) {
    const { objects, state } = scene;
    const gl = this.runtime.context;
    const viewportSize = {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    };

    // Build billboard matrix from view matrix to get camera-facing quads by
    // copying view matrix and cancelling any rotation.
    const billboardMatrix = Matrix4.fromObject(state.viewMatrix);

    billboardMatrix.v00 = 1;
    billboardMatrix.v01 = 0;
    billboardMatrix.v02 = 0;
    billboardMatrix.v10 = 0;
    billboardMatrix.v11 = 1;
    billboardMatrix.v12 = 0;
    billboardMatrix.v20 = 0;
    billboardMatrix.v21 = 0;
    billboardMatrix.v22 = 1;

    // Render geometries to geometry buffers
    gl.disable(gl.BLEND);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.geometryTarget.clear(0);
    this.geometryPainter.paint(
      this.geometryTarget,
      objects,
      state.viewMatrix,
      state
    );

    // Render lights to light buffer
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);

    this.lightTarget.setClearColor(1, 1, 1, 1);
    this.lightTarget.clear(0);

    // Draw directional lights using fullscreen quads
    if (state.directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const objectMatrix = Matrix4.fromObject(state.viewMatrix);

      objectMatrix.invert();

      this.lightObjects[0].matrix = objectMatrix;

      for (const directionalLight of state.directionalLights) {
        this.directionalLightPainter.paint(
          this.lightTarget,
          this.lightObjects,
          state.viewMatrix,
          {
            depthBuffer: this.depthBuffer,
            directionalLight,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            projectionMatrix: this.fullscreenProjection,
            viewMatrix: state.viewMatrix,
            viewportSize,
            billboardMatrix: Matrix4.identity, // FIXME: unused
          }
        );
      }
    }

    // Draw point lights using quads
    if (state.pointLights !== undefined) {
      // FIXME: remove when directional light doesn't overwrite this value
      this.lightObjects[0].matrix = Matrix4.identity;
      this.lightBillboard.set(state.pointLights);

      this.pointLightPainter.paint(
        this.lightTarget,
        this.lightObjects,
        state.viewMatrix,
        {
          billboardMatrix,
          depthBuffer: this.depthBuffer,
          normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
          projectionMatrix: state.projectionMatrix,
          viewMatrix: state.viewMatrix,
          viewportSize,
        }
      );
    }

    // Render materials to output
    gl.disable(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.materialPainter.paint(target, objects, state.viewMatrix, {
      ambientLightColor: state.ambientLightColor ?? Vector3.zero,
      lightBuffer: this.lightBuffer,
      projectionMatrix: state.projectionMatrix,
      viewMatrix: state.viewMatrix,
    });
  }

  public resize(width: number, height: number) {
    this.geometryTarget.resize(width, height);
    this.lightTarget.resize(width, height);
  }
}

export {
  type Configuration,
  type SceneState,
  DeferredLightingLightModel,
  DeferredLightingRenderer,
};
