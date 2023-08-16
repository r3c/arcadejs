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
import { model as quadModel } from "./resources/quad";
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
  loadModel,
  uniform,
  GlShaderDirective,
  directive,
} from "../../webgl";
import {
  GlLightBillboard,
  GlLightPolygon,
  pointLightBillboard,
} from "./objects/billboard";
import { GlPolygon } from "./objects/polygon";

const enum DeferredShadingLightModel {
  None,
  Phong,
}

const enum DeferredShadingLightType {
  Directional,
  Point,
}

const geometryVertexShader = `
in vec2 coordinate;
in vec3 normals; // FIXME: remove plural
in vec3 position;
in vec3 tangents;

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

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
uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D glossinessMap;
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

layout(location=0) out vec4 albedoAndShininess;
layout(location=1) out vec4 normalAndGlossiness;

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

	// Color target 1: [albedo.rgb, shininess]
	vec3 albedo = albedoFactor.rgb * texture(albedoMap, coordParallax).rgb;
	float shininessPack = ${shininess.encodeInvoke("shininess")};

	albedoAndShininess = vec4(albedo, shininessPack);

	// Color target 2: [normal.pp, zero, glossiness]
	vec3 normalModified = ${normal.perturbInvoke("coordParallax", "t", "b", "n")};
	vec2 normalPack = ${normal.encodeInvoke("normalModified")};

	float glossiness = texture(glossinessMap, coordParallax).r;
	float unused = 0.0;

	normalAndGlossiness = vec4(normalPack, unused, glossiness);
}`;

const ambientHeaderShader = `
uniform vec3 ambientLightColor;`;

const ambientVertexShader = `
${ambientHeaderShader}

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 position;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * position;
}`;

const ambientFragmentShader = `
${ambientHeaderShader}

uniform sampler2D albedoAndShininess;

layout(location=0) out vec4 fragColor;

void main(void) {
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

	// Read samples from texture buffers
	vec4 albedoAndShininessSample = texelFetch(albedoAndShininess, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 materialAlbedo = albedoAndShininessSample.rgb;

	fragColor = vec4(ambientLightColor * materialAlbedo * float(LIGHT_MODEL_AMBIENT), 1.0);
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
in vec2 lightCorner;
in vec3 lightPosition;
in float lightRadius;

#if LIGHT_TYPE == ${DeferredShadingLightType.Directional}
out vec3 lightDistanceCamera;
#elif LIGHT_TYPE == ${DeferredShadingLightType.Point}
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
	#if LIGHT_TYPE == ${DeferredShadingLightType.Directional}
		lightDistanceCamera = toCameraDirection(directionalLight.direction);
	#elif LIGHT_TYPE == ${DeferredShadingLightType.Point}
		lightPositionCamera = toCameraPosition(lightPosition);
    pointLightColor = lightColor;
    pointLightPosition = lightPosition;
    pointLightRadius = lightRadius;
	#endif

	gl_Position =
		projectionMatrix * viewMatrix * modelMatrix * vec4(lightPosition, 1.0) +
		projectionMatrix * billboardMatrix * modelMatrix * vec4(lightCorner, 0.0, 0.0);
}`;

