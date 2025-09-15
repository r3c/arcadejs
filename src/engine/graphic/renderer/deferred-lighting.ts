import { Disposable } from "../../language/lifecycle";
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
import {
  linearToStandard,
  luminance,
  standardToLinear,
} from "../webgl/shaders/rgb";
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
  uniform,
  shaderWhen,
  shaderCase,
  GlShaderSource,
} from "../webgl/shader";
import { GlTexture } from "../webgl/texture";
import { GlMaterial, GlMesh, GlPolygon } from "../webgl/model";
import { GlBuffer } from "../webgl/resource";
import { Renderer } from "./definition";
import {
  GlMeshBinder,
  GlMeshMatrix,
  GlMeshRendererMode,
  GlMeshScene,
  createGlMeshRenderer,
} from "./gl-mesh";
import { createGlBindingPainter, Painter } from "../painter";

const enum DeferredLightingLightModel {
  None,
  Phong,
}

const enum DeferredLightingLightType {
  Directional,
  Point,
}

type LightDirective = {
  hasShadow: boolean;
  type: DeferredLightingLightType;
};

type MaterialDirective = {
  lightModelPhongAmbient: boolean;
  lightModelPhongDiffuse: boolean;
  lightModelPhongSpecular: boolean;
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
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D normalMap;
uniform float shininess;

${normalEncode.declare({})}
${normalPerturb.declare({})}
${parallaxPerturb.declare({})}
${shininessEncode.declare({})}

in vec3 bitangent;
in vec2 coordinate;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 normalAndGloss;

void main(void) {
  mat3 tbn = mat3(tangent, bitangent, normal);

  vec3 eye = normalize(-point);
  vec2 coordParallax = ${parallaxPerturb.invoke({
    coordinate: "coordinate",
    eyeDirection: "eye",
    parallaxScale: "heightParallaxScale",
    parallaxBias: "heightParallaxBias",
    sampler: "heightMap",
    tbn: "tbn",
  })};

  // Color target: [normal.xy, shininess, unused]
  vec3 normalModified = ${normalPerturb.invoke({
    sampler: "normalMap",
    coordinate: "coordParallax",
    tbn: "tbn",
  })};
  vec2 normalPack = ${normalEncode.invoke({ decoded: "normalModified" })};

  float shininessPack = ${shininessEncode.invoke({ decoded: "shininess" })};

  normalAndGloss = vec4(normalPack, shininessPack, 0.0);
}`,
});

const createLightSource = (directive: LightDirective): GlShaderSource => {
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
    DeferredLightingLightType.Directional,
    `
out vec3 lightDistanceCamera;`,
  ],
  [
    DeferredLightingLightType.Point,
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
    DeferredLightingLightType.Directional,
    `
  lightDistanceCamera = toCameraDirection(directionalLight.direction);`,
  ],
  [
    DeferredLightingLightType.Point,
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

uniform sampler2D depthBuffer;
uniform sampler2D normalAndGlossBuffer;

${luminance.declare({})}
${normalDecode.declare({})}
${phongLightApply.declare({ diffuse: true, specular: true })}
${phongLightCast.declare({ variant: PhongLightVariant.Standard })}
${shininessDecode.declare({})}

${shaderCase(
  directive.type,
  [
    DeferredLightingLightType.Directional,
    `
in vec3 lightDistanceCamera;`,
  ],
  [
    DeferredLightingLightType.Point,
    `
in vec3 lightPositionCamera;
in vec3 pointLightColor;
in vec3 pointLightPosition;
in float pointLightRadius;`,
  ]
)}

layout(location=0) out vec4 fragColor;

vec3 getPoint(in vec2 fragCoord, in float fragDepth) {
  vec4 pointClip = vec4(fragCoord, fragDepth, 1.0) * 2.0 - 1.0;
  vec4 pointCamera = inverseProjectionMatrix * pointClip;

  return pointCamera.xyz / pointCamera.w;
}

void main(void) {
  ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

  // Read samples from texture buffers
  vec4 normalAndGlossSample = texelFetch(normalAndGlossBuffer, bufferCoord, 0);
  vec4 depthSample = texelFetch(depthBuffer, bufferCoord, 0);

  // Decode geometry
  vec3 normal = ${normalDecode.invoke({ encoded: "normalAndGlossSample.rg" })};

  // Decode material properties
  float shininess = ${shininessDecode.invoke({
    encoded: "normalAndGlossSample.b",
  })};

  // Compute point in camera space from fragment coordinate and depth buffer
  vec3 point = getPoint(gl_FragCoord.xy / viewportSize, depthSample.r);
  vec3 eye = normalize(-point);

  // Compute lightning parameters
${shaderCase(
  directive.type,
  [
    DeferredLightingLightType.Directional,
    `
  ${resultLightType} light = ${directionalLight.invoke({
      distanceCamera: "lightDistanceCamera",
      light: "directionalLight",
    })};`,
  ],
  [
    DeferredLightingLightType.Point,
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

  // Emit lighting parameters
  // Note: specular light approximate using ony channel
  vec3 diffuseColor = phongLight.diffuseStrength * phongLight.color;
  vec3 specularColor = phongLight.specularStrength * phongLight.color;
  float specularValue = ${luminance.invoke({ color: "specularColor" })};

  fragColor = exp2(-vec4(diffuseColor, specularValue));
}`,
  };
};

