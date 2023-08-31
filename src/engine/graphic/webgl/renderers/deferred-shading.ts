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
import { normalEncode, normalPerturb, normalDecode } from "../shaders/normal";
import { ObjectScene, createObjectPainter } from "../painters/object";
import { parallaxPerturb } from "../shaders/parallax";
import { lightDeclare, lightInvoke } from "./snippets/phong";
import { model as quadModel } from "./resources/quad";
import { shininessDecode, shininessEncode } from "../shaders/shininess";
import { Vector2, Vector3 } from "../../../math/vector";
import {
  GlPainter,
  GlRuntime,
  GlTarget,
  GlTextureFormat,
  GlTextureType,
  GlGeometry,
} from "../../webgl";
import {
  GlDirectionalLightBillboard,
  GlDirectionalLightPolygon,
  GlPointLightBillboard,
  GlPointLightPolygon,
  directionalLightBillboard,
  pointLightBillboard,
} from "./objects/billboard";
import { GlShaderDirectives, shaderDirective, shaderUniform } from "../shader";
import { Renderer } from "../../display";
import { GlMaterial, GlObject, GlPolygon, createModel } from "../model";
import { GlTexture } from "../texture";
import { SinglePainter } from "../painters/single";
import { GlBuffer } from "../resource";

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

