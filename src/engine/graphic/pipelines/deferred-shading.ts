import * as light from "./snippets/light";
import { Matrix4 } from "../../math/matrix";
import * as normal from "./snippets/normal";
import { Painter as SingularPainter } from "../painters/singular";
import * as parallax from "./snippets/parallax";
import * as phong from "./snippets/phong";
import * as quad from "./resources/quad";
import * as shininess from "./snippets/shininess";
import * as sphere from "./resources/sphere";
import { Vector2, Vector3 } from "../../math/vector";
import * as webgl from "../webgl";

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
  gl: WebGLRenderingContext,
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
  const shader = new webgl.Shader<AmbientState>(
    gl,
    ambientVertexShader,
    ambientFragmentShader,
    directives
  );

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setupMatrixPerNode(
    "modelMatrix",
    (state) => state.transform.getValues(),
    (gl) => gl.uniformMatrix4fv
  );

  shader.setupMatrixPerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "viewMatrix",
    (state) => state.viewMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );

  shader.setupTexturePerTarget(
    "albedoAndShininess",
    undefined,
    webgl.TextureType.Quad,
    (state) => state.albedoAndShininessBuffer
  );
  shader.setupPropertyPerTarget(
    "ambientLightColor",
    (state) => Vector3.toArray(state.ambientLightColor),
    (gl) => gl.uniform3fv
  );

  return shader;
};

