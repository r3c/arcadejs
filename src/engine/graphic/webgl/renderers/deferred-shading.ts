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
  phongLightApply,
  phongLightCast,
  phongLightType,
} from "../shaders/phong";
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
import {
  GlShaderAttribute,
  GlShaderDirectives,
  shaderDirective,
  shaderUniform,
} from "../shader";
import { Renderer } from "../../display";
import { GlMaterial, GlObject, GlPolygon, createModel } from "../model";
import { GlTexture } from "../texture";
import { SinglePainter } from "../painters/single";
import { GlBuffer } from "../resource";
import { linearToStandard, luminance, standardToLinear } from "../shaders/rgb";
import { commonMesh } from "../../mesh";

const enum DeferredShadingLightModel {
  None,
  Phong,
}

const enum DeferredShadingLightType {
  Directional,
  Point,
}

const geometryVertexShader = `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coordinates;
in vec3 normals;
in vec3 positions;
in vec3 tangents;

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coordinate; // Texture coordinate
out vec3 normal; // Normal at point in camera space
out vec3 point; // Point position in camera space
out vec3 tangent; // Tangent at point in camera space

void main(void) {
  vec4 pointCamera = viewMatrix * modelMatrix * vec4(positions, 1.0);

  coordinate = coordinates;
  normal = normalize(normalMatrix * normals);
  point = pointCamera.xyz;
  tangent = normalize(normalMatrix * tangents);

  bitangent = cross(normal, tangent);

  gl_Position = projectionMatrix * pointCamera;
}`;

const geometryFragmentShader = `
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform vec4 specularColor;
uniform sampler2D specularMap;
uniform sampler2D normalMap;
uniform float shininess;

${luminance.declare()}
${normalEncode.declare()}
${normalPerturb.declare()}
${parallaxPerturb.declare()}
${shininessEncode.declare()}
${standardToLinear.declare()}

in vec3 bitangent;
in vec2 coordinate;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 diffuseAndShininess;
layout(location=1) out vec4 normalAndSpecular;

void main(void) {
  mat3 tbn = mat3(tangent, bitangent, normal);

  vec3 eye = normalize(-point);
  vec2 coordinateParallax = ${parallaxPerturb.invoke(
    "heightMap",
    "coordinate",
    "eye",
    "heightParallaxScale",
    "heightParallaxBias",
    "tbn"
  )};

  // Color target 1: [diffuse.rgb, shininess]
  vec4 diffuseSample = texture(diffuseMap, coordinateParallax);
  vec3 diffuseLinear = ${standardToLinear.invoke("diffuseSample.rgb")};
  vec3 diffuse = diffuseColor.rgb * diffuseLinear;
  float shininessPack = ${shininessEncode.invoke("shininess")};

  diffuseAndShininess = vec4(diffuse, shininessPack);

  // Color target 2: [normal.xy, zero, specular]
  vec3 normalModified = ${normalPerturb.invoke(
    "normalMap",
    "coordinateParallax",
    "tbn"
  )};
  vec2 normalPack = ${normalEncode.invoke("normalModified")};

  vec4 specularSample = texture(specularMap, coordinateParallax);
  vec3 specularLinear = ${standardToLinear.invoke("specularSample.rgb")};
  float specular = ${luminance.invoke("specularColor.rgb * specularLinear")};

  normalAndSpecular = vec4(normalPack, specular, 0.0);
}`;

const ambientHeaderShader = `
uniform vec3 ambientLightColor;`;

const ambientVertexShader = `
${ambientHeaderShader}

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 positions;

void main(void) {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * positions;
}`;

