import * as functional from "../../language/functional";
import * as matrix from "../../math/matrix";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

const lightHeaderShader = `
#define LIGHT_MODEL_AMBIENT 1
#define LIGHT_MODEL_LAMBERT 2
#define LIGHT_MODEL_PHONG 3

struct DirectionalLight {
	vec3 diffuseColor;
	vec3 direction;
	vec3 specularColor;
#ifdef USE_SHADOW_MAP
	bool castShadow;
	mat4 shadowViewMatrix;
#endif
};

struct PointLight {
	vec3 diffuseColor;
	vec3 position;
	float radius; // FIXME: ignored by this implementation
	vec3 specularColor;
};

const mat4 texUnitConverter = mat4(
	0.5, 0.0, 0.0, 0.0,
	0.0, 0.5, 0.0, 0.0,
	0.0, 0.0, 0.5, 0.0,
	0.5, 0.5, 0.5, 1.0
);

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform DirectionalLight directionalLights[max(DIRECTIONAL_LIGHT_COUNT, 1)];
uniform PointLight pointLights[max(POINT_LIGHT_COUNT, 1)];

// FIXME: adding shadowMap as field to *Light structures doesn't work for some reason
#ifdef USE_SHADOW_MAP
uniform sampler2D directionalLightShadowMaps[max(DIRECTIONAL_LIGHT_COUNT, 1)];
uniform sampler2D pointLightShadowMaps[max(POINT_LIGHT_COUNT, 1)];
#endif`;

const lightVertexShader = `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 shadowProjectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space (normal mapping disabled) or tangent space (normal mapping enabled)
out vec3 normal; // Normal at point in same space than eye vector

out vec3 directionalLightDirections[max(DIRECTIONAL_LIGHT_COUNT, 1)];
out vec3 directionalLightShadows[max(DIRECTIONAL_LIGHT_COUNT, 1)];

out vec3 pointLightDirections[max(POINT_LIGHT_COUNT, 1)];
out vec3 pointLightShadows[max(POINT_LIGHT_COUNT, 1)];

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 point = viewMatrix * modelMatrix * vec4(points, 1.0);
	vec3 pointCamera = point.xyz;

	#ifdef USE_NORMAL_MAP
		vec3 n = normalize(normalMatrix * normals);
		vec3 t = normalize(normalMatrix * tangents);
		vec3 b = cross(n, t);
	#endif

	// Process directional lights
	for (int i = 0; i < DIRECTIONAL_LIGHT_COUNT; ++i) {
		#ifdef USE_SHADOW_MAP
			if (directionalLights[i].castShadow) {
				vec4 pointShadow = texUnitConverter * shadowProjectionMatrix * directionalLights[i].shadowViewMatrix * modelMatrix * vec4(points, 1.0);

				directionalLightShadows[i] = pointShadow.xyz;
			}
		#endif

		vec3 lightDirection = normalize(toCameraDirection(directionalLights[i].direction));

		#ifdef USE_NORMAL_MAP
			lightDirection = vec3(dot(lightDirection, t), dot(lightDirection, b), dot(lightDirection, n));
		#endif

		directionalLightDirections[i] = normalize(lightDirection);
	}

	// Process point lights
	for (int i = 0; i < POINT_LIGHT_COUNT; ++i) {
		#ifdef USE_SHADOW_MAP
			// FIXME: shadow map code
		#endif

		vec3 lightDirection = normalize(toCameraPosition(pointLights[i].position) - pointCamera);

		#ifdef USE_NORMAL_MAP
			lightDirection = vec3(dot(lightDirection, t), dot(lightDirection, b), dot(lightDirection, n));
		#endif

		pointLightDirections[i] = normalize(lightDirection);
	}

	vec3 eyeDirectionCamera = normalize(-pointCamera);

	#ifdef USE_NORMAL_MAP
		eye = vec3(dot(eyeDirectionCamera, t), dot(eyeDirectionCamera, b), dot(eyeDirectionCamera, n));
		normal = vec3(0.0, 0.0, 1.0);
	#else
		eye = eyeDirectionCamera;
		normal = normalize(normals);
	#endif

	coord = coords;

	gl_Position = projectionMatrix * point;
}`;