const lightFragmentShader = `
${lightHeaderShader}

uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndGlossiness;

${normal.decodeDeclare()}
${phong.lightDeclare("LIGHT_MODEL_PHONG_DIFFUSE", "LIGHT_MODEL_PHONG_SPECULAR")}
${shininess.decodeDeclare()}

#if LIGHT_TYPE == ${DeferredShadingLightType.Directional}
in vec3 lightDistanceCamera;
#elif LIGHT_TYPE == ${DeferredShadingLightType.Point}
in vec3 lightPositionCamera;
in vec3 pointLightColor;
in vec3 pointLightPosition;
in float pointLightRadius;
#endif

layout(location=0) out vec4 fragColor;

vec3 getPoint(in float depthClip) {
	vec4 pointClip = vec4(gl_FragCoord.xy / viewportSize, depthClip, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

	// Read samples from texture buffers
	vec4 albedoAndShininessSample = texelFetch(albedoAndShininess, bufferCoord, 0);
	vec4 depthSample = texelFetch(depth, bufferCoord, 0);
	vec4 normalAndGlossinessSample = texelFetch(normalAndGlossiness, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;
	vec3 normal = ${normal.decodeInvoke("normalAndGlossinessSample.rg")};
	float glossiness = normalAndGlossinessSample.a;
	float shininess = ${shininess.decodeInvoke("albedoAndShininessSample.a")};

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(depthSample.r);
	vec3 eyeDirection = normalize(-point);

	// Compute lightning
	#if LIGHT_TYPE == ${DeferredShadingLightType.Directional}
		${sourceTypeResult} light = ${sourceInvokeDirectional(
  "directionalLight",
  "lightDistanceCamera"
)};
	#elif LIGHT_TYPE == ${DeferredShadingLightType.Point}
    ${sourceTypePoint} pointLight = ${sourceTypePoint}(pointLightColor, pointLightPosition, pointLightRadius);
		${sourceTypeResult} light = ${sourceInvokePoint(
  "pointLight",
  "lightPositionCamera - point"
)};
	#endif

	vec3 color = ${phong.lightInvoke(
    "light",
    "albedo",
    "glossiness",
    "shininess",
    "normal",
    "eyeDirection"
  )};

	fragColor = vec4(color, 1.0);
}`;

