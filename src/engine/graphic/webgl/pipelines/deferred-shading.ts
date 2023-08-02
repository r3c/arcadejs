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
  GlScene,
  GlShader,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  GlTransform,
  loadModel,
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
${normal.perturbDeclare("FORCE_NORMAL_MAP", "normalMapEnabled", "normalMap")}
${parallax.perturbDeclare("FORCE_HEIGHT_MAP", "heightMapEnabled", "heightMap")}
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

interface AmbientState extends State {
  albedoAndShininessBuffer: WebGLTexture;
  ambientLightColor: Vector3;
}

interface Configuration {
  lightModel: LightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  useHeightMap: boolean;
  useNormalMap: boolean;
}

interface State {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
}

interface LightState<TLight> extends State {
  albedoAndShininessBuffer: WebGLTexture;
  depthBuffer: WebGLTexture;
  light: TLight;
  normalAndGlossinessBuffer: WebGLTexture;
  viewportSize: Vector2;
}

const loadAmbient = (
  gl: WebGL2RenderingContext,
  configuration: Configuration
) => {
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
  const shader = new GlShader<AmbientState>(
    gl,
    ambientVertexShader,
    ambientFragmentShader,
    directives
  );

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setupMatrix4PerNode("modelMatrix", (state) => state.modelMatrix);

  shader.setupMatrix4PerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix
  );
  shader.setupMatrix4PerTarget("viewMatrix", (state) => state.viewMatrix);

  shader.setupTexturePerTarget(
    "albedoAndShininess",
    undefined,
    GlTextureType.Quad,
    (state) => state.albedoAndShininessBuffer
  );
  shader.setupPropertyPerTarget(
    "ambientLightColor",
    ({ ambientLightColor }) => [
      ambientLightColor.x,
      ambientLightColor.y,
      ambientLightColor.z,
    ],
    (gl) => gl.uniform3fv
  );

  return shader;
};