const createMaterialSource = (
  directive: MaterialDirective
): GlShaderSource => ({
  vertex: `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coordinates;
in vec3 normals;
in vec3 positions;
in vec3 tangents;

out vec3 bitangent;
out vec2 coordinate;
out vec3 normal;
out vec3 point;
out vec3 tangent;

void main(void) {
  vec4 pointCamera = viewMatrix * modelMatrix * vec4(positions, 1.0);

  normal = normalize(normalMatrix * normals);
  tangent = normalize(normalMatrix * tangents);

  bitangent = cross(normal, tangent);
  coordinate = coordinates;
  point = pointCamera.xyz;

  gl_Position = projectionMatrix * pointCamera;
}`,

  fragment: `
uniform vec3 ambientLightColor;
uniform sampler2D lightBuffer;

uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform vec4 specularColor;
uniform sampler2D specularMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;

${parallaxPerturb.declare({})}
${linearToStandard.declare({})}
${standardToLinear.declare({})}

in vec3 bitangent;
in vec2 coordinate;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 fragColor;

void main(void) {
  // Read light properties from texture buffers
  ivec2 bufferCoord = ivec2(gl_FragCoord.xy);
  vec4 lightSample = -log2(texelFetch(lightBuffer, bufferCoord, 0));

  // Read material properties from uniforms
  mat3 tbn = mat3(tangent, bitangent, normal);

  vec3 eyeDirection = normalize(-point);
  vec2 coordinateParallax = ${parallaxPerturb.invoke({
    coordinate: "coordinate",
    eyeDirection: "eyeDirection",
    parallaxScale: "heightParallaxScale",
    parallaxBias: "heightParallaxBias",
    sampler: "heightMap",
    tbn: "tbn",
  })};

  vec4 diffuseSample = texture(diffuseMap, coordinateParallax);
  vec3 diffuseLinear = ${standardToLinear.invoke({
    standard: "diffuseSample.rgb",
  })};
  vec3 diffuse = diffuseColor.rgb * diffuseLinear;

  vec4 specularSample = texture(specularMap, coordinateParallax);
  vec3 specularLinear = ${standardToLinear.invoke({
    standard: "specularSample.rgb",
  })};
  vec3 specular = specularColor.rgb * specularLinear;

  // Emit final fragment color
  // Note: specular light approximate using ony channel
  vec3 diffuseLightColor = lightSample.rgb;
  vec3 specularLightColor = lightSample.aaa;

  vec3 color =
    diffuse * ambientLightColor * ${shaderWhen(
      directive.lightModelPhongAmbient,
      "1.0",
      "0.0"
    )} +
    diffuse * diffuseLightColor * ${shaderWhen(
      directive.lightModelPhongDiffuse,
      "1.0",
      "0.0"
    )} +
    specular * specularLightColor * ${shaderWhen(
      directive.lightModelPhongSpecular,
      "1.0",
      "0.0"
    )};

  fragColor = vec4(${linearToStandard.invoke({ linear: "color" })}, 1.0);
}`,
});

