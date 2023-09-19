import {
  DirectionalLight,
  PointLight,
  directionalLight,
  directionalLightType,
  pointLight,
  pointLightType,
  resultLightType,
} from "../shaders/light";
import { Matrix4 } from "../../../math/matrix";
import { normalEncode, normalPerturb, normalDecode } from "../shaders/normal";
import { ObjectScene, createObjectPainter } from "../painters/object";
import { parallaxPerturb } from "../shaders/parallax";
import {
  phoneLightInvokeDiffusePower,
  phoneLightInvokeSpecularPower,
  phongLight,
} from "../shaders/phong";
import { linearToStandard, standardToLinear } from "../shaders/rgb";
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
import { shaderUniform, shaderDirective, GlShaderDirectives } from "../shader";
import { Renderer } from "../../display";
import { GlTexture } from "../texture";
import { GlMaterial, GlObject, GlPolygon } from "../model";
import { GlBuffer } from "../resource";
import { SinglePainter } from "../painters/single";

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

${normalEncode.declare()}
${normalPerturb.declare()}
${parallaxPerturb.declare()}
${shininessEncode.declare()}

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 normalAndGlossiness;

void main(void) {
	mat3 tbn = mat3(tangent, bitangent, normal);

	vec3 eye = normalize(-point);
	vec2 coordParallax = ${parallaxPerturb.invoke(
    "heightMap",
    "coord",
    "eye",
    "heightParallaxScale",
    "heightParallaxBias",
    "tbn"
  )};

	// Color target: [normal.xy, shininess, glossiness]
	vec3 normalModified = ${normalPerturb.invoke(
    "normalMap",
    "coordParallax",
    "tbn"
  )};
	vec2 normalPack = ${normalEncode.invoke("normalModified")};

	float glossiness = texture(glossinessMap, coordParallax).r;
	float shininessPack = ${shininessEncode.invoke("shininess")};

	normalAndGlossiness = vec4(normalPack, shininessPack, glossiness);
}`;

const lightHeaderShader = `
${directionalLight.declare("HAS_SHADOW")}
${pointLight.declare("HAS_SHADOW")}

uniform ${directionalLightType} directionalLight;`;

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

${normalDecode.declare()}
${phongLight.declare("ZERO", "ZERO")}
${shininessDecode.declare()}

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
	vec3 normal = ${normalDecode.invoke("normalAndGlossinessSample.rg")};

	// Decode material properties
	float glossiness = normalAndGlossinessSample.a;
	float shininess = ${shininessDecode.invoke("normalAndGlossinessSample.b")};

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(gl_FragCoord.xy / viewportSize, depthSample.r);
	vec3 eye = normalize(-point);

	// Compute lightning parameters
	#if LIGHT_TYPE == ${DeferredLightingLightType.Directional}
		${resultLightType} light = ${directionalLight.invoke(
  "directionalLight",
  "lightDistanceCamera"
)};
	#elif LIGHT_TYPE == ${DeferredLightingLightType.Point}
    ${pointLightType} pointLight = ${pointLightType}(pointLightColor, pointLightPosition, pointLightRadius);
		${resultLightType} light = ${pointLight.invoke(
  "pointLight",
  "lightPositionCamera - point"
)};
	#endif

	float lightDiffusePower = ${phoneLightInvokeDiffusePower("light", "normal")};
	float lightSpecularPower = ${phoneLightInvokeSpecularPower(
    "light",
    "glossiness",
    "shininess",
    "normal",
    "eye"
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

${parallaxPerturb.declare()}
${linearToStandard.declare()}
${standardToLinear.declare()}

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
	mat3 tbn = mat3(tangent, bitangent, normal);

	vec3 eye = normalize(-point);
	vec2 coordParallax = ${parallaxPerturb.invoke(
    "heightMap",
    "coord",
    "eye",
    "heightParallaxScale",
    "heightParallaxBias",
    "tbn"
  )};

  vec4 albedoSample = texture(albedoMap, coordParallax);
	vec3 albedo = albedoFactor.rgb * ${standardToLinear.invoke("albedoSample.rgb")};
	float glossiness = glossinessFactor * texture(glossinessMap, coordParallax).r;

	// Emit final fragment color
	// FIXME: duplicate of "phong.lightInvoke" code
	vec3 color = albedo * (ambientLight + diffuseLight) + glossiness * specularLight;

	fragColor = vec4(${linearToStandard.invoke("color")}, 1.0);
}`;

type DeferredLightingConfiguration = {
  lightModel: DeferredLightingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  noHeightMap?: boolean;
  noNormalMap?: boolean;
};