type Configuration = {
  lightModel: DeferredShadingLightModel;
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

type AmbientLightPolygon = Pick<GlPolygon, "position">;

type AmbientLightState = State & {
  albedoAndShininessBuffer: WebGLTexture;
  ambientLightColor: Vector3;
};

type LightState = State & {
  albedoAndShininessBuffer: WebGLTexture;
  billboardMatrix: Matrix4;
  depthBuffer: WebGLTexture;
  normalAndGlossinessBuffer: WebGLTexture;
  viewportSize: Vector2;
};

type DirectionalLightState = LightState & {
  directionalLight: DirectionalLight;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  pointLights?: PointLight[];
};

const loadAmbientShader = (
  runtime: GlRuntime,
  configuration: Configuration
): GlShader<AmbientLightState, AmbientLightPolygon> => {
  // Build directives from configuration
  const directives: GlShaderDirective = {};

  switch (configuration.lightModel) {
    case DeferredShadingLightModel.Phong:
      directives["LIGHT_MODEL_AMBIENT"] = directive.boolean(
        !configuration.lightModelPhongNoAmbient
      );

      break;
  }

  // Setup light shader
  const shader = new GlShader<AmbientLightState, AmbientLightPolygon>(
    runtime,
    ambientVertexShader,
    ambientFragmentShader,
    directives
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

  shader.setUniformPerScene(
    "albedoAndShininess",
    uniform.blackQuadTexture((state) => state.albedoAndShininessBuffer)
  );
  shader.setUniformPerScene(
    "ambientLightColor",
    uniform.numberVector3(({ ambientLightColor }) => ambientLightColor)
  );

  return shader;
};

const loadGeometryShader = (
  runtime: GlRuntime,
  configuration: Configuration
): GlShader<State, GlPolygon> => {
  // Setup geometry shader
  const shader = new GlShader<State, GlPolygon>(
    runtime,
    geometryVertexShader,
    geometryFragmentShader,
    {}
  );

  shader.setAttributePerPolygon("coordinate", ({ coordinate }) => coordinate);
  shader.setAttributePerPolygon("normals", ({ normal }) => normal); // FIXME: remove plural
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

  shader.setUniformPerMaterial(
    "albedoFactor",
    uniform.numberArray4(({ albedoFactor }) => albedoFactor)
  );
  shader.setUniformPerMaterial(
    "albedoMap",
    uniform.whiteQuadTexture(({ albedoMap }) => albedoMap)
  );

  if (configuration.lightModel === DeferredShadingLightModel.Phong) {
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

  if (configuration.useNormalMap)
    shader.setUniformPerMaterial(
      "normalMap",
      uniform.blackQuadTexture(({ normalMap }) => normalMap)
    );

  return shader;
};

const loadLightShader = <TSceneState extends LightState>(
  runtime: GlRuntime,
  configuration: Configuration,
  type: DeferredShadingLightType
): GlShader<TSceneState, GlLightPolygon> => {
  // Build directives from configuration
  const directives: GlShaderDirective = {
    LIGHT_TYPE: directive.number(type),
  };

  switch (configuration.lightModel) {
    case DeferredShadingLightModel.Phong:
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = directive.boolean(
        !configuration.lightModelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = directive.boolean(
        !configuration.lightModelPhongNoSpecular
      );

      break;
  }

  // Setup light shader
  const shader = new GlShader<TSceneState, GlLightPolygon>(
    runtime,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  if (type === DeferredShadingLightType.Point) {
    shader.setAttributePerPolygon("lightColor", (p) => p.lightColor);
    shader.setAttributePerPolygon("lightCorner", (p) => p.lightCorner);
    shader.setAttributePerPolygon("lightPosition", (p) => p.lightPosition);
    shader.setAttributePerPolygon("lightRadius", (p) => p.lightRadius);
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
    "albedoAndShininess",
    uniform.blackQuadTexture((state) => state.albedoAndShininessBuffer)
  );
  shader.setUniformPerScene(
    "depth",
    uniform.blackQuadTexture(({ depthBuffer }) => depthBuffer)
  );
  shader.setUniformPerScene(
    "normalAndGlossiness",
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
    DeferredShadingLightType.Directional
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
    DeferredShadingLightType.Point
  );

  return shader;
};

class DeferredShadingRenderer
  implements GlRenderer<SceneState, GlObject<GlPolygon>>
{
  public readonly albedoAndShininessBuffer: WebGLTexture;
  public readonly depthBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly ambientLightPainter: GlPainter<
    AmbientLightState,
    AmbientLightPolygon
  >;
  private readonly ambientLightObjects: GlObject<AmbientLightPolygon>[];
  private readonly directionalLightPainter: GlPainter<
    DirectionalLightState,
    GlLightPolygon
  >;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State, GlPolygon>;
  private readonly geometryTarget: GlTarget;
  private readonly lightBillboard: GlLightBillboard;
  private readonly lightObjects: GlObject<GlLightPolygon>[];
  private readonly pointLightPainter: GlPainter<LightState, GlLightPolygon>;
  private readonly runtime: GlRuntime;

  public constructor(runtime: GlRuntime, configuration: Configuration) {
    const gl = runtime.context;
    const geometry = new GlTarget(
      gl,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight
    );
    const quad = loadModel(runtime, quadModel);

    this.albedoAndShininessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.ambientLightPainter = new SingularPainter(
      loadAmbientShader(runtime, configuration)
    );
    this.ambientLightObjects = [{ matrix: Matrix4.identity, model: quad }];
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
    this.lightObjects = [
      { matrix: Matrix4.identity, model: this.lightBillboard.model },
    ];
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.pointLightPainter = new SingularPainter(
      loadPointLightShader(runtime, configuration)
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

    // Draw scene geometries
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.disable(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.geometryTarget.clear(0);
    this.geometryPainter.paint(
      this.geometryTarget,
      objects,
      state.viewMatrix,
      state
    );

    // Draw scene lights
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Draw ambient light using fullscreen quad
    if (state.ambientLightColor !== undefined) {
      this.ambientLightPainter.paint(
        target,
        this.ambientLightObjects,
        state.viewMatrix,
        {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          ambientLightColor: state.ambientLightColor,
          projectionMatrix: this.fullscreenProjection,
          viewMatrix: Matrix4.identity,
        }
      );
    }

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
          target,
          this.lightObjects,
          state.viewMatrix,
          {
            albedoAndShininessBuffer: this.albedoAndShininessBuffer,
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
        target,
        this.lightObjects,
        state.viewMatrix,
        {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          billboardMatrix,
          depthBuffer: this.depthBuffer,
          normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
          projectionMatrix: state.projectionMatrix,
          viewMatrix: state.viewMatrix,
          viewportSize,
        }
      );
    }
  }

  public resize(width: number, height: number) {
    this.geometryTarget.resize(width, height);
  }
}

export {
  type Configuration,
  type SceneState,
  DeferredShadingLightModel,
  DeferredShadingRenderer,
};
