import { Releasable } from "../../io/resource";
import {
  DirectionalLight,
  PointLight,
  directionalLight,
  directionalLightType,
  pointLight,
  pointLightType,
  resultLightType,
} from "../webgl/shaders/light";
import { Matrix4 } from "../../math/matrix";
import {
  normalEncode,
  normalPerturb,
  normalDecode,
} from "../webgl/shaders/normal";
import { parallaxPerturb } from "../webgl/shaders/parallax";
import {
  phongLightApply,
  phongLightCast,
  phongLightType,
  PhongLightVariant,
} from "../webgl/shaders/phong";
import { shininessDecode, shininessEncode } from "../webgl/shaders/shininess";
import { Vector2, Vector3 } from "../../math/vector";
import { GlRuntime, GlTarget, GlTextureFormat, GlTextureType } from "../webgl";
import {
  GlDirectionalLightPolygon,
  GlPointLightPolygon,
  createDirectionalLightBillboard,
  createPointLightBillboard,
} from "../webgl/billboard";
import {
  shaderWhen,
  shaderCase,
  GlShaderAttribute,
  uniform,
  GlShaderSource,
} from "../webgl/shader";
import { GlMaterial, GlMesh, GlPolygon, createModel } from "../webgl/model";
import { GlTexture } from "../webgl/texture";
import { GlBuffer } from "../webgl/resource";
import {
  linearToStandard,
  luminance,
  standardToLinear,
} from "../webgl/shaders/rgb";
import { commonMesh } from "../mesh";
import { Renderer } from "./definition";
import {
  GlMeshBinder,
  GlMeshMatrix,
  GlMeshRendererMode,
  GlMeshScene,
  createGlMeshRenderer,
} from "./gl-mesh";
import { createGlBindingPainter } from "../painter";

const enum DeferredShadingLightModel {
  None,
  Phong,
}

const enum DeferredShadingLightType {
  Directional,
  Point,
}

type AmbientLightDirective = {
  lightModelPhongAmbient: boolean;
};

type LocalLightDirective = {
  hasShadow: boolean;
  lightModelPhongDiffuse: boolean;
  lightModelPhongSpecular: boolean;
  type: DeferredShadingLightType;
};

const createGeometrySource = (): GlShaderSource => ({
  vertex: `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coordinates;
in vec3 normals;
in vec3 positions;
in vec3 tangents;

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coordinate; // Texture coordinates
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
}`,

  fragment: `
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform vec4 specularColor;
uniform sampler2D specularMap;
uniform sampler2D normalMap;
uniform float shininess;

${luminance.declare({})}
${normalEncode.declare({})}
${normalPerturb.declare({})}
${parallaxPerturb.declare({})}
${shininessEncode.declare({})}
${standardToLinear.declare({})}

in vec3 bitangent;
in vec2 coordinate;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 diffuseAndShininess;
layout(location=1) out vec4 normalAndSpecular;

void main(void) {
  mat3 tbn = mat3(tangent, bitangent, normal);

  vec3 eyeDirection = normalize(-point);
  vec2 coordinateParallax = ${parallaxPerturb.invoke({
    coordinate: "coordinate",
    eyeDirection: "eyeDirection",
    parallaxBias: "heightParallaxBias",
    parallaxScale: "heightParallaxScale",
    sampler: "heightMap",
    tbn: "tbn",
  })};

  // Color target 1: [diffuse.rgb, shininess]
  vec4 diffuseSample = texture(diffuseMap, coordinateParallax);
  vec3 diffuseLinear = ${standardToLinear.invoke({
    standard: "diffuseSample.rgb",
  })};
  vec3 diffuse = diffuseColor.rgb * diffuseLinear;
  float shininessPack = ${shininessEncode.invoke({ decoded: "shininess" })};

  diffuseAndShininess = vec4(diffuse, shininessPack);

  // Color target 2: [normal.xy, zero, specular]
  vec3 normalModified = ${normalPerturb.invoke({
    coordinate: "coordinateParallax",
    sampler: "normalMap",
    tbn: "tbn",
  })};
  vec2 normalPack = ${normalEncode.invoke({ decoded: "normalModified" })};

  vec4 specularSample = texture(specularMap, coordinateParallax);
  vec3 specularLinear = ${standardToLinear.invoke({
    standard: "specularSample.rgb",
  })};
  float specular = ${luminance.invoke({
    color: "specularColor.rgb * specularLinear",
  })};

  normalAndSpecular = vec4(normalPack, specular, 0.0);
}`,
});

