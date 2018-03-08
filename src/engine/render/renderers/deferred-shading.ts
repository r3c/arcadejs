import * as matrix from "../../math/matrix";
import * as sphere from "./resources/sphere";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

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

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(points, 1.0);
	vec3 eyeDirectionCamera = normalize(-pointCamera.xyz);

	normal = normalize(normalMatrix * normals);
	tangent = normalize(normalMatrix * tangents);

	bitangent = cross(normal, tangent);
	coord = coords;
	point = pointCamera.xyz;

	gl_Position = projectionMatrix * pointCamera;
}`;

const geometryFragmentShader = `
uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform sampler2D specularMap;
uniform float shininess;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 albedoAndShininess;
layout(location=1) out vec4 normalAndReflection;

float encodeInteger(in float decoded) {
	return decoded / 256.0;
}

vec2 encodeNormal(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirectionFace, float parallaxScale, float parallaxBias) {
	#ifdef USE_HEIGHT_MAP
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirectionFace.xy / eyeDirectionFace.z;
	#else
		return initialCoord;
	#endif
}

vec3 getNormal(in vec3 normal, in vec2 coord) {
	vec3 normalFace;

	#ifdef USE_NORMAL_MAP
		normalFace = normalize(2.0 * texture(normalMap, coord).rgb - 1.0);
	#else
		normalFace = vec3(0.0, 0.0, 1.0);
	#endif

	return normalize(normalFace.x * tangent + normalFace.y * bitangent + normalFace.z * normal);
}

void main(void) {
	vec3 eyeDirection = normalize(-point);
	vec3 eyeDirectionFace = vec3(dot(eyeDirection, tangent), dot(eyeDirection, bitangent), dot(eyeDirection, normal));
	vec2 parallaxCoord = getCoord(coord, eyeDirectionFace, 0.04, 0.02);

	// Color target 1: [ambient, ambient, ambient, shininess]
	vec3 albedo = ambientColor.rgb * texture(ambientMap, parallaxCoord).rgb;
	float shininessPack = encodeInteger(shininess);

	albedoAndShininess = vec4(albedo, shininessPack);

	// Color target 2: [normal, normal, zero, specularColor]
	vec2 normalPack = encodeNormal(getNormal(normal, parallaxCoord));
	float specularColor = texture(specularMap, parallaxCoord).r;
	float unused = 0.0;

	normalAndReflection = vec4(normalPack, unused, specularColor);
}`;

const lightCommonShader = `
#define LIGHT_MODEL_AMBIENT 1
#define LIGHT_MODEL_LAMBERT 2
#define LIGHT_MODEL_PHONG 3

struct PointLight {
	vec3 diffuseColor;
	vec3 position;
	float radius;
	vec3 specularColor;
};

uniform PointLight pointLight;`;

const lightVertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

out vec3 lightPositionCamera;

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	lightPositionCamera = toCameraPosition(pointLight.position);

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const lightFragmentShader = `
uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndReflection;

uniform bool applyDiffuse;
uniform bool applySpecular;

in vec3 lightPositionCamera;

layout(location=0) out vec4 fragColor;

float decodeInteger(in float encoded) {
	return encoded * 256.0;
}

vec3 decodeNormal(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}