const lightFragmentShader = `
uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform float shininess;
uniform vec4 specularColor;
uniform sampler2D specularMap;

in vec2 coord;
in vec3 eye;
in vec3 normal;

in vec3 directionalLightDirections[max(DIRECTIONAL_LIGHT_COUNT, 1)];
in vec3 directionalLightShadows[max(DIRECTIONAL_LIGHT_COUNT, 1)];

in vec3 pointLightDirections[max(POINT_LIGHT_COUNT, 1)];
in vec3 pointLightShadows[max(POINT_LIGHT_COUNT, 1)];

layout(location=0) out vec4 fragColor;

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirection, float parallaxScale, float parallaxBias) {
	#ifdef USE_HEIGHT_MAP
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirection.xy / eyeDirection.z;
	#else
		return initialCoord;
	#endif
}

vec3 getLight(in vec2 coord, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection, in vec3 lightDiffuseColor, in vec3 lightSpecularColor) {
	float lightNormalCosine = dot(normal, lightDirection);
	vec3 outputColor = vec3(0, 0, 0);

	if (lightNormalCosine > 0.0) {
		#if LIGHT_MODEL >= LIGHT_MODEL_LAMBERT
			vec3 diffuseMaterial = texture(diffuseMap, coord).rgb;
			float diffusePower = lightNormalCosine;

			outputColor += diffuseColor.rgb * lightDiffuseColor * diffuseMaterial * diffusePower;
		#endif

		#if LIGHT_MODEL >= LIGHT_MODEL_PHONG
			float specularCosine;

			#ifdef LIGHT_MODEL_PHONG_STANDARD
				// Standard Phong model
				vec3 reflectionDirection = normalize(normal * lightNormalCosine * 2.0 - lightDirection);

				specularCosine = max(dot(reflectionDirection, eyeDirection), 0.0);
			#else
				// Blinn-Phong variant
				vec3 halfwayDirection = normalize(eyeDirection + lightDirection);

				specularCosine = max(dot(normal, halfwayDirection), 0.0);
			#endif

			vec3 specularMaterial = texture(specularMap, coord).rgb;
			float specularPower = pow(specularCosine, shininess);

			outputColor += specularColor.rgb * lightSpecularColor * specularMaterial * specularPower;
		#endif
	}

	return outputColor;
}

vec3 getNormal(in vec3 initialNormal, in vec2 coord) {
	#ifdef USE_NORMAL_MAP
		// Initial normal is always (0, 0, 1) here and can be safely ignored, see vertex shader
		return normalize(2.0 * texture(normalMap, coord).rgb - 1.0);
	#else
		return normalize(initialNormal);
	#endif
}

void main(void) {
	vec3 eyeDirection = normalize(eye);
	vec2 modifiedCoord = getCoord(coord, eyeDirection, 0.04, 0.02);
	vec3 modifiedNormal = getNormal(normal, modifiedCoord);
	vec3 outputColor = vec3(0, 0, 0);

	#if LIGHT_MODEL >= LIGHT_MODEL_AMBIENT
		// FIXME: constant ambient light
		outputColor += vec3(0.3, 0.3, 0.3) * ambientColor.rgb * texture(ambientMap, modifiedCoord).rgb;
	#endif

	for (int i = 0; i < DIRECTIONAL_LIGHT_COUNT; ++i) {
		#ifdef USE_SHADOW_MAP
			float shadowMapSample = texture(directionalLightShadowMaps[i], directionalLightShadows[i].xy).r;

			if (shadowMapSample < directionalLightShadows[i].z)
				continue;
		#endif

		outputColor += getLight(modifiedCoord, modifiedNormal, eyeDirection, normalize(directionalLightDirections[i]), directionalLights[i].diffuseColor, directionalLights[i].specularColor);
	}

	for (int i = 0; i < POINT_LIGHT_COUNT; ++i)
		outputColor += getLight(modifiedCoord, modifiedNormal, eyeDirection, normalize(pointLightDirections[i]), pointLights[i].diffuseColor, pointLights[i].specularColor);

	fragColor = vec4(outputColor, 1.0);
}`;

const shadowVertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const shadowFragmentShader = `
layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = vec4(1, 1, 1, 1);
}`;

interface Configuration {
	directionalLightCount?: number,
	lightModel: LightModel,
	pointLightCount?: number,
	useHeightMap: boolean,
	useNormalMap: boolean,
	useShadowMap: boolean
}

interface DirectionalLight extends webgl.DirectionalLight {
	shadowMap: WebGLTexture,
	shadowViewMatrix: matrix.Matrix4
}

enum LightModel {
	None,
	Ambient,
	Lambert,
	Phong
}

interface LightState { // FIXME: extends State once shadowViewMatrix is removed
	directionalLights: DirectionalLight[],
	pointLights: webgl.PointLight[], // FIXME: extend PointLight with extra properties
	projectionMatrix: matrix.Matrix4,
	shadowProjectionMatrix: matrix.Matrix4
	viewMatrix: matrix.Matrix4
}

interface ShadowState { // FIXME: extends State once shadowViewMatrix is removed
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

interface State {
	projectionMatrix: matrix.Matrix4,
	shadowViewMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const loadLight = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const directionalLightCount = functional.coalesce(configuration.directionalLightCount, 0);
	const directives = [];
	const pointLightCount = functional.coalesce(configuration.pointLightCount, 0)

	directives.push({ name: "DIRECTIONAL_LIGHT_COUNT", value: directionalLightCount });
	directives.push({ name: "LIGHT_MODEL", value: <number>configuration.lightModel });
	directives.push({ name: "POINT_LIGHT_COUNT", value: pointLightCount });

	if (configuration.useHeightMap)
		directives.push({ name: "USE_HEIGHT_MAP", value: 1 });

	if (configuration.useNormalMap)
		directives.push({ name: "USE_NORMAL_MAP", value: 1 });

	if (configuration.useShadowMap)
		directives.push({ name: "USE_SHADOW_MAP", value: 1 });

	const shader = new webgl.Shader<LightState>(gl, lightHeaderShader + lightVertexShader, lightHeaderShader + lightFragmentShader, directives);

	// Bind geometry attributes
	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("normals", 3, gl.FLOAT, state => state.geometry.normals);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	if (configuration.useNormalMap)
		shader.bindAttributePerGeometry("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	// Bind matrix uniforms
	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	if (configuration.useNormalMap)
		shader.bindMatrixPerModel("normalMatrix", gl => gl.uniformMatrix3fv, state => state.target.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());

	if (configuration.useShadowMap)
		shader.bindMatrixPerTarget("shadowProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.shadowProjectionMatrix.getValues());

	// Bind light uniforms
	if (configuration.lightModel >= LightModel.Ambient) {
		shader.bindPropertyPerMaterial("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
		shader.bindTexturePerMaterial("ambientMap", state => state.material.ambientMap);
	}

	if (configuration.lightModel >= LightModel.Lambert) {
		shader.bindPropertyPerMaterial("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
		shader.bindTexturePerMaterial("diffuseMap", state => state.material.diffuseMap);
	}

	if (configuration.useHeightMap)
		shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);

	if (configuration.useNormalMap)
		shader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);

	if (configuration.lightModel >= LightModel.Phong) {
		shader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);
		shader.bindPropertyPerMaterial("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
		shader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);
	}

	for (let i = 0; i < directionalLightCount; ++i) {
		if (configuration.useShadowMap) {
			shader.bindPropertyPerTarget(`directionalLights[${i}].castShadow`, gl => gl.uniform1i, state => state.directionalLights[i].castShadow ? 1 : 0);
			shader.bindMatrixPerTarget(`directionalLights[${i}].shadowViewMatrix`, gl => gl.uniformMatrix4fv, state => state.directionalLights[i].shadowViewMatrix.getValues());
			shader.bindTexturePerTarget(`directionalLightShadowMaps[${i}]`, state => state.directionalLights[i].shadowMap);
		}

		shader.bindPropertyPerTarget(`directionalLights[${i}].diffuseColor`, gl => gl.uniform3fv, state => vector.Vector3.toArray(state.directionalLights[i].diffuseColor));
		shader.bindPropertyPerTarget(`directionalLights[${i}].direction`, gl => gl.uniform3fv, state => vector.Vector3.toArray(state.directionalLights[i].direction));
		shader.bindPropertyPerTarget(`directionalLights[${i}].specularColor`, gl => gl.uniform3fv, state => vector.Vector3.toArray(state.directionalLights[i].specularColor));
	}

	for (let i = 0; i < pointLightCount; ++i) {
		shader.bindPropertyPerTarget(`pointLights[${i}].diffuseColor`, gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLights[i].diffuseColor));
		shader.bindPropertyPerTarget(`pointLights[${i}].position`, gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLights[i].position));
		shader.bindPropertyPerTarget(`pointLights[${i}].radius`, gl => gl.uniform1f, state => state.pointLights[i].radius);
		shader.bindPropertyPerTarget(`pointLights[${i}].specularColor`, gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLights[i].specularColor));
	}

	return shader;
};