const createAmbientLightSource = (
  directive: AmbientLightDirective
): GlShaderSource => {
  const header = `
uniform vec3 ambientLightColor;`;

  return {
    vertex: `
${header}

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 positions;

void main(void) {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * positions;
}`,

    fragment: `
${header}

uniform sampler2D diffuseAndShininess;

layout(location=0) out vec4 fragColor;

void main(void) {
  ivec2 bufferCoordinate = ivec2(gl_FragCoord.xy);

  // Read samples from texture buffers
  vec4 diffuseAndShininessSample = texelFetch(diffuseAndShininess, bufferCoordinate, 0);

  // Decode geometry and material properties from samples
  vec3 materialDiffuse = diffuseAndShininessSample.rgb;
  vec3 ambient = ambientLightColor * materialDiffuse;

  fragColor = vec4(ambient * ${shaderWhen(
    directive.lightModelPhongAmbient,
    "1.0",
    "0.0"
  )}, 1.0);
}`,
  };
};

const createLocalLightSource = (directive: LocalLightDirective) => {
  const header = `
${directionalLight.declare(directive)}
${pointLight.declare(directive)}

uniform ${directionalLightType} directionalLight;`;

  return {
    vertex: `
${header}

uniform mat4 billboardMatrix;
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec3 lightColor;
in vec3 lightPosition;
in float lightRadius;
in vec3 lightShift;

${shaderCase(
  directive.type,
  [
    DeferredShadingLightType.Directional,
    `
out vec3 lightDistanceCamera;`,
  ],
  [
    DeferredShadingLightType.Point,
    `
out vec3 lightPositionCamera;
out vec3 pointLightColor;
out vec3 pointLightPosition;
out float pointLightRadius;`,
  ]
)}

vec3 toCameraDirection(in vec3 worldDirection) {
  return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
  return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
${shaderCase(
  directive.type,
  [
    DeferredShadingLightType.Directional,
    `
  lightDistanceCamera = toCameraDirection(directionalLight.direction);`,
  ],
  [
    DeferredShadingLightType.Point,
    `
  lightPositionCamera = toCameraPosition(lightPosition);
  pointLightColor = lightColor;
  pointLightPosition = lightPosition;
  pointLightRadius = lightRadius;`,
  ]
)}

  gl_Position =
    projectionMatrix * viewMatrix * modelMatrix * vec4(lightPosition, 1.0) +
    projectionMatrix * billboardMatrix * modelMatrix * vec4(lightShift, 0.0);
}`,

    fragment: `
${header}

uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D diffuseAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndSpecular;

${normalDecode.declare({})}
${phongLightApply.declare({
  diffuse: directive.lightModelPhongDiffuse,
  specular: directive.lightModelPhongSpecular,
})}
${phongLightCast.declare({ variant: PhongLightVariant.Standard })}
${shininessDecode.declare({})}

${shaderCase(
  directive.type,
  [
    DeferredShadingLightType.Directional,
    `
in vec3 lightDistanceCamera;`,
  ],
  [
    DeferredShadingLightType.Point,
    `
in vec3 lightPositionCamera;
in vec3 pointLightColor;
in vec3 pointLightPosition;
in float pointLightRadius;
`,
  ]
)}

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
  vec3 normal = ${normalDecode.invoke({
    encoded: "normalAndSpecularSample.rg",
  })};
  vec3 specularColor = normalAndSpecularSample.bbb;
  float shininess = ${shininessDecode.invoke({
    encoded: "diffuseAndShininessSample.a",
  })};

  // Compute point in camera space from fragment coordinate and depth buffer
  vec3 point = getPoint(depthSample.r);
  vec3 eye = normalize(-point);

  // Compute lightning parameters
${shaderCase(
  directive.type,
  [
    DeferredShadingLightType.Directional,
    `
  ${resultLightType} light = ${directionalLight.invoke({
      distanceCamera: "lightDistanceCamera",
      light: "directionalLight",
    })};`,
  ],
  [
    DeferredShadingLightType.Point,
    `
  vec3 lightDistanceCamera = lightPositionCamera - point;
  ${pointLightType} pointLight = ${pointLightType}(pointLightColor, pointLightPosition, pointLightRadius);
  ${resultLightType} light = ${pointLight.invoke({
      distanceCamera: "lightDistanceCamera",
      light: "pointLight",
    })};`,
  ]
)}

  ${phongLightType} phongLight = ${phongLightCast.invoke({
      eye: "eye",
      light: "light",
      normal: "normal",
      shininess: "shininess",
    })};

  vec3 color = ${phongLightApply.invoke({
    lightCast: "phongLight",
    diffuseColor: "diffuseColor",
    specularColor: "specularColor",
  })};

  fragColor = vec4(color, 1.0);
}`,
  };
};

