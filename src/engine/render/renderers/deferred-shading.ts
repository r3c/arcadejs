import * as matrix from "../../math/matrix";
import * as normal from "./snippets/normal";
import * as phong from "./snippets/phong";
import * as quad from "./resources/quad";
import * as shininess from "./snippets/shininess";
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
layout(location=1) out vec4 normalAndSpecular;

${normal.encodeDeclare}
${shininess.encodeDeclare}

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
	float shininessPack = ${shininess.encodeInvoke("shininess")};

	albedoAndShininess = vec4(albedo, shininessPack);

	// Color target 2: [normal, normal, zero, specularColor]
	vec2 normalPack = ${normal.encodeInvoke("getNormal(normal, parallaxCoord)")};
	float specularColor = texture(specularMap, parallaxCoord).r;
	float unused = 0.0;

	normalAndSpecular = vec4(normalPack, unused, specularColor);
}`;

const lightHeaderShader = `
${phong.modelDeclare}

struct PointLight {
	vec3 diffuseColor;
	vec3 position;
	float radius;
	vec3 specularColor;
};

uniform vec3 ambientLightColor;
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

const lightFragmentAmbientShader = `
uniform sampler2D albedoAndShininess;

layout(location=0) out vec4 fragColor;

${phong.ambientDeclare}

void main(void) {
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

	// Read samples from texture buffers
	vec4 albedoAndShininessSample = texelFetch(albedoAndShininess, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;

	fragColor = vec4(${phong.ambientInvoke()} * albedo * ambientLightColor, 1.0);
}`;

const lightFragmentPointShader = `
uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndSpecular;

in vec3 lightPositionCamera;

layout(location=0) out vec4 fragColor;

${normal.decodeDeclare}
${phong.diffuseDeclare}
${phong.specularDeclare}
${shininess.decodeDeclare}

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
	vec4 normalAndSpecularSample = texelFetch(normalAndSpecular, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;
	vec3 normal = ${normal.decodeInvoke("normalAndSpecularSample.rg")};
	float specularColor = normalAndSpecularSample.a;
	float shininess = ${shininess.decodeInvoke("albedoAndShininessSample.a")};

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(depthSample.r);

	// Compute lightning
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - lightDistance / pointLight.radius, 0.0);

	vec3 lightColor =
		${phong.diffuseInvoke("normal", "lightDirection")} * pointLight.diffuseColor +
		${phong.specularInvoke("normal", "lightDirection", "eyeDirection", "shininess")} * pointLight.specularColor * specularColor;

	fragColor = vec4(albedo * lightColor * lightPower, 1.0);
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

interface AmbientLightState extends State {
	albedoAndShininessBuffer: WebGLTexture,
	ambientLightColor: vector.Vector3
}

interface PointLightState extends State {
	albedoAndShininessBuffer: WebGLTexture,
	depthBuffer: WebGLTexture,
	pointLight: webgl.PointLight,
	normalAndSpecularBuffer: WebGLTexture,
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

const loadLightAmbient = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [
		{ name: phong.modelName, value: <number>configuration.lightModel }
	];

	// Setup light shader
	const shader = new webgl.Shader<AmbientLightState>(gl, lightHeaderShader + lightVertexShader, lightHeaderShader + lightFragmentAmbientShader, directives);

	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());

	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	if (configuration.lightModel >= LightModel.Ambient) {
		shader.bindTexturePerTarget("albedoAndShininess", state => state.albedoAndShininessBuffer);
		shader.bindPropertyPerTarget("ambientLightColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.ambientLightColor));
	}

	return shader;
};

const loadLightPoint = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [
		{ name: phong.modelName, value: <number>configuration.lightModel }
	];

	// Setup light shader
	const shader = new webgl.Shader<PointLightState>(gl, lightHeaderShader + lightVertexShader, lightHeaderShader + lightFragmentPointShader, directives);

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
	shader.bindTexturePerTarget("normalAndSpecular", state => state.normalAndSpecularBuffer);

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	public readonly albedoAndShininessBuffer: WebGLTexture;
	public readonly depthBuffer: WebGLTexture;
	public readonly normalAndSpecularBuffer: WebGLTexture;

	private readonly ambientLightQuad: webgl.Model;
	private readonly ambientLightShader: webgl.Shader<AmbientLightState>;
	private readonly geometryTarget: webgl.Target;
	private readonly geometryShader: webgl.Shader<State>;
	private readonly gl: WebGLRenderingContext;
	private readonly pointLightShader: webgl.Shader<PointLightState>;
	private readonly pointLightSphere: webgl.Model;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const geometry = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);

		this.albedoAndShininessBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 0);
		this.ambientLightQuad = webgl.loadModel(gl, quad.model);
		this.ambientLightShader = loadLightAmbient(gl, configuration);
		this.depthBuffer = geometry.setupDepthTexture(webgl.Storage.Depth16);
		this.geometryTarget = geometry;
		this.geometryShader = loadGeometry(gl, configuration);
		this.gl = gl;
		this.pointLightShader = loadLightPoint(gl, configuration);
		this.pointLightSphere = webgl.loadModel(gl, sphere.model);
		this.normalAndSpecularBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 1);
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

		// Draw ambient light using fullscreen quad
		if (scene.ambientLightColor !== undefined) {
			const subject = {
				matrix: matrix.Matrix4.createIdentity()
					.translate({ x: 0, y: 0, z: -1 }),
				model: this.ambientLightQuad
			};

			target.draw(this.ambientLightShader, [subject], {
				albedoAndShininessBuffer: this.albedoAndShininessBuffer,
				ambientLightColor: scene.ambientLightColor,
				projectionMatrix: state.projectionMatrix,
				viewMatrix: matrix.Matrix4.createIdentity()
			});
		}

		// Draw point lights using spheres
		for (const pointLight of pointLights) {
			const subject = {
				matrix: matrix.Matrix4.createIdentity()
					.translate(pointLight.position)
					.scale({ x: pointLight.radius, y: pointLight.radius, z: pointLight.radius }),
				model: this.pointLightSphere
			};

			target.draw(this.pointLightShader, [subject], {
				albedoAndShininessBuffer: this.albedoAndShininessBuffer,
				depthBuffer: this.depthBuffer,
				normalAndSpecularBuffer: this.normalAndSpecularBuffer,
				pointLight: pointLight,
				projectionMatrix: state.projectionMatrix,
				viewMatrix: state.viewMatrix,
				viewportSize: viewportSize
			});
		}
	}
}

export { Configuration, LightModel, Renderer, State }