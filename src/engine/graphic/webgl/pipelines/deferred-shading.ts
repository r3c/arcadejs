import * as light from "./snippets/light";
import { Matrix4 } from "../../../math/matrix";
import * as normal from "./snippets/normal";
import { SingularPainter } from "../painters/singular";
import * as parallax from "./snippets/parallax";
import * as phong from "./snippets/phong";
import { mesh as quadModel } from "./resources/quad";
import * as shininess from "./snippets/shininess";
import { mesh as sphereModel } from "./resources/sphere";
import { Vector2, Vector3 } from "../../../math/vector";
import {
  GlDirectionalLight,
  GlModel,
  GlPainter,
  GlPipeline,
  GlPointLight,
  GlRenderer,
  GlScene,
  GlShader,
  GlSubject,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  GlTransform,
  loadModel,
  uniform,
} from "../../webgl";

const enum LightModel {
  None,
  Phong,
}

const enum LightType {
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
${light.sourceDeclare("HAS_SHADOW")}

uniform ${light.sourceTypeDirectional} directionalLight;
uniform ${light.sourceTypePoint} pointLight;`;

const lightVertexShader = `
${lightHeaderShader}

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

out vec3 lightDistanceCamera;
out vec3 lightPositionCamera;

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	#if LIGHT_TYPE == ${LightType.Directional}
		lightDistanceCamera = toCameraDirection(directionalLight.direction);
	#elif LIGHT_TYPE == ${LightType.Point}
		lightPositionCamera = toCameraPosition(pointLight.position);
	#endif

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
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

in vec3 lightDistanceCamera;
in vec3 lightPositionCamera;

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
	#if LIGHT_TYPE == ${LightType.Directional}
		${light.sourceTypeResult} light = ${light.sourceInvokeDirectional(
  "directionalLight",
  "lightDistanceCamera"
)};
	#elif LIGHT_TYPE == ${LightType.Point}
		${light.sourceTypeResult} light = ${light.sourceInvokePoint(
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
  lightModel: LightModel;
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

type AmbientState = State & {
  albedoAndShininessBuffer: WebGLTexture;
  ambientLightColor: Vector3;
};

type LightState<TLight> = State & {
  albedoAndShininessBuffer: WebGLTexture;
  depthBuffer: WebGLTexture;
  light: TLight;
  normalAndGlossinessBuffer: WebGLTexture;
  viewportSize: Vector2;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: GlDirectionalLight[];
  pointLights?: GlPointLight[];
};

const loadAmbient = (renderer: GlRenderer, configuration: Configuration) => {
  // Build directives from configuration
  const directives = [];

  switch (configuration.lightModel) {
    case LightModel.Phong:
      directives.push({
        name: "LIGHT_MODEL_AMBIENT",
        value: configuration.lightModelPhongNoAmbient ? 0 : 1,
      });

      break;
  }

  // Setup light shader
  const shader = new GlShader<AmbientState, undefined>(
    renderer,
    ambientVertexShader,
    ambientFragmentShader,
    directives
  );

  shader.setAttributePerPolygon("points", (geometry) => geometry.points);

  shader.setUniformPerMesh(
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

const loadGeometry = (renderer: GlRenderer, configuration: Configuration) => {
  // Setup geometry shader
  const shader = new GlShader<State, undefined>(
    renderer,
    geometryVertexShader,
    geometryFragmentShader,
    []
  );

  shader.setAttributePerPolygon("coords", (geometry) => geometry.coords);
  shader.setAttributePerPolygon("normals", (geometry) => geometry.normals);
  shader.setAttributePerPolygon("points", (geometry) => geometry.points);
  shader.setAttributePerPolygon("tangents", (geometry) => geometry.tangents);

  shader.setUniformPerMesh(
    "modelMatrix",
    uniform.numberMatrix4(({ modelMatrix }) => modelMatrix)
  );
  shader.setUniformPerMesh(
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

  if (configuration.lightModel === LightModel.Phong) {
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

const loadLight = <TState>(
  renderer: GlRenderer,
  configuration: Configuration,
  type: LightType
) => {
  // Build directives from configuration
  const directives = [{ name: "LIGHT_TYPE", value: type }];

  switch (configuration.lightModel) {
    case LightModel.Phong:
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
  const shader = new GlShader<LightState<TState>, undefined>(
    renderer,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  shader.setAttributePerPolygon("points", (geometry) => geometry.points);

  shader.setUniformPerMesh(
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

const loadLightDirectional = (
  renderer: GlRenderer,
  configuration: Configuration
) => {
  const shader = loadLight<GlDirectionalLight>(
    renderer,
    configuration,
    LightType.Directional
  );

  shader.setUniformPerScene(
    "directionalLight.color",
    uniform.numberVector3(({ light }) => light.color)
  );
  shader.setUniformPerScene(
    "directionalLight.direction",
    uniform.numberVector3(({ light }) => light.direction)
  );

  return shader;
};

const loadLightPoint = (renderer: GlRenderer, configuration: Configuration) => {
  const shader = loadLight<GlPointLight>(
    renderer,
    configuration,
    LightType.Point
  );

  shader.setUniformPerScene(
    "pointLight.color",
    uniform.numberVector3(({ light }) => light.color)
  );
  shader.setUniformPerScene(
    "pointLight.position",
    uniform.numberVector3(({ light }) => light.position)
  );
  shader.setUniformPerScene(
    "pointLight.radius",
    uniform.numberScalar(({ light }) => light.radius)
  );

  return shader;
};

class Pipeline implements GlPipeline<SceneState, undefined> {
  public readonly albedoAndShininessBuffer: WebGLTexture;
  public readonly depthBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly ambientLightPainter: GlPainter<AmbientState, undefined>;
  private readonly directionalLightPainter: GlPainter<
    LightState<GlDirectionalLight>,
    undefined
  >;
  private readonly fullscreenModel: GlModel;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State, undefined>;
  private readonly geometryTarget: GlTarget;
  private readonly pointLightPainter: GlPainter<
    LightState<GlPointLight>,
    undefined
  >;
  private readonly renderer: GlRenderer;
  private readonly sphereModel: GlModel;

  public constructor(renderer: GlRenderer, configuration: Configuration) {
    const gl = renderer.context;
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
      loadAmbient(renderer, configuration)
    );
    this.depthBuffer = geometry.setupDepthTexture(
      GlTextureFormat.Depth16,
      GlTextureType.Quad
    );
    this.directionalLightPainter = new SingularPainter(
      loadLightDirectional(renderer, configuration)
    );
    this.fullscreenModel = loadModel(renderer, quadModel);
    this.fullscreenProjection = Matrix4.fromOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = new SingularPainter(
      loadGeometry(renderer, configuration)
    );
    this.geometryTarget = geometry;
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.pointLightPainter = new SingularPainter(
      loadLightPoint(renderer, configuration)
    );
    this.renderer = renderer;
    this.sphereModel = loadModel(renderer, sphereModel);
  }

  public process(
    target: GlTarget,
    transform: GlTransform,
    scene: GlScene<SceneState, undefined>
  ) {
    const { state, subjects } = scene;
    const gl = this.renderer.context;
    const viewportSize = {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    };

    // Draw scene geometries
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.disable(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.geometryTarget.clear(0);
    this.geometryPainter.paint(
      this.geometryTarget,
      subjects,
      transform.viewMatrix,
      transform
    );

    // Draw scene lights
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Draw ambient light using fullscreen quad
    if (state.ambientLightColor !== undefined) {
      const ambiantLightSubjects: GlSubject<undefined>[] = [
        {
          matrix: Matrix4.fromIdentity(),
          model: this.fullscreenModel,
          state: undefined,
        },
      ];

      this.ambientLightPainter.paint(
        target,
        ambiantLightSubjects,
        transform.viewMatrix,
        {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          ambientLightColor: state.ambientLightColor,
          projectionMatrix: this.fullscreenProjection,
          viewMatrix: Matrix4.fromIdentity(),
        }
      );
    }

    // Draw directional lights using fullscreen quads
    if (state.directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const subjectMatrix = Matrix4.fromObject(transform.viewMatrix);

      subjectMatrix.invert();

      const directionalLightSubjects: GlSubject<undefined>[] = [
        {
          matrix: subjectMatrix,
          model: this.fullscreenModel,
          state: undefined,
        },
      ];

      for (const directionalLight of state.directionalLights) {
        this.directionalLightPainter.paint(
          target,
          directionalLightSubjects,
          transform.viewMatrix,
          {
            albedoAndShininessBuffer: this.albedoAndShininessBuffer,
            depthBuffer: this.depthBuffer,
            light: directionalLight,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            projectionMatrix: this.fullscreenProjection,
            viewMatrix: transform.viewMatrix,
            viewportSize: viewportSize,
          }
        );
      }
    }

    // Draw point lights using spheres
    if (state.pointLights !== undefined) {
      const pointLightSubjects: GlSubject<undefined>[] = [
        {
          matrix: Matrix4.fromIdentity(),
          model: this.sphereModel,
          state: undefined,
        },
      ];

      gl.cullFace(gl.FRONT);

      for (const pointLight of state.pointLights) {
        pointLightSubjects[0].matrix = Matrix4.fromCustom(
          ["translate", pointLight.position],
          [
            "scale",
            {
              x: pointLight.radius,
              y: pointLight.radius,
              z: pointLight.radius,
            },
          ]
        );

        this.pointLightPainter.paint(
          target,
          pointLightSubjects,
          transform.viewMatrix,
          {
            albedoAndShininessBuffer: this.albedoAndShininessBuffer,
            depthBuffer: this.depthBuffer,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            light: pointLight,
            projectionMatrix: transform.projectionMatrix,
            viewMatrix: transform.viewMatrix,
            viewportSize: viewportSize,
          }
        );
      }
    }
  }

  public resize(width: number, height: number) {
    this.geometryTarget.resize(width, height);
  }
}

export { type Configuration, LightModel, Pipeline };