const createPostSource = (): GlShaderSource => ({
  vertex: `
in vec3 positions;

void main(void) {
  gl_Position = vec4(positions, 1.0);
}`,

  fragment: `
${linearToStandard.declare({})}
  
uniform sampler2D source;

layout(location=0) out vec4 fragColor;

void main(void) {
  ivec2 bufferCoordinate = ivec2(gl_FragCoord.xy);
  vec3 scene = texelFetch(source, bufferCoordinate, 0).rgb;

  fragColor = vec4(${linearToStandard.invoke({ linear: "scene" })}, 1.0);
}`,
});

type DeferredShadingConfiguration = {
  lightModel: DeferredShadingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  noHeightMap?: boolean;
  noNormalMap?: boolean;
};

type DeferredShadingRenderer = Releasable &
  Renderer<GlTarget, DeferredShadingScene, DeferredShadingSubject> & {
    // FIXME: debug
    depthBuffer: GlTexture;
    diffuseAndShininessBuffer: GlTexture;
    normalAndSpecularBuffer: GlTexture;
  };

type DeferredShadingScene = GlMeshScene & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  pointLights?: PointLight[];
  projection: Matrix4;
};

type DeferredShadingSubject = {
  mesh: GlMesh;
};

type AmbientLightScene = GlMeshScene & {
  diffuseAndShininessBuffer: GlTexture;
  ambientLightColor: Vector3;
  projection: Matrix4;
};

type GeometryScene = GlMeshScene & {
  projection: Matrix4;
};

type LightScene = GlMeshScene & {
  diffuseAndShininessBuffer: GlTexture;
  depthBuffer: GlTexture;
  indexBuffer: GlBuffer;
  model: Matrix4;
  normalAndSpecularBuffer: GlTexture;
  projection: Matrix4;
  viewport: Vector2;
};

type DirectionalLightScene = LightScene & {
  directionalLight: DirectionalLight;
  polygon: GlDirectionalLightPolygon;
};

type PointLightScene = LightScene & {
  billboard: Matrix4;
  polygon: GlPointLightPolygon;
};

type PostScene = {
  indexBuffer: GlBuffer;
  position: GlShaderAttribute;
  source: GlTexture;
};