const loadShadow = (gl: WebGLRenderingContext) => {
	const shader = new webgl.Shader<ShadowState>(gl, shadowVertexShader, shadowFragmentShader);

	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	public readonly shadowBuffer: WebGLTexture; // FIXME: should be a list?

	private readonly gl: WebGLRenderingContext;
	private readonly lightShader: webgl.Shader<LightState>;
	private readonly shadowProjectionMatrix: matrix.Matrix4;
	private readonly shadowShader: webgl.Shader<ShadowState>;
	private readonly shadowTarget: webgl.Target;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const target = new webgl.Target(gl, 1024, 1024);

		this.gl = gl;
		this.lightShader = loadLight(gl, configuration);
		this.shadowBuffer = target.setupDepthTexture(webgl.Storage.Depth16);
		this.shadowProjectionMatrix = matrix.Matrix4.createOrthographic(-10, 10, -10, 10, -10, 20);
		this.shadowShader = loadShadow(gl);
		this.shadowTarget = target;
	}

	public render(target: webgl.Target, scene: webgl.Scene, state: State) {
		const directionalLights = scene.directionalLights || [];
		const gl = this.gl;
		const pointLights = scene.pointLights || [];
		const shadowViewMatrix = state.shadowViewMatrix; // FIXME: must be computed from light direction + position

		gl.disable(gl.BLEND);

		gl.enable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);

		// Create shadow maps for directional lights
		for (let i = 0; i < directionalLights.length; ++i) {
			gl.colorMask(false, false, false, false);
			gl.cullFace(gl.FRONT);

			this.shadowTarget.clear();
			this.shadowTarget.draw(this.shadowShader, scene.subjects, {
				projectionMatrix: this.shadowProjectionMatrix,
				viewMatrix: shadowViewMatrix
			});
		}

		// Draw scene
		gl.colorMask(true, true, true, true);
		gl.cullFace(gl.BACK);

		target.draw(this.lightShader, scene.subjects, {
			directionalLights: directionalLights.map(light => ({
				castShadow: light.castShadow,
				diffuseColor: light.diffuseColor,
				direction: light.direction,
				shadowMap: this.shadowBuffer,
				shadowViewMatrix: shadowViewMatrix,
				specularColor: light.specularColor
			})),
			pointLights: pointLights,
			projectionMatrix: state.projectionMatrix,
			shadowProjectionMatrix: this.shadowProjectionMatrix,
			viewMatrix: state.viewMatrix
		});
	}
}

export { Configuration, LightModel, Renderer, State }