type DeferredLightingScene = {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  objects: Iterable<GlObject>;
  pointLights?: PointLight[];
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type LightScene = {
  depthBuffer: GlTexture;
  index: GlBuffer;
  modelMatrix: Matrix4;
  normalAndGlossinessBuffer: GlTexture;
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
  viewportSize: Vector2;
};

type DirectionalLightScene = LightScene & {
  directionalLight: DirectionalLight;
  polygon: GlDirectionalLightPolygon;
};

type PointLightScene = LightScene & {
  billboardMatrix: Matrix4;
  polygon: GlPointLightPolygon;
};

type MaterialScene = ObjectScene & {
  ambientLightColor: Vector3;
  lightBuffer: GlTexture;
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

const loadGeometryPainter = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): GlPainter<DeferredLightingScene> => {
  // FIXME: should be disposed
  const shader = runtime.createShader(
    geometryVertexShader,
    geometryFragmentShader,
    {}
  );

  const polygonBinding = shader.declare<GlPolygon>();

  polygonBinding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  polygonBinding.setAttribute("normals", ({ normal }) => normal);
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

  const sceneBinding = shader.declare<DeferredLightingScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  const materialBinding = shader.declare<GlMaterial>();

  if (configuration.lightModel === DeferredLightingLightModel.Phong) {
    materialBinding.setUniform(
      "glossinessMap",
      shaderUniform.tex2dWhite(({ albedoMap: a, glossMap: g }) => g ?? a)
    );
    materialBinding.setUniform(
      "shininess",
      shaderUniform.number(({ shininess }) => shininess)
    );
  }

  materialBinding.setUniform(
    "heightMap",
    !configuration.noHeightMap
      ? shaderUniform.tex2dBlack(({ heightMap }) => heightMap)
      : shaderUniform.tex2dBlack(() => undefined)
  );
  materialBinding.setUniform(
    "heightParallaxBias",
    shaderUniform.number(({ heightParallaxBias }) => heightParallaxBias)
  );
  materialBinding.setUniform(
    "heightParallaxScale",
    shaderUniform.number(({ heightParallaxScale }) => heightParallaxScale)
  );
  materialBinding.setUniform(
    "normalMap",
    !configuration.noNormalMap
      ? shaderUniform.tex2dNormal(({ normalMap }) => normalMap)
      : shaderUniform.tex2dNormal(() => undefined)
  );

  return createObjectPainter(
    sceneBinding,
    geometryBinding,
    materialBinding,
    polygonBinding
  );
};

const loadLightBinding = <TScene extends LightScene>(
  runtime: GlRuntime,
  _: DeferredLightingConfiguration,
  type: DeferredLightingLightType
) => {
  // Setup light shader
  // FIXME: should be disposed
  const shader = runtime.createShader(lightVertexShader, lightFragmentShader, {
    LIGHT_TYPE: shaderDirective.number(type),
  });

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
    "depthBuffer",
    shaderUniform.tex2dBlack(({ depthBuffer }) => depthBuffer)
  );
  binding.setUniform(
    "normalAndGlossinessBuffer",
    shaderUniform.tex2dBlack((state) => state.normalAndGlossinessBuffer)
  );

  return binding;
};

const loadDirectionalLightPainter = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): GlPainter<DirectionalLightScene> => {
  const binding = loadLightBinding<DirectionalLightScene>(
    runtime,
    configuration,
    DeferredLightingLightType.Directional
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

  return new SinglePainter(binding, ({ index }) => index);
};

const loadPointLightPainter = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): GlPainter<PointLightScene> => {
  const binding = loadLightBinding<PointLightScene>(
    runtime,
    configuration,
    DeferredLightingLightType.Point
  );

  binding.setUniform(
    "billboardMatrix",
    shaderUniform.matrix4f(({ billboardMatrix }) => billboardMatrix)
  );
  binding.setAttribute("lightColor", ({ polygon: p }) => p.lightColor);
  binding.setAttribute("lightPosition", ({ polygon: p }) => p.lightPosition);
  binding.setAttribute("lightRadius", ({ polygon: p }) => p.lightRadius);
  binding.setAttribute("lightShift", ({ polygon: p }) => p.lightShift);

  return new SinglePainter(binding, ({ index }) => index);
};