const ambientFragmentShader = `
${ambientHeaderShader}

uniform sampler2D diffuseAndShininess;

layout(location=0) out vec4 fragColor;

void main(void) {
  ivec2 bufferCoordinate = ivec2(gl_FragCoord.xy);

  // Read samples from texture buffers
  vec4 diffuseAndShininessSample = texelFetch(diffuseAndShininess, bufferCoordinate, 0);

  // Decode geometry and material properties from samples
  vec3 materialDiffuse = diffuseAndShininessSample.rgb;
  vec3 ambient = ambientLightColor * materialDiffuse;

  fragColor = vec4(ambient * float(LIGHT_MODEL_AMBIENT), 1.0);
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

uniform sampler2D diffuseAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndSpecular;

${normalDecode.declare()}
${phongLightApply.declare(
  "LIGHT_MODEL_PHONG_DIFFUSE",
  "LIGHT_MODEL_PHONG_SPECULAR"
)}
${phongLightCast.declare()}
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
  ivec2 bufferCoordinate = ivec2(gl_FragCoord.xy);

  // Read samples from texture buffers
  vec4 diffuseAndShininessSample = texelFetch(diffuseAndShininess, bufferCoordinate, 0);
  vec4 depthSample = texelFetch(depth, bufferCoordinate, 0);
  vec4 normalAndSpecularSample = texelFetch(normalAndSpecular, bufferCoordinate, 0);

  // Decode geometry and material properties from samples
  vec3 diffuseColor = diffuseAndShininessSample.rgb;
  vec3 normal = ${normalDecode.invoke("normalAndSpecularSample.rg")};
  vec3 specularColor = normalAndSpecularSample.bbb;
  float shininess = ${shininessDecode.invoke("diffuseAndShininessSample.a")};

  // Compute point in camera space from fragment coordinate and depth buffer
  vec3 point = getPoint(depthSample.r);
  vec3 eye = normalize(-point);

  // Compute lightning
  #if LIGHT_TYPE == ${DeferredShadingLightType.Directional}
    ${resultLightType} light = ${directionalLight.invoke(
  "directionalLight",
  "lightDistanceCamera"
)};
  #elif LIGHT_TYPE == ${DeferredShadingLightType.Point}
    ${pointLightType} pointLight = ${pointLightType}(pointLightColor, pointLightPosition, pointLightRadius);
    ${resultLightType} light = ${pointLight.invoke(
  "pointLight",
  "lightPositionCamera - point"
)};
  #endif

  ${phongLightType} phongLight = ${phongLightCast.invoke(
  "light",
  "shininess",
  "normal",
  "eye"
)};

  vec3 color = ${phongLightApply.invoke(
    "phongLight",
    "diffuseColor",
    "specularColor"
  )};

  fragColor = vec4(color, 1.0);
}`;

const postVertexShader = `
in vec3 positions;

void main(void) {
  gl_Position = vec4(positions, 1.0);
}`;

const postFragmentShader = `
${linearToStandard.declare()}
  
uniform sampler2D source;

layout(location=0) out vec4 fragColor;

void main(void) {
  ivec2 bufferCoordinate = ivec2(gl_FragCoord.xy);
  vec3 scene = texelFetch(source, bufferCoordinate, 0).rgb;

  fragColor = vec4(${linearToStandard.invoke("scene")}, 1.0);
}`;