const createAmbientLightBinder = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
): GlMeshBinder<AmbientLightScene> => {
  return () => {
    const shader = runtime.createShader(
      createAmbientLightSource({
        lightModelPhongAmbient: !configuration.lightModelPhongNoAmbient,
      })
    );

    const polygonBinding = shader.declare<GlPolygon>();

    polygonBinding.setAttribute("positions", ({ position }) => position);

    const matrixBinding = shader.declare<GlMeshMatrix>();

    matrixBinding.setUniform(
      "modelMatrix",
      uniform.matrix4f(({ model }) => model)
    );

    const sceneBinding = shader.declare<AmbientLightScene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      uniform.matrix4f(({ projection }) => projection)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      uniform.matrix4f(({ view }) => view)
    );
    sceneBinding.setUniform(
      "diffuseAndShininess",
      uniform.tex2dBlack((state) => state.diffuseAndShininessBuffer)
    );
    sceneBinding.setUniform(
      "ambientLightColor",
      uniform.vector3f(({ ambientLightColor }) => ambientLightColor)
    );

    const materialBinding = shader.declare<GlMaterial>();

    return {
      release: shader.release,
      material: materialBinding,
      matrix: matrixBinding,
      polygon: polygonBinding,
      scene: sceneBinding,
    };
  };
};

const createGeometryBinder = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
): GlMeshBinder<GeometryScene> => {
  return (feature) => {
    const shader = runtime.createShader(createGeometrySource());

    // Setup geometry shader
    const polygonBinding = shader.declare<GlPolygon>();

    if (feature.hasCoordinate) {
      polygonBinding.setAttribute(
        "coordinates",
        ({ coordinate }) => coordinate
      );
    }

    if (feature.hasNormal) {
      polygonBinding.setAttribute("normals", ({ normal }) => normal);
    }

    polygonBinding.setAttribute("positions", ({ position }) => position);

    if (feature.hasTangent) {
      polygonBinding.setAttribute("tangents", ({ tangent }) => tangent);
    }

    if (feature.hasTint) {
      // FIXME: missing support for tints
    }

    const matrixBinding = shader.declare<GlMeshMatrix>();

    matrixBinding.setUniform(
      "modelMatrix",
      uniform.matrix4f(({ model }) => model)
    );
    matrixBinding.setUniform(
      "normalMatrix",
      uniform.matrix3f(({ normal }) => normal)
    );

    const sceneBinding = shader.declare<GeometryScene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      uniform.matrix4f(({ projection }) => projection)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      uniform.matrix4f(({ view }) => view)
    );

    const materialBinding = shader.declare<GlMaterial>();

    materialBinding.setUniform(
      "diffuseColor",
      uniform.vector4f(({ diffuseColor }) => diffuseColor)
    );
    materialBinding.setUniform(
      "diffuseMap",
      uniform.tex2dWhite(({ diffuseMap }) => diffuseMap)
    );

    if (configuration.lightModel === DeferredShadingLightModel.Phong) {
      materialBinding.setUniform(
        "shininess",
        uniform.number(({ shininess }) => shininess)
      );
      materialBinding.setUniform(
        "specularColor",
        uniform.vector4f(({ specularColor }) => specularColor)
      );
      materialBinding.setUniform(
        "specularMap",
        uniform.tex2dWhite(({ diffuseMap: a, specularMap: s }) => s ?? a)
      );
    }

    materialBinding.setUniform(
      "heightMap",
      !configuration.noHeightMap
        ? uniform.tex2dBlack(({ heightMap }) => heightMap)
        : uniform.tex2dBlack(() => undefined)
    );
    materialBinding.setUniform(
      "heightParallaxBias",
      uniform.number(({ heightParallaxBias }) => heightParallaxBias)
    );
    materialBinding.setUniform(
      "heightParallaxScale",
      uniform.number(({ heightParallaxScale }) => heightParallaxScale)
    );
    materialBinding.setUniform(
      "normalMap",
      !configuration.noNormalMap
        ? uniform.tex2dNormal(({ normalMap }) => normalMap)
        : uniform.tex2dNormal(() => undefined)
    );

    return {
      release: shader.release,
      material: materialBinding,
      matrix: matrixBinding,
      polygon: polygonBinding,
      scene: sceneBinding,
    };
  };
};