const loadMaterialPainter = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): GlPainter<MaterialScene> => {
  // Build directives from configuration
  const directives: GlShaderDirectives = {};

  switch (configuration.lightModel) {
    case DeferredLightingLightModel.Phong:
      directives["LIGHT_MODEL_AMBIENT"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoAmbient
      );
      directives["LIGHT_MODEL_PHONG_DIFFUSE"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoDiffuse
      );
      directives["LIGHT_MODEL_PHONG_SPECULAR"] = shaderDirective.boolean(
        !configuration.lightModelPhongNoSpecular
      );

      break;
  }

  // Setup material shader
  // FIXME: should be disposed
  const shader = runtime.createShader(
    materialVertexShader,
    materialFragmentShader,
    directives
  );

  const polygonBinding = shader.declare<GlPolygon>();

  polygonBinding.setAttribute("coordinate", ({ coordinate }) => coordinate);
  polygonBinding.setAttribute("normals", ({ normal }) => normal);
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

  const sceneBinding = shader.declare<MaterialScene>();

  sceneBinding.setUniform(
    "projectionMatrix",
    shaderUniform.matrix4f(({ projectionMatrix }) => projectionMatrix)
  );
  sceneBinding.setUniform(
    "viewMatrix",
    shaderUniform.matrix4f(({ viewMatrix }) => viewMatrix)
  );

  sceneBinding.setUniform(
    "ambientLightColor",
    shaderUniform.vector3f(({ ambientLightColor }) => ambientLightColor)
  );
  sceneBinding.setUniform(
    "lightBuffer",
    shaderUniform.tex2dBlack(({ lightBuffer }) => lightBuffer)
  );

  const materialBinding = shader.declare<GlMaterial>();

  materialBinding.setUniform(
    "albedoFactor",
    shaderUniform.array4f(({ albedoFactor }) => albedoFactor)
  );
  materialBinding.setUniform(
    "albedoMap",
    shaderUniform.tex2dWhite(({ albedoMap }) => albedoMap)
  );

  if (configuration.lightModel >= DeferredLightingLightModel.Phong) {
    materialBinding.setUniform(
      "glossinessFactor",
      shaderUniform.number(({ glossFactor }) => glossFactor[0])
    );
    materialBinding.setUniform(
      "glossinessMap",
      shaderUniform.tex2dBlack(({ glossMap }) => glossMap)
    );
  }

  materialBinding.setUniform(
    "heightMap",
    !configuration.noHeightMap
      ? shaderUniform.tex2dBlack(({ heightMap }) => heightMap)
      : shaderUniform.tex2dBlack(() => undefined)
  );
  materialBinding.setUniform(
    "heightParallaxBias",
    shaderUniform.number(({ heightParallaxBias }) => heightParallaxBias)
  );
  materialBinding.setUniform(
    "heightParallaxScale",
    shaderUniform.number(({ heightParallaxScale }) => heightParallaxScale)
  );

  return createObjectPainter(
    sceneBinding,
    geometryBinding,
    materialBinding,
    polygonBinding
  );
};

class DeferredLightingRenderer implements Renderer<DeferredLightingScene> {
  public readonly depthBuffer: GlTexture;
  public readonly lightBuffer: GlTexture;
  public readonly normalAndGlossinessBuffer: GlTexture;

  private readonly directionalLightBillboard: GlDirectionalLightBillboard;
  private readonly directionalLightPainter: GlPainter<DirectionalLightScene>;
  private readonly fullscreenProjection: Matrix4;
  private readonly geometryPainter: GlPainter<DeferredLightingScene>;
  private readonly geometryTarget: GlTarget;
  private readonly lightTarget: GlTarget;
  private readonly materialPainter: GlPainter<MaterialScene>;
  private readonly pointLightBillboard: GlPointLightBillboard;
  private readonly pointLightPainter: GlPainter<PointLightScene>;
  private readonly runtime: GlRuntime;
  private readonly target: GlTarget;

  public constructor(
    runtime: GlRuntime,
    target: GlTarget,
    configuration: DeferredLightingConfiguration
  ) {
    const gl = runtime.context;
    const geometry = new GlTarget(gl, {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    });
    const light = new GlTarget(gl, {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    });

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
    this.lightBuffer = light.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.lightTarget = light;
    this.materialPainter = loadMaterialPainter(runtime, configuration);
    this.pointLightBillboard = pointLightBillboard(gl);
    this.pointLightPainter = loadPointLightPainter(runtime, configuration);
    this.normalAndGlossinessBuffer = geometry.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.runtime = runtime;
    this.target = target;
  }

  public dispose() {}

  public render(scene: DeferredLightingScene) {
    const {
      ambientLightColor,
      directionalLights,
      objects,
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

    // Render geometries to geometry buffers
    gl.disable(gl.BLEND);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.geometryTarget.clear(0);
    this.geometryPainter.paint(this.geometryTarget, scene);

    // Render lights to light buffer
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);

    this.lightTarget.setClearColor(1, 1, 1, 1);
    this.lightTarget.clear(0);

    // Draw directional lights using fullscreen quads
    if (directionalLights !== undefined) {
      // FIXME: a simple identity matrix could be use here at the cost of
      // passing 2 distinct "view" matrices to light shader:
      // - One for projecting our quad to fullscreen
      // - One for computing light directions in camera space
      const modelMatrix = Matrix4.fromObject(viewMatrix);

      modelMatrix.invert();

      for (const directionalLight of directionalLights) {
        this.directionalLightPainter.paint(this.lightTarget, {
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

      this.pointLightPainter.paint(this.lightTarget, {
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

    // Render materials to output
    gl.disable(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.materialPainter.paint(this.target, {
      ambientLightColor: ambientLightColor ?? Vector3.zero,
      lightBuffer: this.lightBuffer,
      objects,
      projectionMatrix,
      viewMatrix,
    });
  }

  public resize(size: Vector2) {
    this.geometryTarget.resize(size);
    this.lightTarget.resize(size);
  }
}

export {
  type DeferredLightingConfiguration,
  type DeferredLightingScene,
  DeferredLightingLightModel,
  DeferredLightingRenderer,
};
