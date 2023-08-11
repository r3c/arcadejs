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
import { model as billboardModel } from "./resources/billboard";
import { model as quadModel } from "./resources/quad";
import * as shininess from "./snippets/shininess";
import { Vector2, Vector3 } from "../../../math/vector";
import {
  GlModel,
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
  GlPolygon,
} from "../../webgl";

const enum DeferredShadingLightModel {
  None,
  Phong,
}

const enum DeferredShadingLightType {
  Directional,
  Point,
}

const geometryVertexShader = `
in vec2 coords;
in vec3 normals;
in vec3 points;
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
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(points, 1.0);

	coord = coords;
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

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
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

uniform ${sourceTypeDirectional} directionalLight;
uniform ${sourceTypePoint} pointLight;`;

const lightVertexShader = `
${lightHeaderShader}

uniform mat4 billboardMatrix;
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec4 points;

#if LIGHT_TYPE == ${DeferredShadingLightType.Directional}
out vec3 lightDistanceCamera;
#elif LIGHT_TYPE == ${DeferredShadingLightType.Point}
out vec3 lightPositionCamera;
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
		lightPositionCamera = toCameraPosition(pointLight.position);
	#endif

	gl_Position =
		projectionMatrix * viewMatrix * modelMatrix * points +
		projectionMatrix * billboardMatrix * modelMatrix * vec4(coords, 0.0, 0.0);
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

type PointLightState = LightState & {
  pointLight: PointLight;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  pointLights?: PointLight[];
};

const loadAmbientShader = (
  runtime: GlRuntime,
  configuration: Configuration
): GlShader<AmbientLightState, GlPolygon> => {
  // Build directives from configuration
  const directives = [];

  switch (configuration.lightModel) {
    case DeferredShadingLightModel.Phong:
      directives.push({
        name: "LIGHT_MODEL_AMBIENT",
        value: configuration.lightModelPhongNoAmbient ? 0 : 1,
      });

      break;
  }

  // Setup light shader
  const shader = new GlShader<AmbientLightState, GlPolygon>(
    runtime,
    ambientVertexShader,
    ambientFragmentShader,
    directives
  );

  shader.setAttributePerPolygon("points", ({ points }) => points);

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
    []
  );

  shader.setAttributePerPolygon("coords", ({ coords }) => coords);
  shader.setAttributePerPolygon("normals", ({ normals }) => normals);
  shader.setAttributePerPolygon("points", ({ points }) => points);
  shader.setAttributePerPolygon("tangents", ({ tangents }) => tangents);

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
): GlShader<TSceneState, GlPolygon> => {
  // Build directives from configuration
  const directives = [{ name: "LIGHT_TYPE", value: type }];

  switch (configuration.lightModel) {
    case DeferredShadingLightModel.Phong:
      directives.push({
        name: "LIGHT_MODEL_PHONG_DIFFUSE",
        value: configuration.lightModelPhongNoDiffuse ? 0 : 1,
      });
      directives.push({
        name: "LIGHT_MODEL_PHONG_SPECULAR",
        value: configuration.lightModelPhongNoSpecular ? 0 : 1,
      });

      break;
  }

  // Setup light shader
  const shader = new GlShader<TSceneState, GlPolygon>(
    runtime,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  shader.setAttributePerPolygon("coords", ({ coords }) => coords);
  shader.setAttributePerPolygon("points", ({ points }) => points);

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
  const shader = loadLightShader<PointLightState>(
    runtime,
    configuration,
    DeferredShadingLightType.Point
  );

  shader.setUniformPerScene(
    "pointLight.color",
    uniform.numberVector3(({ pointLight }) => pointLight.color)
  );
  shader.setUniformPerScene(
    "pointLight.position",
    uniform.numberVector3(({ pointLight }) => pointLight.position)
  );
  shader.setUniformPerScene(
    "pointLight.radius",
    uniform.numberScalar(({ pointLight }) => pointLight.radius)
  );

  return shader;
};

class DeferredShadingRenderer
  implements GlRenderer<SceneState, GlObject<GlPolygon>>
{
  public readonly albedoAndShininessBuffer: WebGLTexture;
  public readonly depthBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly ambientLightPainter: GlPainter<AmbientLightState, GlPolygon>;
  private readonly directionalLightPainter: GlPainter<
    DirectionalLightState,
    GlPolygon
  >;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State, GlPolygon>;
  private readonly geometryTarget: GlTarget;
  private readonly billboardModel: GlModel<GlPolygon>;
  private readonly pointLightPainter: GlPainter<PointLightState, GlPolygon>;
  private readonly quadModel: GlModel<GlPolygon>;
  private readonly runtime: GlRuntime;

  public constructor(runtime: GlRuntime, configuration: Configuration) {
    const gl = runtime.context;
    const geometry = new GlTarget(
      gl,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight
    );

    this.albedoAndShininessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.ambientLightPainter = new SingularPainter(
      loadAmbientShader(runtime, configuration)
    );
    this.billboardModel = loadModel(runtime, billboardModel);
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
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.pointLightPainter = new SingularPainter(
      loadPointLightShader(runtime, configuration)
    );
    this.quadModel = loadModel(runtime, quadModel);
    this.runtime = runtime;
  }

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

    // Build billboard matrix from view matrix to get camera-facing quads
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
      const objects: GlObject<GlPolygon>[] = [
        {
          matrix: Matrix4.identity,
          model: this.quadModel,
        },
      ];

      this.ambientLightPainter.paint(target, objects, state.viewMatrix, {
        albedoAndShininessBuffer: this.albedoAndShininessBuffer,
        ambientLightColor: state.ambientLightColor,
        projectionMatrix: this.fullscreenProjection,
        viewMatrix: Matrix4.identity,
      });
    }

    // Draw directional lights using fullscreen quads
    if (state.directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const objectMatrix = Matrix4.fromObject(state.viewMatrix);

      objectMatrix.invert();

      const objects: GlObject<GlPolygon>[] = [
        {
          matrix: objectMatrix,
          model: this.quadModel,
        },
      ];

      for (const directionalLight of state.directionalLights) {
        this.directionalLightPainter.paint(target, objects, state.viewMatrix, {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          depthBuffer: this.depthBuffer,
          directionalLight,
          normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
          projectionMatrix: this.fullscreenProjection,
          viewMatrix: state.viewMatrix,
          viewportSize,
          billboardMatrix: Matrix4.identity, // FIXME: unused
        });
      }
    }

    // Draw point lights using quads
    if (state.pointLights !== undefined) {
      const pointLightObject: GlObject<GlPolygon> = {
        matrix: Matrix4.identity,
        model: this.billboardModel,
      };
      const objects = [pointLightObject];

      for (const pointLight of state.pointLights) {
        const { position, radius } = pointLight;

        pointLightObject.matrix = Matrix4.fromCustom(
          ["translate", position],
          ["scale", { x: radius, y: radius, z: radius }]
        );

        this.pointLightPainter.paint(target, objects, state.viewMatrix, {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          billboardMatrix,
          depthBuffer: this.depthBuffer,
          normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
          pointLight,
          projectionMatrix: state.projectionMatrix,
          viewMatrix: state.viewMatrix,
          viewportSize,
        });
      }
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