const loadLightBinding = <TScene extends LightScene>(
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration,
  type: DeferredShadingLightType
) => {
  // Setup light shader
  // FIXME: should be released
  const shader = runtime.createShader(
    createLocalLightSource({
      hasShadow: false, // FIXME: no shadow support
      lightModelPhongDiffuse: !configuration.lightModelPhongNoDiffuse,
      lightModelPhongSpecular: !configuration.lightModelPhongNoSpecular,
      type,
    })
  );

  const binding = shader.declare<TScene>();

  binding.setUniform(
    "modelMatrix",
    uniform.matrix4f(({ model }) => model)
  );
  binding.setUniform(
    "inverseProjectionMatrix",
    uniform.matrix4f(({ projection }) => {
      const inverseProjectionMatrix = Matrix4.fromSource(projection);

      inverseProjectionMatrix.invert();

      return inverseProjectionMatrix;
    })
  );
  binding.setUniform(
    "projectionMatrix",
    uniform.matrix4f(({ projection }) => projection)
  );
  binding.setUniform(
    "viewMatrix",
    uniform.matrix4f(({ view }) => view)
  );
  binding.setUniform(
    "viewportSize",
    uniform.vector2f(({ viewport }) => viewport)
  );
  binding.setUniform(
    "diffuseAndShininess",
    uniform.tex2dBlack((state) => state.diffuseAndShininessBuffer)
  );
  binding.setUniform(
    "depth",
    uniform.tex2dBlack(({ depthBuffer }) => depthBuffer)
  );
  binding.setUniform(
    "normalAndSpecular",
    uniform.tex2dBlack((state) => state.normalAndSpecularBuffer)
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
    uniform.vector3f(({ directionalLight }) => directionalLight.color)
  );
  binding.setUniform(
    "directionalLight.direction",
    uniform.vector3f(({ directionalLight }) => directionalLight.direction)
  );
  binding.setAttribute("lightPosition", ({ polygon: p }) => p.lightPosition);

  return createGlBindingPainter(binding, ({ indexBuffer }) => indexBuffer);
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
    uniform.matrix4f(({ billboard }) => billboard)
  );
  binding.setAttribute("lightColor", ({ polygon: p }) => p.lightColor);
  binding.setAttribute("lightPosition", ({ polygon: p }) => p.lightPosition);
  binding.setAttribute("lightRadius", ({ polygon: p }) => p.lightRadius);
  binding.setAttribute("lightShift", ({ polygon: p }) => p.lightShift);

  return createGlBindingPainter(binding, ({ indexBuffer }) => indexBuffer);
};

const loadPostPainter = (runtime: GlRuntime) => {
  const shader = runtime.createShader(createPostSource());
  const binding = shader.declare<PostScene>();

  binding.setAttribute("positions", ({ position }) => position);
  binding.setUniform(
    "source",
    uniform.tex2dBlack(({ source }) => source)
  );

  return createGlBindingPainter(binding, ({ indexBuffer }) => indexBuffer);
};