const loadGeometry = (
  gl: WebGL2RenderingContext,
  configuration: Configuration
) => {
  // Build directives from configuration
  const directives = [
    { name: "FORCE_HEIGHT_MAP", value: configuration.useHeightMap ? 1 : 0 },
    { name: "FORCE_NORMAL_MAP", value: configuration.useNormalMap ? 1 : 0 },
  ];

  // Setup geometry shader
  const shader = new GlShader<State>(
    gl,
    geometryVertexShader,
    geometryFragmentShader,
    directives
  );

  shader.setupAttributePerGeometry("coords", (geometry) => geometry.coords);
  shader.setupAttributePerGeometry("normals", (geometry) => geometry.normals);
  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);
  shader.setupAttributePerGeometry("tangents", (geometry) => geometry.tangents);

  shader.setupMatrix4PerNode("modelMatrix", (state) => state.modelMatrix);
  shader.setupMatrix3PerNode("normalMatrix", (state) => state.normalMatrix);
  shader.setupMatrix4PerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix
  );
  shader.setupMatrix4PerTarget("viewMatrix", (state) => state.viewMatrix);

  shader.setupPropertyPerMaterial(
    "albedoFactor",
    (material) => material.albedoFactor,
    (gl) => gl.uniform4fv
  );
  shader.setupTexturePerMaterial(
    "albedoMap",
    undefined,
    GlTextureType.Quad,
    (material) => material.albedoMap
  );

  if (configuration.lightModel === LightModel.Phong) {
    shader.setupTexturePerMaterial(
      "glossinessMap",
      undefined,
      GlTextureType.Quad,
      (material) => material.glossMap
    );
    shader.setupPropertyPerMaterial(
      "shininess",
      (material) => material.shininess,
      (gl) => gl.uniform1f
    );
  }

  if (configuration.useHeightMap) {
    shader.setupTexturePerMaterial(
      "heightMap",
      undefined,
      GlTextureType.Quad,
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

  if (configuration.useNormalMap)
    shader.setupTexturePerMaterial(
      "normalMap",
      undefined,
      GlTextureType.Quad,
      (material) => material.normalMap
    );

  return shader;
};

const loadLight = <TState>(
  gl: WebGL2RenderingContext,
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
  const shader = new GlShader<LightState<TState>>(
    gl,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setupMatrix4PerNode("modelMatrix", (state) => state.modelMatrix);
  shader.setupMatrix4PerTarget("inverseProjectionMatrix", (state) => {
    const inverseProjectionMatrix = Matrix4.fromObject(state.projectionMatrix);

    inverseProjectionMatrix.invert();

    return inverseProjectionMatrix;
  });
  shader.setupMatrix4PerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix
  );
  shader.setupMatrix4PerTarget("viewMatrix", (state) => state.viewMatrix);

  shader.setupPropertyPerTarget(
    "viewportSize",
    ({ viewportSize }) => [viewportSize.x, viewportSize.y],
    (gl) => gl.uniform2fv
  );

  shader.setupTexturePerTarget(
    "albedoAndShininess",
    undefined,
    GlTextureType.Quad,
    (state) => state.albedoAndShininessBuffer
  );
  shader.setupTexturePerTarget(
    "depth",
    undefined,
    GlTextureType.Quad,
    (state) => state.depthBuffer
  );
  shader.setupTexturePerTarget(
    "normalAndGlossiness",
    undefined,
    GlTextureType.Quad,
    (state) => state.normalAndGlossinessBuffer
  );

  return shader;
};

const loadLightDirectional = (
  gl: WebGL2RenderingContext,
  configuration: Configuration
) => {
  const shader = loadLight<GlDirectionalLight>(
    gl,
    configuration,
    LightType.Directional
  );

  shader.setupPropertyPerTarget(
    "directionalLight.color",
    ({ light }) => [light.color.x, light.color.y, light.color.z],
    (gl) => gl.uniform3fv
  );
  shader.setupPropertyPerTarget(
    "directionalLight.direction",
    ({ light }) => [light.direction.x, light.direction.y, light.direction.z],
    (gl) => gl.uniform3fv
  );

  return shader;
};

const loadLightPoint = (
  gl: WebGL2RenderingContext,
  configuration: Configuration
) => {
  const shader = loadLight<GlPointLight>(gl, configuration, LightType.Point);

  shader.setupPropertyPerTarget(
    "pointLight.color",
    ({ light }) => [light.color.x, light.color.y, light.color.y],
    (gl) => gl.uniform3fv
  );
  shader.setupPropertyPerTarget(
    "pointLight.position",
    ({ light }) => [light.position.x, light.position.y, light.position.z],
    (gl) => gl.uniform3fv
  );
  shader.setupPropertyPerTarget(
    "pointLight.radius",
    (state) => state.light.radius,
    (gl) => gl.uniform1f
  );

  return shader;
};

class Pipeline implements GlPipeline {
  public readonly albedoAndShininessBuffer: WebGLTexture;
  public readonly depthBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly ambientLightPainter: GlPainter<AmbientState>;
  private readonly directionalLightPainter: GlPainter<
    LightState<GlDirectionalLight>
  >;
  private readonly fullscreenModel: GlModel;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State>;
  private readonly geometryTarget: GlTarget;
  private readonly gl: WebGL2RenderingContext;
  private readonly pointLightPainter: GlPainter<LightState<GlPointLight>>;
  private readonly sphereModel: GlModel;

  public constructor(gl: WebGL2RenderingContext, configuration: Configuration) {
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
      loadAmbient(gl, configuration)
    );
    this.depthBuffer = geometry.setupDepthTexture(
      GlTextureFormat.Depth16,
      GlTextureType.Quad
    );
    this.directionalLightPainter = new SingularPainter(
      loadLightDirectional(gl, configuration)
    );
    this.fullscreenModel = loadModel(gl, quadModel);
    this.fullscreenProjection = Matrix4.createOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = new SingularPainter(loadGeometry(gl, configuration));
    this.geometryTarget = geometry;
    this.gl = gl;
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.pointLightPainter = new SingularPainter(
      loadLightPoint(gl, configuration)
    );
    this.sphereModel = loadModel(gl, sphereModel);
  }

  public process(target: GlTarget, transform: GlTransform, scene: GlScene) {
    const gl = this.gl;
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
      scene.subjects,
      transform.viewMatrix,
      transform
    );

    // Draw scene lights
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Draw ambient light using fullscreen quad
    if (scene.ambientLightColor !== undefined) {
      const subjects = [
        {
          matrix: Matrix4.createIdentity(),
          model: this.fullscreenModel,
        },
      ];

      this.ambientLightPainter.paint(target, subjects, transform.viewMatrix, {
        albedoAndShininessBuffer: this.albedoAndShininessBuffer,
        ambientLightColor: scene.ambientLightColor,
        projectionMatrix: this.fullscreenProjection,
        viewMatrix: Matrix4.createIdentity(),
      });
    }

    // Draw directional lights using fullscreen quads
    if (scene.directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const subjectMatrix = Matrix4.fromObject(transform.viewMatrix);

      subjectMatrix.invert();

      const subjects = [
        {
          matrix: subjectMatrix,
          model: this.fullscreenModel,
        },
      ];

      for (const directionalLight of scene.directionalLights) {
        this.directionalLightPainter.paint(
          target,
          subjects,
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
    if (scene.pointLights !== undefined) {
      const subjects = [
        {
          matrix: Matrix4.createIdentity(),
          model: this.sphereModel,
        },
      ];

      gl.cullFace(gl.FRONT);

      for (const pointLight of scene.pointLights) {
        subjects[0].matrix = Matrix4.createModify((matrix) => {
          matrix.translate(pointLight.position);
          matrix.scale({
            x: pointLight.radius,
            y: pointLight.radius,
            z: pointLight.radius,
          });
        });

        this.pointLightPainter.paint(target, subjects, transform.viewMatrix, {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          depthBuffer: this.depthBuffer,
          normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
          light: pointLight,
          projectionMatrix: transform.projectionMatrix,
          viewMatrix: transform.viewMatrix,
          viewportSize: viewportSize,
        });
      }
    }
  }

  public resize(width: number, height: number) {
    this.geometryTarget.resize(width, height);
  }
}

export { type Configuration, LightModel, Pipeline };