type DeferredShadingConfiguration = {
  lightModel: DeferredShadingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  noHeightMap?: boolean;
  noNormalMap?: boolean;
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
  diffuseAndShininessBuffer: GlTexture;
  ambientLightColor: Vector3;
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type GeometryScene = ObjectScene & {
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
};

type LightScene = {
  diffuseAndShininessBuffer: GlTexture;
  depthBuffer: GlTexture;
  index: GlBuffer;
  normalAndSpecularBuffer: GlTexture;
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

type PostScene = {
  index: GlBuffer;
  position: GlShaderAttribute;
  source: GlTexture;
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

  polygonBinding.setAttribute("positions", ({ position }) => position);

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
    "diffuseAndShininess",
    shaderUniform.tex2dBlack((state) => state.diffuseAndShininessBuffer)
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

  polygonBinding.setAttribute("coordinates", ({ coordinate }) => coordinate);
  polygonBinding.setAttribute("normals", ({ normal }) => normal);
  polygonBinding.setAttribute("positions", ({ position }) => position);
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
    "diffuseColor",
    shaderUniform.vector4f(({ diffuseColor }) => diffuseColor)
  );
  materialBinding.setUniform(
    "diffuseMap",
    shaderUniform.tex2dWhite(({ diffuseMap }) => diffuseMap)
  );

  if (configuration.lightModel === DeferredShadingLightModel.Phong) {
    materialBinding.setUniform(
      "shininess",
      shaderUniform.number(({ shininess }) => shininess)
    );
    materialBinding.setUniform(
      "specularColor",
      shaderUniform.vector4f(({ specularColor }) => specularColor)
    );
    materialBinding.setUniform(
      "specularMap",
      shaderUniform.tex2dWhite(({ diffuseMap: a, specularMap: s }) => s ?? a)
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
      const inverseProjectionMatrix = Matrix4.fromSource(projectionMatrix);

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
    "diffuseAndShininess",
    shaderUniform.tex2dBlack((state) => state.diffuseAndShininessBuffer)
  );
  binding.setUniform(
    "depth",
    shaderUniform.tex2dBlack(({ depthBuffer }) => depthBuffer)
  );
  binding.setUniform(
    "normalAndSpecular",
    shaderUniform.tex2dBlack((state) => state.normalAndSpecularBuffer)
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

const loadPostPainter = (runtime: GlRuntime) => {
  const shader = runtime.createShader(postVertexShader, postFragmentShader, {});
  const binding = shader.declare<PostScene>();

  binding.setAttribute("positions", ({ position }) => position);
  binding.setUniform(
    "source",
    shaderUniform.tex2dBlack(({ source }) => source)
  );

  return new SinglePainter<PostScene>(binding, ({ index }) => index);
};

class DeferredShadingRenderer implements Renderer<DeferredShadingScene> {
  public readonly diffuseAndShininessBuffer: GlTexture;
  public readonly depthBuffer: GlTexture;
  public readonly normalAndSpecularBuffer: GlTexture;
  public readonly sceneBuffer: GlTexture;

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
  private readonly scenePainter: GlPainter<PostScene>;
  private readonly sceneTarget: GlTarget;
  private readonly target: GlTarget;

  public constructor(
    runtime: GlRuntime,
    target: GlTarget,
    configuration: DeferredShadingConfiguration
  ) {
    const gl = runtime.context;
    const geometryTarget = new GlTarget(gl, {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    });
    const quad = createModel(gl, commonMesh.quad);
    const sceneTarget = new GlTarget(gl, {
      x: gl.drawingBufferWidth,
      y: gl.drawingBufferHeight,
    });

    this.diffuseAndShininessBuffer = geometryTarget.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.ambientLightPainter = loadAmbientPainter(runtime, configuration);
    this.ambientLightObjects = [{ matrix: Matrix4.identity, model: quad }];
    this.depthBuffer = geometryTarget.setupDepthTexture(
      GlTextureFormat.Depth16,
      GlTextureType.Quad
    );
    this.directionalLightBillboard = directionalLightBillboard(gl);
    this.directionalLightPainter = loadDirectionalLightPainter(
      runtime,
      configuration
    );
    this.fullscreenProjection = Matrix4.fromIdentity([
      "setFromOrthographic",
      -1,
      1,
      -1,
      1,
      -1,
      1,
    ]);
    this.geometryPainter = loadGeometryPainter(runtime, configuration);
    this.geometryTarget = geometryTarget;
    this.pointLightBillboard = pointLightBillboard(gl);
    this.normalAndSpecularBuffer = geometryTarget.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.pointLightPainter = loadPointLightPainter(runtime, configuration);
    this.runtime = runtime;
    this.sceneBuffer = sceneTarget.setupColorTexture(
      GlTextureFormat.RGBA8,
      GlTextureType.Quad
    );
    this.scenePainter = loadPostPainter(runtime);
    this.sceneTarget = sceneTarget;
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
    const billboardMatrix = Matrix4.fromSource(viewMatrix);

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

    this.sceneTarget.clear(0);

    // Draw ambient light using fullscreen quad
    if (ambientLightColor !== undefined) {
      this.ambientLightPainter.paint(this.sceneTarget, {
        diffuseAndShininessBuffer: this.diffuseAndShininessBuffer,
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
      const modelMatrix = Matrix4.fromSource(viewMatrix);

      modelMatrix.invert();

      for (const directionalLight of directionalLights) {
        this.directionalLightPainter.paint(this.sceneTarget, {
          diffuseAndShininessBuffer: this.diffuseAndShininessBuffer,
          depthBuffer: this.depthBuffer,
          directionalLight,
          index: this.directionalLightBillboard.index,
          modelMatrix,
          normalAndSpecularBuffer: this.normalAndSpecularBuffer,
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

      this.pointLightPainter.paint(this.sceneTarget, {
        diffuseAndShininessBuffer: this.diffuseAndShininessBuffer,
        billboardMatrix,
        depthBuffer: this.depthBuffer,
        index: this.pointLightBillboard.index,
        modelMatrix: Matrix4.identity, // FIXME: remove from shader
        normalAndSpecularBuffer: this.normalAndSpecularBuffer,
        polygon: this.pointLightBillboard.polygon,
        projectionMatrix,
        viewMatrix,
        viewportSize,
      });
    }

    // Draw scene
    this.scenePainter.paint(this.target, {
      index: this.directionalLightBillboard.index, // FIXME: dedicated quad
      position: this.directionalLightBillboard.polygon.lightPosition,
      source: this.sceneBuffer,
    });
  }

  public resize(size: Vector2) {
    this.geometryTarget.resize(size);
    this.sceneTarget.resize(size);
  }
}

export {
  type DeferredShadingConfiguration,
  type DeferredShadingScene,
  DeferredShadingLightModel,
  DeferredShadingRenderer,
};