type DeferredLightingConfiguration = {
  lightModel: DeferredLightingLightModel;
  lightModelPhongNoAmbient?: boolean;
  lightModelPhongNoDiffuse?: boolean;
  lightModelPhongNoSpecular?: boolean;
  noHeightMap?: boolean;
  noNormalMap?: boolean;
};

type DeferredLightingRenderer = Disposable &
  Renderer<GlTarget, DeferredLightingScene, DeferredLightingSubject> & {
    // FIXME: debug
    depthBuffer: GlTexture;
    lightBuffer: GlTexture;
    normalAndGlossBuffer: GlTexture;
  };

type DeferredLightingScene = GlMeshScene & {
  ambientLightColor?: Vector3;
  directionalLights?: DirectionalLight[];
  pointLights?: PointLight[];
  projection: Matrix4;
};

type DeferredLightingSubject = {
  mesh: GlMesh;
};

type LightScene = GlMeshScene & {
  depthBuffer: GlTexture;
  indexBuffer: GlBuffer;
  model: Matrix4;
  normalAndGlossBuffer: GlTexture;
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

type MaterialScene = GlMeshScene & {
  ambientLightColor: Vector3;
  lightBuffer: GlTexture;
  projection: Matrix4;
};

const createGeometryBinder = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): GlMeshBinder<DeferredLightingScene> => {
  return (feature) => {
    const shader = runtime.createShader(createGeometrySource());

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

    const sceneBinding = shader.declare<DeferredLightingScene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      uniform.matrix4f(({ projection }) => projection)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      uniform.matrix4f(({ view }) => view)
    );

    const materialBinding = shader.declare<GlMaterial>();

    if (configuration.lightModel === DeferredLightingLightModel.Phong) {
      materialBinding.setUniform(
        "shininess",
        uniform.number(({ shininess }) => shininess)
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
      dispose: shader.dispose,
      material: materialBinding,
      matrix: matrixBinding,
      polygon: polygonBinding,
      scene: sceneBinding,
    };
  };
};

const loadLightBinding = <TScene extends LightScene>(
  runtime: GlRuntime,
  _: DeferredLightingConfiguration,
  type: DeferredLightingLightType
) => {
  // Setup light shader
  // FIXME: should be disposed
  const shader = runtime.createShader(
    createLightSource({ hasShadow: false, type })
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
    "depthBuffer",
    uniform.tex2dBlack(({ depthBuffer }) => depthBuffer)
  );
  binding.setUniform(
    "normalAndGlossBuffer",
    uniform.tex2dBlack((state) => state.normalAndGlossBuffer)
  );

  return binding;
};