vec3 getLight(in vec3 normal, in vec3 lightDirection, in vec3 eyeDirection, in float specularColor, in float shininess) {
	float lightNormalCosine = dot(normal, lightDirection);
	vec3 lightOutput = vec3(0, 0, 0);

	if (lightNormalCosine > 0.0) {
		#if LIGHT_MODEL >= LIGHT_MODEL_LAMBERT
			float lightPowerDiffuse = lightNormalCosine;

			lightOutput += pointLight.diffuseColor * lightPowerDiffuse;
		#endif

		#if LIGHT_MODEL >= LIGHT_MODEL_PHONG
			float lightSpecularCosine;

			#ifdef LIGHT_MODEL_PHONG_STANDARD
				// Phong model
				vec3 specularReflection = normalize(normal * lightNormalCosine * 2.0 - lightDirection);

				lightSpecularCosine = max(dot(specularReflection, eyeDirection), 0.0);
			#else
				// Blinn-Phong model
				vec3 cameraLightMidway = normalize(eyeDirection + lightDirection);

				lightSpecularCosine = max(dot(normal, cameraLightMidway), 0.0);
			#endif

			float lightPowerSpecular = pow(lightSpecularCosine, shininess) * specularColor;

			lightOutput += pointLight.specularColor * lightPowerSpecular;
		#endif
	}

	return lightOutput;
}

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
	vec4 normalAndReflectionSample = texelFetch(normalAndReflection, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;
	vec3 normal = decodeNormal(normalAndReflectionSample.rg);
	float specularColor = normalAndReflectionSample.a;
	float shininess = decodeInteger(albedoAndShininessSample.a);

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(depthSample.r);

	// Compute lightning
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - lightDistance / pointLight.radius, 0.0);

	vec3 light = getLight(normal, lightDirection, eyeDirection, specularColor, shininess) * lightPower;

	fragColor = vec4(albedo * light, 1.0);
}`;

interface Configuration {
	lightModel: LightModel,
	useHeightMap: boolean,
	useNormalMap: boolean
}

enum LightModel {
	None,
	Ambient,
	Lambert,
	Phong
}

interface LightState extends State {
	albedoAndShininessBuffer: WebGLTexture,
	depthBuffer: WebGLTexture,
	pointLight: webgl.PointLight,
	normalAndReflectionBuffer: WebGLTexture,
	viewportSize: vector.Vector2
}

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const loadGeometry = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [];

	if (configuration.useHeightMap)
		directives.push({ name: "USE_HEIGHT_MAP", value: 1 });

	if (configuration.useNormalMap)
		directives.push({ name: "USE_NORMAL_MAP", value: 1 });

	// Setup geometry shader
	const shader = new webgl.Shader<State>(gl, geometryVertexShader, geometryFragmentShader, directives);

	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("normals", 3, gl.FLOAT, state => state.geometry.normals);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);
	shader.bindAttributePerGeometry("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerModel("normalMatrix", gl => gl.uniformMatrix3fv, state => state.target.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	if (configuration.lightModel >= LightModel.Ambient) {
		shader.bindPropertyPerMaterial("ambientColor", gl => gl.uniform4fv, state => state.material.ambientColor);
		shader.bindTexturePerMaterial("ambientMap", state => state.material.ambientMap);
	}

	if (configuration.useHeightMap)
		shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);

	if (configuration.useNormalMap)
		shader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);

	if (configuration.lightModel >= LightModel.Phong) {
		shader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);
		shader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);
	}

	return shader;
}

const loadLight = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [
		{ name: "LIGHT_MODEL", value: <number>configuration.lightModel }
	];

	// Setup light shader
	const shader = new webgl.Shader<LightState>(gl, lightCommonShader + lightVertexShader, lightCommonShader + lightFragmentShader, directives);

	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());

	shader.bindMatrixPerTarget("inverseProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getInverse().getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	shader.bindPropertyPerTarget("pointLight.diffuseColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLight.diffuseColor));
	shader.bindPropertyPerTarget("pointLight.position", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLight.position));
	shader.bindPropertyPerTarget("pointLight.radius", gl => gl.uniform1f, state => state.pointLight.radius);
	shader.bindPropertyPerTarget("pointLight.specularColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLight.specularColor));
	shader.bindPropertyPerTarget("viewportSize", gl => gl.uniform2fv, state => vector.Vector2.toArray(state.viewportSize));

	shader.bindTexturePerTarget("albedoAndShininess", state => state.albedoAndShininessBuffer);
	shader.bindTexturePerTarget("depth", state => state.depthBuffer);
	shader.bindTexturePerTarget("normalAndReflection", state => state.normalAndReflectionBuffer);

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	public readonly albedoAndShininessBuffer: WebGLTexture;
	public readonly depthBuffer: WebGLTexture;
	public readonly normalAndReflectionBuffer: WebGLTexture;

	private readonly geometryTarget: webgl.Target;
	private readonly geometryShader: webgl.Shader<State>;
	private readonly gl: WebGLRenderingContext;
	private readonly lightShader: webgl.Shader<LightState>;
	private readonly lightSphere: webgl.Model;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const geometry = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);

		this.albedoAndShininessBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 0);
		this.depthBuffer = geometry.setupDepthTexture(webgl.Storage.Depth16);
		this.geometryTarget = geometry;
		this.geometryShader = loadGeometry(gl, configuration);
		this.gl = gl;
		this.lightShader = loadLight(gl, configuration);
		this.lightSphere = webgl.loadModel(gl, sphere.model);
		this.normalAndReflectionBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 1);
	}

	public render(target: webgl.Target, scene: webgl.Scene, state: State) {
		const gl = this.gl;
		const pointLights = scene.pointLights || [];
		const viewportSize = { x: gl.canvas.clientWidth, y: gl.canvas.clientHeight };

		// Draw scene geometries
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		this.geometryTarget.clear();
		this.geometryTarget.draw(this.geometryShader, scene.subjects, state);

		// Draw scene lights
		gl.cullFace(gl.FRONT);

		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		for (const pointLight of pointLights) {
			const subject = {
				matrix: matrix.Matrix4.createIdentity()
					.translate(pointLight.position)
					.scale({ x: pointLight.radius, y: pointLight.radius, z: pointLight.radius }),
				model: this.lightSphere
			};

			target.draw(this.lightShader, [subject], {
				albedoAndShininessBuffer: this.albedoAndShininessBuffer,
				depthBuffer: this.depthBuffer,
				normalAndReflectionBuffer: this.normalAndReflectionBuffer,
				pointLight: pointLight,
				projectionMatrix: state.projectionMatrix,
				viewMatrix: state.viewMatrix,
				viewportSize: viewportSize
			});
		}
	}
}

export { Configuration, LightModel, Renderer, State }