const createDeferredShadingRenderer = (
  runtime: GlRuntime,
  configuration: DeferredShadingConfiguration
): DeferredShadingRenderer => {
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

  const diffuseAndShininessBuffer = geometryTarget.setupColorTexture(
    GlTextureFormat.RGBA8,
    GlTextureType.Quad
  );
  const ambientLightBinder = createAmbientLightBinder(runtime, configuration);
  const ambientLightRenderer = createGlMeshRenderer(
    GlMeshRendererMode.Triangle,
    ambientLightBinder
  );
  ambientLightRenderer.append(quad.mesh);
  const depthBuffer = geometryTarget.setupDepthTexture(
    GlTextureFormat.Depth16,
    GlTextureType.Quad
  );
  const directionalLightBillboard = createDirectionalLightBillboard(gl);
  const directionalLightPainter = loadDirectionalLightPainter(
    runtime,
    configuration
  );
  const fullscreenProjection = Matrix4.fromIdentity([
    "setFromOrthographic",
    -1,
    1,
    -1,
    1,
    -1,
    1,
  ]);
  const geometryBinder = createGeometryBinder(runtime, configuration);
  const geometryRenderer = createGlMeshRenderer(
    GlMeshRendererMode.Triangle,
    geometryBinder
  );
  const pointLightBillboard = createPointLightBillboard(gl);
  const normalAndSpecularBuffer = geometryTarget.setupColorTexture(
    GlTextureFormat.RGBA8,
    GlTextureType.Quad
  );
  const pointLightPainter = loadPointLightPainter(runtime, configuration);
  const sceneBuffer = sceneTarget.setupColorTexture(
    GlTextureFormat.RGBA8,
    GlTextureType.Quad
  );
  const scenePainter = loadPostPainter(runtime);

  return {
    depthBuffer,
    diffuseAndShininessBuffer,
    normalAndSpecularBuffer,

    release() {
      ambientLightRenderer.release();
      geometryRenderer.release();
      quad.release();
    },

    append(subject) {
      const { mesh } = subject;

      return geometryRenderer.append(mesh);
    },

    render(target, scene) {
      const {
        ambientLightColor,
        directionalLights,
        pointLights,
        projection,
        view,
      } = scene;

      const viewport = {
        x: gl.drawingBufferWidth,
        y: gl.drawingBufferHeight,
      };

      // Build billboard matrix from view matrix to get camera-facing quads by
      // copying view matrix and cancelling any rotation.
      const billboard = Matrix4.fromSource(view);

      billboard.v00 = 1;
      billboard.v01 = 0;
      billboard.v02 = 0;
      billboard.v10 = 0;
      billboard.v11 = 1;
      billboard.v12 = 0;
      billboard.v20 = 0;
      billboard.v21 = 0;
      billboard.v22 = 1;

      // Draw scene geometries
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.disable(gl.BLEND);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      geometryTarget.clear(0);
      geometryRenderer.render(geometryTarget, scene);

      // Draw scene lights
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      sceneTarget.clear(0);

      // Draw ambient light using fullscreen quad
      if (ambientLightColor !== undefined) {
        ambientLightRenderer.render(sceneTarget, {
          diffuseAndShininessBuffer: diffuseAndShininessBuffer,
          ambientLightColor,
          projection: fullscreenProjection,
          view: Matrix4.identity,
        });
      }

      // Draw directional lights using fullscreen quads
      if (directionalLights !== undefined) {
        // FIXME: a simple identity matrix could be use here at the cost of
        // passing 2 distinct "view" matrices to light shader:
        // - One for projecting our quad to fullscreen
        // - One for computing light directions in camera space
        const model = Matrix4.fromSource(view);

        model.invert();

        for (const directionalLight of directionalLights) {
          directionalLightPainter.paint(sceneTarget, {
            diffuseAndShininessBuffer: diffuseAndShininessBuffer,
            depthBuffer: depthBuffer,
            directionalLight,
            indexBuffer: directionalLightBillboard.indexBuffer,
            model,
            normalAndSpecularBuffer: normalAndSpecularBuffer,
            polygon: directionalLightBillboard.polygon,
            projection: fullscreenProjection,
            view,
            viewport,
          });
        }
      }

      // Draw point lights using quads
      if (pointLights !== undefined) {
        pointLightBillboard.set(pointLights);

        pointLightPainter.paint(sceneTarget, {
          diffuseAndShininessBuffer: diffuseAndShininessBuffer,
          billboard,
          depthBuffer,
          indexBuffer: pointLightBillboard.indexBuffer,
          model: Matrix4.identity, // FIXME: remove from shader
          normalAndSpecularBuffer: normalAndSpecularBuffer,
          polygon: pointLightBillboard.polygon,
          projection,
          view,
          viewport,
        });
      }

      // Draw scene
      scenePainter.paint(target, {
        indexBuffer: directionalLightBillboard.indexBuffer, // FIXME: dedicated quad
        position: directionalLightBillboard.polygon.lightPosition,
        source: sceneBuffer,
      });
    },

    resize(size: Vector2) {
      geometryTarget.resize(size);
      sceneTarget.resize(size);
    },
  };
};

export {
  type DeferredShadingConfiguration,
  type DeferredShadingRenderer,
  type DeferredShadingScene,
  type DeferredShadingSubject,
  DeferredShadingLightModel,
  createDeferredShadingRenderer,
};
