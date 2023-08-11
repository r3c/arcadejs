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
import * as rgb from "./snippets/rgb";
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

#if LIGHT_TYPE == ${DeferredLightingLightType.Directional}
out vec3 lightDistanceCamera;
#elif LIGHT_TYPE == ${DeferredLightingLightType.Point}
out vec3 lightPositionCamera;
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
		lightPositionCamera = toCameraPosition(pointLight.position);
	#endif

	gl_Position =
		projectionMatrix * viewMatrix * modelMatrix * points +
		projectionMatrix * billboardMatrix * modelMatrix * vec4(coords, 0.0, 0.0);
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

type MaterialState = State & {
  ambientLightColor: Vector3;
  lightBuffer: WebGLTexture;
};

type SceneState = State & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  pointLights?: PointLight[];
};

const loadGeometry = (runtime: GlRuntime, configuration: Configuration) => {
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

const loadLight = <TSceneState extends LightState>(
  runtime: GlRuntime,
  _: Configuration,
  type: DeferredLightingLightType
) => {
  const directives = [{ name: "LIGHT_TYPE", value: type }];

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
  runtime: GlRuntime,
  configuration: Configuration
) => {
  const shader = loadLight<DirectionalLightState>(
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

const loadLightPoint = (runtime: GlRuntime, configuration: Configuration) => {
  const shader = loadLight<PointLightState>(
    runtime,
    configuration,
    DeferredLightingLightType.Point
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

const loadMaterial = (runtime: GlRuntime, configuration: Configuration) => {
  // Build directives from configuration
  const directives = [];

  switch (configuration.lightModel) {
    case DeferredLightingLightModel.Phong:
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
  const shader = new GlShader<MaterialState, GlPolygon>(
    runtime,
    materialVertexShader,
    materialFragmentShader,
    directives
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
  public readonly depthBuffer: WebGLTexture;
  public readonly lightBuffer: WebGLTexture;
  public readonly normalAndGlossinessBuffer: WebGLTexture;

  private readonly directionalLightPainter: GlPainter<
    DirectionalLightState,
    GlPolygon
  >;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<State, GlPolygon>;
  private readonly geometryTarget: GlTarget;
  private readonly lightTarget: GlTarget;
  private readonly materialPainter: GlPainter<MaterialState, GlPolygon>;
  private readonly pointLightObjects: GlObject<GlPolygon>[];
  private readonly pointLightPainter: GlPainter<PointLightState, GlPolygon>;
  private readonly quadModel: GlModel<GlPolygon>;
  private readonly runtime: GlRuntime;

  public constructor(runtime: GlRuntime, configuration: Configuration) {
    const gl = runtime.context;
    const billboard = loadModel(runtime, billboardModel);
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
      loadLightDirectional(runtime, configuration)
    );
    this.fullscreenProjection = Matrix4.fromOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = new SingularPainter(
      loadGeometry(runtime, configuration)
    );
    this.geometryTarget = geometry;
    this.lightBuffer = light.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.lightTarget = light;
    this.materialPainter = new SingularPainter(
      loadMaterial(runtime, configuration)
    );
    this.pointLightObjects = [{ matrix: Matrix4.identity, model: billboard }];
    this.pointLightPainter = new SingularPainter(
      loadLightPoint(runtime, configuration)
    );
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.runtime = runtime;
    this.quadModel = loadModel(runtime, quadModel);
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
        this.directionalLightPainter.paint(
          this.lightTarget,
          objects,
          state.viewMatrix,
          {
            billboardMatrix,
            depthBuffer: this.depthBuffer,
            directionalLight,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            projectionMatrix: this.fullscreenProjection,
            viewMatrix: state.viewMatrix,
            viewportSize,
          }
        );
      }
    }

    if (state.pointLights !== undefined) {
      for (const pointLight of state.pointLights) {
        const { position, radius } = pointLight;

        this.pointLightObjects[0].matrix = Matrix4.fromCustom(
          ["translate", position],
          ["scale", { x: radius, y: radius, z: radius }]
        );

        this.pointLightPainter.paint(
          this.lightTarget,
          this.pointLightObjects,
          state.viewMatrix,
          {
            billboardMatrix,
            depthBuffer: this.depthBuffer,
            normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
            pointLight,
            projectionMatrix: state.projectionMatrix,
            viewMatrix: state.viewMatrix,
            viewportSize,
          }
        );
      }
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