const loadDirectionalLightPainter = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): Painter<GlTarget, DirectionalLightScene> => {
  const binding = loadLightBinding<DirectionalLightScene>(
    runtime,
    configuration,
    DeferredLightingLightType.Directional
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
  configuration: DeferredLightingConfiguration
): Painter<GlTarget, PointLightScene> => {
  const binding = loadLightBinding<PointLightScene>(
    runtime,
    configuration,
    DeferredLightingLightType.Point
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

const createMaterialBinder = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): GlMeshBinder<MaterialScene> => {
  return (feature) => {
    const shader = runtime.createShader(
      createMaterialSource({
        lightModelPhongAmbient: !configuration.lightModelPhongNoAmbient,
        lightModelPhongDiffuse: !configuration.lightModelPhongNoDiffuse,
        lightModelPhongSpecular: !configuration.lightModelPhongNoSpecular,
      })
    );

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
      // FIXME: missing support for  tints
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

    const sceneBinding = shader.declare<MaterialScene>();

    sceneBinding.setUniform(
      "projectionMatrix",
      uniform.matrix4f(({ projection }) => projection)
    );
    sceneBinding.setUniform(
      "viewMatrix",
      uniform.matrix4f(({ view }) => view)
    );

    sceneBinding.setUniform(
      "ambientLightColor",
      uniform.vector3f(({ ambientLightColor }) => ambientLightColor)
    );
    sceneBinding.setUniform(
      "lightBuffer",
      uniform.tex2dBlack(({ lightBuffer }) => lightBuffer)
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

    if (configuration.lightModel >= DeferredLightingLightModel.Phong) {
      materialBinding.setUniform(
        "specularColor",
        uniform.vector4f(({ specularColor }) => specularColor)
      );
      materialBinding.setUniform(
        "specularMap",
        uniform.tex2dBlack(({ specularMap }) => specularMap)
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

    return {
      dispose: shader.dispose,
      material: materialBinding,
      matrix: matrixBinding,
      polygon: polygonBinding,
      scene: sceneBinding,
    };
  };
};

const createDeferredLightingRenderer = (
  runtime: GlRuntime,
  configuration: DeferredLightingConfiguration
): DeferredLightingRenderer => {
  const gl = runtime.context;
  const geometryTarget = new GlTarget(gl, {
    x: gl.drawingBufferWidth,
    y: gl.drawingBufferHeight,
  });
  const lightTarget = new GlTarget(gl, {
    x: gl.drawingBufferWidth,
    y: gl.drawingBufferHeight,
  });

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
  const lightBuffer = lightTarget.setupColorTexture(
    GlTextureFormat.RGBA8,
    GlTextureType.Quad
  );
  const materialBinder = createMaterialBinder(runtime, configuration);
  const materialRenderer = createGlMeshRenderer(
    GlMeshRendererMode.Triangle,
    materialBinder
  );
  const pointLightBillboard = createPointLightBillboard(gl);
  const pointLightPainter = loadPointLightPainter(runtime, configuration);
  const normalAndGlossBuffer = geometryTarget.setupColorTexture(
    GlTextureFormat.RGBA8,
    GlTextureType.Quad
  );

  return {
    depthBuffer,
    lightBuffer,
    normalAndGlossBuffer,

    dispose() {
      materialRenderer.dispose();
    },

    append(subject) {
      const { mesh } = subject;

      const geometryResource = geometryRenderer.append(mesh);
      const materialResource = materialRenderer.append(mesh);

      return () => {
        geometryResource();
        materialResource();
      };
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

      // Render geometries to geometry buffers
      gl.disable(gl.BLEND);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      geometryTarget.clear(0);
      geometryRenderer.render(geometryTarget, scene);

      // Render lights to light buffer
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.DST_COLOR, gl.ZERO);

      lightTarget.setClearColor(1, 1, 1, 1);
      lightTarget.clear(0);

      // Draw directional lights using fullscreen quads
      if (directionalLights !== undefined) {
        // FIXME: a simple identity matrix could be use here at the cost of
        // passing 2 distinct "view" matrices to light shader:
        // - One for projecting our quad to fullscreen
        // - One for computing light directions in camera space
        const model = Matrix4.fromSource(view);

        model.invert();

        for (const directionalLight of directionalLights) {
          directionalLightPainter.paint(lightTarget, {
            depthBuffer: depthBuffer,
            directionalLight,
            indexBuffer: directionalLightBillboard.indexBuffer,
            model,
            normalAndGlossBuffer: normalAndGlossBuffer,
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
        pointLightPainter.paint(lightTarget, {
          billboard,
          depthBuffer: depthBuffer,
          indexBuffer: pointLightBillboard.indexBuffer,
          model: Matrix4.identity, // FIXME: remove from shader
          normalAndGlossBuffer: normalAndGlossBuffer,
          polygon: pointLightBillboard.polygon,
          projection,
          view,
          viewport,
        });
      }

      // Render materials to output
      gl.disable(gl.BLEND);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      materialRenderer.render(target, {
        ambientLightColor: ambientLightColor ?? Vector3.zero,
        lightBuffer,
        projection,
        view,
      });
    },

    resize(size: Vector2) {
      geometryTarget.resize(size);
      lightTarget.resize(size);
    },
  };
};

export {
  type DeferredLightingConfiguration,
  type DeferredLightingRenderer,
  type DeferredLightingScene,
  type DeferredLightingSubject,
  DeferredLightingLightModel,
  createDeferredLightingRenderer,
};