const loadGeometry = (
  gl: WebGLRenderingContext,
  configuration: Configuration
) => {
  // Build directives from configuration
  const directives = [
    { name: "FORCE_HEIGHT_MAP", value: configuration.useHeightMap ? 1 : 0 },
    { name: "FORCE_NORMAL_MAP", value: configuration.useNormalMap ? 1 : 0 },
  ];

  // Setup geometry shader
  const shader = new webgl.Shader<State>(
    gl,
    geometryVertexShader,
    geometryFragmentShader,
    directives
  );

  shader.setupAttributePerGeometry("coords", (geometry) => geometry.coords);
  shader.setupAttributePerGeometry("normals", (geometry) => geometry.normals);
  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);
  shader.setupAttributePerGeometry("tangents", (geometry) => geometry.tangents);

  shader.setupMatrixPerNode(
    "modelMatrix",
    (state) => state.transform.getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerNode(
    "normalMatrix",
    (state) => state.normalMatrix,
    (gl) => gl.uniformMatrix3fv
  );
  shader.setupMatrixPerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "viewMatrix",
    (state) => state.viewMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );

  shader.setupPropertyPerMaterial(
    "albedoFactor",
    (material) => material.albedoFactor,
    (gl) => gl.uniform4fv
  );
  shader.setupTexturePerMaterial(
    "albedoMap",
    undefined,
    webgl.TextureType.Quad,
    (material) => material.albedoMap
  );

  if (configuration.lightModel === LightModel.Phong) {
    shader.setupTexturePerMaterial(
      "glossinessMap",
      undefined,
      webgl.TextureType.Quad,
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

  if (configuration.useNormalMap)
    shader.setupTexturePerMaterial(
      "normalMap",
      undefined,
      webgl.TextureType.Quad,
      (material) => material.normalMap
    );

  return shader;
};

const loadLight = <T>(
  gl: WebGLRenderingContext,
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
  const shader = new webgl.Shader<LightState<T>>(
    gl,
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  shader.setupAttributePerGeometry("points", (geometry) => geometry.points);

  shader.setupMatrixPerNode(
    "modelMatrix",
    (state) => state.transform.getValues(),
    (gl) => gl.uniformMatrix4fv
  );

  shader.setupMatrixPerTarget(
    "inverseProjectionMatrix",
    (state) => state.projectionMatrix.inverse().getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "projectionMatrix",
    (state) => state.projectionMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );
  shader.setupMatrixPerTarget(
    "viewMatrix",
    (state) => state.viewMatrix.getValues(),
    (gl) => gl.uniformMatrix4fv
  );

  shader.setupPropertyPerTarget(
    "viewportSize",
    (state) => Vector2.toArray(state.viewportSize),
    (gl) => gl.uniform2fv
  );

  shader.setupTexturePerTarget(
    "albedoAndShininess",
    undefined,
    webgl.TextureType.Quad,
    (state) => state.albedoAndShininessBuffer
  );
  shader.setupTexturePerTarget(
    "depth",
    undefined,
    webgl.TextureType.Quad,
    (state) => state.depthBuffer
  );
  shader.setupTexturePerTarget(
    "normalAndGlossiness",
    undefined,
    webgl.TextureType.Quad,
    (state) => state.normalAndGlossinessBuffer
  );

  return shader;
};

const loadLightDirectional = (
  gl: WebGLRenderingContext,
  configuration: Configuration
) => {
  const shader = loadLight<webgl.DirectionalLight>(
    gl,
    configuration,
    LightType.Directional
  );

  shader.setupPropertyPerTarget(
    "directionalLight.color",
    (state) => Vector3.toArray(state.light.color),
    (gl) => gl.uniform3fv
  );
  shader.setupPropertyPerTarget(
    "directionalLight.direction",
    (state) => Vector3.toArray(state.light.direction),
    (gl) => gl.uniform3fv
  );

  return shader;
};

const loadLightPoint = (
  gl: WebGLRenderingContext,
  configuration: Configuration
) => {
  const shader = loadLight<webgl.PointLight>(
    gl,
    configuration,
    LightType.Point
  );

  shader.setupPropertyPerTarget(
    "pointLight.color",
    (state) => Vector3.toArray(state.light.color),
    (gl) => gl.uniform3fv
  );
  shader.setupPropertyPerTarget(
    "pointLight.position",
    (state) => Vector3.toArray(state.light.position),
    (gl) => gl.uniform3fv
  );
  shader.setupPropertyPerTarget(
    "pointLight.radius",
    (state) => state.light.radius,
    (gl) => gl.uniform1f
  );

  return shader;
};

class Pipeline implements webgl.Pipeline {
  public readonly albedoAndShininessBuffer: WebGLTexture;
  public readonly depthBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly ambientLightPainter: webgl.Painter<AmbientState>;
  private readonly directionalLightPainter: webgl.Painter<
    LightState<webgl.DirectionalLight>
  >;
  private readonly fullscreenMesh: webgl.Mesh;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: webgl.Painter<State>;
  private readonly geometryTarget: webgl.Target;
  private readonly gl: WebGLRenderingContext;
  private readonly pointLightPainter: webgl.Painter<
    LightState<webgl.PointLight>
  >;
  private readonly sphereModel: webgl.Mesh;

  public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
    const geometry = new webgl.Target(
      gl,
      gl.canvas.clientWidth,
      gl.canvas.clientHeight
    );

    this.albedoAndShininessBuffer = geometry.setupColorTexture(
      webgl.TextureFormat.RGBA8,
      webgl.TextureType.Quad
    );
    this.ambientLightPainter = new SingularPainter(
      loadAmbient(gl, configuration)
    );
    this.depthBuffer = geometry.setupDepthTexture(
      webgl.TextureFormat.Depth16,
      webgl.TextureType.Quad
    );
    this.directionalLightPainter = new SingularPainter(
      loadLightDirectional(gl, configuration)
    );
    this.fullscreenMesh = webgl.loadMesh(gl, quad.mesh);
    this.fullscreenProjection = Matrix4.createOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = new SingularPainter(loadGeometry(gl, configuration));
    this.geometryTarget = geometry;
    this.gl = gl;
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      webgl.TextureFormat.RGBA8,
      webgl.TextureType.Quad
    );
    this.pointLightPainter = new SingularPainter(
      loadLightPoint(gl, configuration)
    );
    this.sphereModel = webgl.loadMesh(gl, sphere.mesh);
  }

  public process(
    target: webgl.Target,
    transform: webgl.Transform,
    scene: webgl.Scene
  ) {
    const gl = this.gl;
    const viewportSize = {
      x: gl.canvas.clientWidth,
      y: gl.canvas.clientHeight,
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
          mesh: this.fullscreenMesh,
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
      const subjects = [
        {
          matrix: transform.viewMatrix.inverse(),
          mesh: this.fullscreenMesh,
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
          mesh: this.sphereModel,
        },
      ];

      gl.cullFace(gl.FRONT);

      for (const pointLight of scene.pointLights) {
        subjects[0].matrix = Matrix4.createIdentity()
          .translate(pointLight.position)
          .scale({
            x: pointLight.radius,
            y: pointLight.radius,
            z: pointLight.radius,
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

export { Configuration, LightModel, Pipeline, State };