${normalEncode.declare()}
${normalPerturb.declare()}
${parallaxPerturb.declare()}
${shininessEncode.declare()}

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
	vec2 coordParallax = ${parallaxPerturb.invoke(
    "heightMap",
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
	float shininessPack = ${shininessEncode.invoke("shininess")};

	albedoAndShininess = vec4(albedo, shininessPack);

	// Color target 2: [normal.pp, zero, glossiness]
	vec3 normalModified = ${normalPerturb.invoke(
    "normalMap",
    "coordParallax",
    "t",
    "b",
    "n"
  )};
	vec2 normalPack = ${normalEncode.invoke("normalModified")};

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
in vec3 lightPosition;
in float lightRadius;
in vec3 lightShift;

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
		projectionMatrix * billboardMatrix * modelMatrix * vec4(lightShift, 0.0);
}`;

const lightFragmentShader = `
${lightHeaderShader}

uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndGlossiness;

${normalDecode.declare()}
${lightDeclare("LIGHT_MODEL_PHONG_DIFFUSE", "LIGHT_MODEL_PHONG_SPECULAR")}
${shininessDecode.declare()}

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
	vec3 normal = ${normalDecode.invoke("normalAndGlossinessSample.rg")};
	float glossiness = normalAndGlossinessSample.a;
	float shininess = ${shininessDecode.invoke("albedoAndShininessSample.a")};

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

	vec3 color = ${lightInvoke(
    "light",
    "albedo",
    "glossiness",
    "shininess",
    "normal",
    "eyeDirection"
  )};

	fragColor = vec4(color, 1.0);
}`;

type DeferredShadingConfiguration = {
  lightModel: DeferredShadingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  useHeightMap: boolean;
  useNormalMap: boolean;
};

type DeferredShadingScene = {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  objects: Iterable<GlObject>;
  pointLights?: PointLight[];
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type AmbientLightScene = ObjectScene & {
  albedoAndShininessBuffer: GlTexture;
  ambientLightColor: Vector3;
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type GeometryScene = ObjectScene & {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type LightScene = {
  albedoAndShininessBuffer: GlTexture;
  depthBuffer: GlTexture;
  index: GlBuffer;
  normalAndGlossinessBuffer: GlTexture;
  projectionMatrix: Matrix4;
  viewportSize: Vector2;
  modelMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type DirectionalLightScene = LightScene & {
  directionalLight: DirectionalLight;
  polygon: GlDirectionalLightPolygon;
};

type PointLightScene = LightScene & {
  billboardMatrix: Matrix4;
  polygon: GlPointLightPolygon;
};

const loadAmbientPainter = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
): GlPainter<AmbientLightScene> => {
  // Build directives from configuration
  const directives: GlShaderDirectives = {};

  switch (configuration.lightModel) {
    case DeferredShadingLightModel.Phong:
      directives["LIGHT_MODEL_AMBIENT"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoAmbient
      );

      break;
  }

  // Setup light shader
  // FIXME: should be disposed
  const shader = runtime.createShader(
    ambientVertexShader,
    ambientFragmentShader,
    directives
  );

  const polygonBinding = shader.declare<GlPolygon>();

  polygonBinding.setAttribute("position", ({ position }) => position);

  const geometryBinding = shader.declare<GlGeometry>();

  geometryBinding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );

  const sceneBinding = shader.declare<AmbientLightScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );
  sceneBinding.setUniform(
    "albedoAndShininess",
    shaderUniform.quadBlack((state) => state.albedoAndShininessBuffer)
  );
  sceneBinding.setUniform(
    "ambientLightColor",
    shaderUniform.vector3f(({ ambientLightColor }) => ambientLightColor)
  );

  return createObjectPainter(
    sceneBinding,
    geometryBinding,
    undefined,
    polygonBinding
  );
};

const loadGeometryPainter = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
): GlPainter<GeometryScene> => {
  // Setup geometry shader
  // FIXME: should be disposed
  const shader = runtime.createShader(
    geometryVertexShader,
    geometryFragmentShader,
    {}
  );

  const polygonBinding = shader.declare<GlPolygon>();

  polygonBinding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  polygonBinding.setAttribute("normals", ({ normal }) => normal); // FIXME: remove plural
  polygonBinding.setAttribute("position", ({ position }) => position);
  polygonBinding.setAttribute("tangents", ({ tangent }) => tangent);

  const geometryBinding = shader.declare<GlGeometry>();

  geometryBinding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );
  geometryBinding.setUniform(
    "normalMatrix",
    shaderUniform.matrix3f(({ normalMatrix }) => normalMatrix)
  );

  const sceneBinding = shader.declare<GeometryScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  const materialBinding = shader.declare<GlMaterial>();

  materialBinding.setUniform(
    "albedoFactor",
    shaderUniform.array4f(({ albedoFactor }) => albedoFactor)
  );
  materialBinding.setUniform(
    "albedoMap",
    shaderUniform.quadWhite(({ albedoMap }) => albedoMap)
  );

  if (configuration.lightModel === DeferredShadingLightModel.Phong) {
    materialBinding.setUniform(
      "glossinessMap",
      shaderUniform.quadBlack(({ glossMap }) => glossMap)
    );
    materialBinding.setUniform(
      "shininess",
      shaderUniform.number(({ shininess }) => shininess)
    );
  }

  if (configuration.useHeightMap) {
    materialBinding.setUniform(
      "heightMap",
      shaderUniform.quadBlack(({ heightMap }) => heightMap)
    );
    materialBinding.setUniform(
      "heightParallaxBias",
      shaderUniform.number(({ heightParallaxBias }) => heightParallaxBias)
    );
    materialBinding.setUniform(
      "heightParallaxScale",
      shaderUniform.number(({ heightParallaxScale }) => heightParallaxScale)
    );
  }

  if (configuration.useNormalMap) {
    materialBinding.setUniform(
      "normalMap",
      shaderUniform.quadBlack(({ normalMap }) => normalMap)
    );
  }

  return createObjectPainter(
    sceneBinding,
    geometryBinding,
    materialBinding,
    polygonBinding
  );
};

const loadLightBinding = <TScene extends LightScene>(
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration,
  type: DeferredShadingLightType
) => {
  // Build directives from configuration
  const directives: GlShaderDirectives = {
    LIGHT_TYPE: shaderDirective.number(type),
  };

  switch (configuration.lightModel) {
    case DeferredShadingLightModel.Phong:
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoSpecular
      );

      break;
  }

  // Setup light shader
  // FIXME: should be disposed
  const shader = runtime.createShader(
    lightVertexShader,
    lightFragmentShader,
    directives
  );

  const binding = shader.declare<TScene>();

  binding.setUniform(
    "modelMatrix",
    shaderUniform.matrix4f(({ modelMatrix }) => modelMatrix)
  );
  binding.setUniform(
    "inverseProjectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => {
      const inverseProjectionMatrix = Matrix4.fromObject(projectionMatrix);

      inverseProjectionMatrix.invert();

      return inverseProjectionMatrix;
    })
  );
  binding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  binding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );
  binding.setUniform(
    "viewportSize",
    shaderUniform.vector2f(({ viewportSize }) => viewportSize)
  );
  binding.setUniform(
    "albedoAndShininess",
    shaderUniform.quadBlack((state) => state.albedoAndShininessBuffer)
  );
  binding.setUniform(
    "depth",
    shaderUniform.quadBlack(({ depthBuffer }) => depthBuffer)
  );
  binding.setUniform(
    "normalAndGlossiness",
    shaderUniform.quadBlack((state) => state.normalAndGlossinessBuffer)
  );

  return binding;
};

const loadDirectionalLightPainter = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
) => {
  const binding = loadLightBinding<DirectionalLightScene>(
    runtime,
    configuration,
    DeferredShadingLightType.Directional
  );

  // FIXME: use attributes for all
  binding.setUniform(
    "directionalLight.color",
    shaderUniform.vector3f(({ directionalLight }) => directionalLight.color)
  );
  binding.setUniform(
    "directionalLight.direction",
    shaderUniform.vector3f(({ directionalLight }) => directionalLight.direction)
  );
  binding.setAttribute("lightPosition", ({ polygon: p }) => p.lightPosition);

  return new SinglePainter<DirectionalLightScene>(
    binding,
    ({ index }) => index
  );
};

const loadPointLightPainter = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
) => {
  const binding = loadLightBinding<PointLightScene>(
    runtime,
    configuration,
    DeferredShadingLightType.Point
  );

  binding.setUniform(
    "billboardMatrix",
    shaderUniform.matrix4f(({ billboardMatrix }) => billboardMatrix)
  );
  binding.setAttribute("lightColor", ({ polygon: p }) => p.lightColor);
  binding.setAttribute("lightPosition", ({ polygon: p }) => p.lightPosition);
  binding.setAttribute("lightRadius", ({ polygon: p }) => p.lightRadius);
  binding.setAttribute("lightShift", ({ polygon: p }) => p.lightShift);

  return new SinglePainter<PointLightScene>(binding, ({ index }) => index);
};

class DeferredShadingRenderer implements Renderer<DeferredShadingScene> {
  public readonly albedoAndShininessBuffer: GlTexture;
  public readonly depthBuffer: GlTexture;
  public readonly normalAndGlossinessBuffer: GlTexture;

  private readonly ambientLightPainter: GlPainter<AmbientLightScene>;
  private readonly ambientLightObjects: GlObject[];
  private readonly directionalLightBillboard: GlDirectionalLightBillboard;
  private readonly directionalLightPainter: GlPainter<DirectionalLightScene>;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<GeometryScene>;
  private readonly geometryTarget: GlTarget;
  private readonly pointLightBillboard: GlPointLightBillboard;
  private readonly pointLightPainter: GlPainter<PointLightScene>;
  private readonly runtime: GlRuntime;
  private readonly target: GlTarget;

  public constructor(
    runtime: GlRuntime,
    target: GlTarget,
    configuration: DeferredShadingConfiguration
  ) {
    const gl = runtime.context;
    const geometry = new GlTarget(
      gl,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight
    );
    const quad = createModel(gl, quadModel);

    this.albedoAndShininessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.ambientLightPainter = loadAmbientPainter(runtime, configuration);
    this.ambientLightObjects = [{ matrix: Matrix4.identity, model: quad }];
    this.depthBuffer = geometry.setupDepthTexture(
      GlTextureFormat.Depth16,
      GlTextureType.Quad
    );
    this.directionalLightBillboard = directionalLightBillboard(gl);
    this.directionalLightPainter = loadDirectionalLightPainter(
      runtime,
      configuration
    );
    this.fullscreenProjection = Matrix4.fromOrthographic(-1, 1, -1, 1, -1, 1);
    this.geometryPainter = loadGeometryPainter(runtime, configuration);
    this.geometryTarget = geometry;
    this.pointLightBillboard = pointLightBillboard(gl);
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.pointLightPainter = loadPointLightPainter(runtime, configuration);
    this.runtime = runtime;
    this.target = target;
  }

  public dispose() {}

  public render(scene: DeferredShadingScene) {
    const {
      ambientLightColor,
      directionalLights,
      pointLights,
      projectionMatrix,
      viewMatrix,
    } = scene;

    const gl = this.runtime.context;
    const viewportSize = {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    };

    // Build billboard matrix from view matrix to get camera-facing quads by
    // copying view matrix and cancelling any rotation.
    const billboardMatrix = Matrix4.fromObject(viewMatrix);

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
    this.geometryPainter.paint(this.geometryTarget, scene);

    // Draw scene lights
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Draw ambient light using fullscreen quad
    if (ambientLightColor !== undefined) {
      this.ambientLightPainter.paint(this.target, {
        albedoAndShininessBuffer: this.albedoAndShininessBuffer,
        ambientLightColor,
        objects: this.ambientLightObjects,
        projectionMatrix: this.fullscreenProjection,
        viewMatrix: Matrix4.identity,
      });
    }

    // Draw directional lights using fullscreen quads
    if (directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const modelMatrix = Matrix4.fromObject(viewMatrix);

      modelMatrix.invert();

      for (const directionalLight of directionalLights) {
        this.directionalLightPainter.paint(this.target, {
          albedoAndShininessBuffer: this.albedoAndShininessBuffer,
          depthBuffer: this.depthBuffer,
          directionalLight,
          index: this.directionalLightBillboard.index,
          modelMatrix,
          normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
          polygon: this.directionalLightBillboard.polygon,
          projectionMatrix: this.fullscreenProjection,
          viewMatrix,
          viewportSize,
        });
      }
    }

    // Draw point lights using quads
    if (pointLights !== undefined) {
      this.pointLightBillboard.set(pointLights);

      this.pointLightPainter.paint(this.target, {
        albedoAndShininessBuffer: this.albedoAndShininessBuffer,
        billboardMatrix,
        depthBuffer: this.depthBuffer,
        index: this.pointLightBillboard.index,
        modelMatrix: Matrix4.identity, // FIXME: remove from shader
        normalAndGlossinessBuffer: this.normalAndGlossinessBuffer,
        polygon: this.pointLightBillboard.polygon,
        projectionMatrix,
        viewMatrix,
        viewportSize,
      });
    }
  }

  public resize(width: number, height: number) {
    this.geometryTarget.resize(width, height);
  }
}

export {
  type DeferredShadingConfiguration,
  type DeferredShadingScene,
  DeferredShadingLightModel,
  DeferredShadingRenderer,
};
