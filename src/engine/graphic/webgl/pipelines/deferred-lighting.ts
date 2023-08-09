import * as light from "./snippets/light";
import { Matrix4 } from "../../../math/matrix";
import * as normal from "./snippets/normal";
import { SingularPainter } from "../painters/singular";
import * as parallax from "./snippets/parallax";
import * as phong from "./snippets/phong";
import { mesh as quadModel } from "./resources/quad";
import * as rgb from "./snippets/rgb";
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
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

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

#define ZERO 0

uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D depthBuffer;
uniform sampler2D normalAndGlossinessBuffer;

${normal.decodeDeclare()}
${phong.lightDeclare("ZERO", "ZERO")}
${shininess.decodeDeclare()}

in vec3 lightDistanceCamera;
in vec3 lightPositionCamera;

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

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec3 bitangent;
out vec2 coord;
out vec3 normal;
out vec3 point;
out vec3 tangent;

void main(void) {
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(points, 1.0);

	normal = normalize(normalMatrix * normals);
	tangent = normalize(normalMatrix * tangents);

	bitangent = cross(normal, tangent);
	coord = coords;
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
${rgb.linearToStandardDeclare()}
${rgb.standardToLinearDeclare()}

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

	vec3 albedo = albedoFactor.rgb * ${rgb.standardToLinearInvoke(
    "texture(albedoMap, coordParallax).rgb"
  )};
	float glossiness = glossinessFactor * texture(glossinessMap, coordParallax).r;

	// Emit final fragment color
	// FIXME: duplicate of "phong.lightInvoke" code
	vec3 color = albedo * (ambientLight + diffuseLight) + glossiness * specularLight;

	fragColor = vec4(${rgb.linearToStandardInvoke("color")}, 1.0);
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

type LightState<TLight> = State & {
  depthBuffer: WebGLTexture;
  light: TLight;
  normalAndGlossinessBuffer: WebGLTexture;
  viewportSize: Vector2;
};

type MaterialState = State & {
  ambientLightColor: Vector3;
  lightBuffer: WebGLTexture;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: GlDirectionalLight[];
  pointLights?: GlPointLight[];
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

  if (configuration.useNormalMap) {
    shader.setUniformPerMaterial(
      "normalMap",
      uniform.blackQuadTexture(({ normalMap }) => normalMap)
    );
  }

  return shader;
};

const loadLight = <TState>(
  renderer: GlRenderer,
  _: Configuration,
  type: LightType
) => {
  const directives = [{ name: "LIGHT_TYPE", value: type }];

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
    "depthBuffer",
    uniform.blackQuadTexture(({ depthBuffer }) => depthBuffer)
  );
  shader.setUniformPerScene(
    "normalAndGlossinessBuffer",
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

const loadMaterial = (renderer: GlRenderer, configuration: Configuration) => {
  // Build directives from configuration
  const directives = [];

  switch (configuration.lightModel) {
    case LightModel.Phong:
      directives.push({
        name: "LIGHT_MODEL_AMBIENT",
        value: configuration.lightModelPhongNoAmbient ? 0 : 1,
      });
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

  // Setup material shader
  const shader = new GlShader<MaterialState, undefined>(
    renderer,
    materialVertexShader,
    materialFragmentShader,
    directives
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

  if (configuration.lightModel >= LightModel.Phong) {
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

class Pipeline implements GlPipeline<SceneState, undefined> {
  public readonly depthBuffer: WebGLTexture;
  public readonly lightBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly directionalLightPainter: GlPainter<
    LightState<GlDirectionalLight>,
    undefined
  >;
  private readonly fullscreenModel: GlModel;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State, undefined>;
  private readonly geometryTarget: GlTarget;
  private readonly lightTarget: GlTarget;
  private readonly materialPainter: GlPainter<MaterialState, undefined>;
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
      loadLightDirectional(renderer, configuration)
    );
    this.fullscreenModel = loadModel(renderer, quadModel);
    this.fullscreenProjection = Matrix4.fromOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = new SingularPainter(
      loadGeometry(renderer, configuration)
    );
    this.geometryTarget = geometry;
    this.lightBuffer = light.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.lightTarget = light;
    this.materialPainter = new SingularPainter(
      loadMaterial(renderer, configuration)
    );
    this.pointLightPainter = new SingularPainter(
      loadLightPoint(renderer, configuration)
    );
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.renderer = renderer;
    this.sphereModel = loadModel(renderer, sphereModel);
  }

  public process(target: GlTarget, scene: GlScene<SceneState, undefined>) {
    const { state, subjects } = scene;
    const gl = this.renderer.context;
    const viewportSize = {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    };

    // Render geometries to geometry buffers
    gl.disable(gl.BLEND);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.geometryTarget.clear(0);
    this.geometryPainter.paint(
      this.geometryTarget,
      subjects,
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

    if (state.directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const subjectMatrix = Matrix4.fromObject(state.viewMatrix);

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
          this.lightTarget,
          directionalLightSubjects,
          state.viewMatrix,
          {
            depthBuffer: this.depthBuffer,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            light: directionalLight,
            projectionMatrix: this.fullscreenProjection,
            viewMatrix: state.viewMatrix,
            viewportSize: viewportSize,
          }
        );
      }
    }

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
          this.lightTarget,
          pointLightSubjects,
          state.viewMatrix,
          {
            depthBuffer: this.depthBuffer,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            light: pointLight,
            projectionMatrix: state.projectionMatrix,
            viewMatrix: state.viewMatrix,
            viewportSize: viewportSize,
          }
        );
      }
    }

    // Render materials to output
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.disable(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.materialPainter.paint(target, subjects, state.viewMatrix, {
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

export { type Configuration, type SceneState, LightModel, Pipeline };
