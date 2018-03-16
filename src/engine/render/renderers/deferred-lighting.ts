import * as matrix from "../../math/matrix";
import * as sphere from "./resources/sphere";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

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
uniform sampler2D heightMap;
uniform sampler2D normalMap;
uniform sampler2D specularMap;
uniform float shininess;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 normalAndSpecular;

vec2 encodeNormal(in vec3 decoded) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	return normalize(decoded.xy) * sqrt(-decoded.z * 0.5 + 0.5) * 0.5 + 0.5;
}

float encodeShininess(in float decoded) {
	return 1.0 / max(decoded, 1.0);
}

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirectionTangent, float parallaxScale, float parallaxBias) {
	#ifdef USE_HEIGHT_MAP
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirectionTangent.xy / eyeDirectionTangent.z;
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
	vec3 t = normalize(tangent);
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);

	vec3 eyeDirection = normalize(-point);
	vec3 eyeDirectionTangent = vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n));
	vec2 parallaxCoord = getCoord(coord, eyeDirectionTangent, 0.04, 0.02);

	// Color target: [normal, normal, shininess, specularColor]
	vec2 normalPack = encodeNormal(getNormal(normal, parallaxCoord));
	float specularColor = texture(specularMap, parallaxCoord).r;
	float shininessPack = encodeShininess(shininess);

	normalAndSpecular = vec4(normalPack, shininessPack, specularColor);
}`;

const lightHeaderShader = `
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

uniform sampler2D depthBuffer;
uniform sampler2D normalAndSpecularBuffer;

in vec3 lightPositionCamera;

layout(location=0) out vec4 fragColor;

vec3 decodeNormal(in vec2 normalPack) {
	// Spheremap transform
	// See: https://aras-p.info/texts/CompactNormalStorage.html#method03spherical
	vec2 fenc = normalPack * 4.0 - 2.0;
	float f = dot(fenc, fenc);
	float g = sqrt(1.0 - f * 0.25);

	return normalize(vec3(fenc * g, 1.0 - f * 0.5));
}

float decodeShininess(in float encoded) {
	return 1.0 / encoded;
}

float getLightDiffuse(in vec3 normal, in vec3 lightDirection) {
	#if LIGHT_MODEL >= LIGHT_MODEL_LAMBERT
		float lightNormalCosine = dot(normal, lightDirection);

		return clamp(lightNormalCosine, 0.0, 1.0);
	#else
		return 0.0;
	#endif
}

float getLightSpecular(in vec3 normal, in vec3 lightDirection, in vec3 eyeDirection, in float shininess) {
	#if LIGHT_MODEL >= LIGHT_MODEL_PHONG
		float lightNormalCosine = dot(normal, lightDirection);
		float lightVisible = step(0.0, lightNormalCosine);
		float lightSpecularCosine;

		#ifdef LIGHT_MODEL_PHONG_STANDARD
			// Phong model
			vec3 specularReflection = normalize(normal * clamp(lightNormalCosine, 0.0, 1.0) * 2.0 - lightDirection);

			lightSpecularCosine = max(dot(specularReflection, eyeDirection), 0.0);
		#else
			// Blinn-Phong model
			vec3 cameraLightMidway = normalize(eyeDirection + lightDirection);

			lightSpecularCosine = max(dot(normal, cameraLightMidway), 0.0);
		#endif

		return lightVisible * pow(lightSpecularCosine, shininess);
	#else
		return 0.0;
	#endif
}

vec3 getPoint(in vec2 fragCoord, in float fragDepth) {
	vec4 pointClip = vec4(fragCoord, fragDepth, 1.0) * 2.0 - 1.0;
	vec4 pointCamera = inverseProjectionMatrix * pointClip;

	return pointCamera.xyz / pointCamera.w;
}

void main(void) {
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);

	// Read samples from texture buffers
	vec4 normalAndSpecularSample = texelFetch(normalAndSpecularBuffer, bufferCoord, 0);
	vec4 depthSample = texelFetch(depthBuffer, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 normal = decodeNormal(normalAndSpecularSample.rg);
	float specularColor = normalAndSpecularSample.a;
	float shininess = decodeShininess(normalAndSpecularSample.b);

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(gl_FragCoord.xy / viewportSize, depthSample.r);

	// Compute lightning power
	vec3 eyeDirection = normalize(-point);
	vec3 lightDirection = normalize(lightPositionCamera - point);

	float lightDistance = length(lightPositionCamera - point);
	float lightPower = max(1.0 - lightDistance / pointLight.radius, 0.0);

	// Emit lighting parameters
	fragColor = exp2(-vec4(
		getLightDiffuse(normal, lightDirection) * lightPower * pointLight.diffuseColor,
		getLightSpecular(normal, lightDirection, eyeDirection, shininess) * specularColor * lightPower
	));
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

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

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
uniform sampler2D lightBuffer;

uniform vec4 ambientColor;
uniform sampler2D ambientMap;
uniform vec4 diffuseColor;
uniform sampler2D diffuseMap;
uniform sampler2D heightMap;
uniform vec4 specularColor;
uniform sampler2D specularMap;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 fragColor;

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirectionTangent, float parallaxScale, float parallaxBias) {
	#ifdef USE_HEIGHT_MAP
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirectionTangent.xy / eyeDirectionTangent.z;
	#else
		return initialCoord;
	#endif
}

void main(void) {
	// Read light properties from texture buffers
	ivec2 bufferCoord = ivec2(gl_FragCoord.xy);
	vec4 lightSample = -log2(texelFetch(lightBuffer, bufferCoord, 0));

	vec3 lightDiffuse = lightSample.rgb;
	vec3 lightSpecular = lightSample.rgb * lightSample.a;

	// Read material properties from uniforms
	vec3 t = normalize(tangent);
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);

	vec3 eyeDirection = normalize(-point);
	vec3 eyeDirectionTangent = vec3(dot(eyeDirection, t), dot(eyeDirection, b), dot(eyeDirection, n));
	vec2 parallaxCoord = getCoord(coord, eyeDirectionTangent, 0.04, 0.02);

	vec4 materialDiffuse = diffuseColor * texture(diffuseMap, parallaxCoord);
	vec4 materialSpecular = specularColor * texture(specularMap, parallaxCoord);

	// Emit final fragment color
	fragColor = vec4(materialDiffuse.rgb * lightDiffuse + materialSpecular.rgb * lightSpecular, 1.0);
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
	depthBuffer: WebGLTexture,
	pointLight: webgl.PointLight,
	normalAndSpecularBuffer: WebGLTexture,
	viewportSize: vector.Vector2
}

interface MaterialState extends State {
	lightBuffer: WebGLTexture
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

	if (configuration.useHeightMap)
		shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);

	if (configuration.useNormalMap)
		shader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);

	if (configuration.lightModel >= LightModel.Phong) {
		shader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);
		shader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);
	}

	return shader;
};

const loadLight = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [
		{ name: "LIGHT_MODEL", value: <number>configuration.lightModel }
	];

	// Setup light shader
	const shader = new webgl.Shader<LightState>(gl, lightHeaderShader + lightVertexShader, lightHeaderShader + lightFragmentShader, directives);

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

	shader.bindTexturePerTarget("depthBuffer", state => state.depthBuffer);
	shader.bindTexturePerTarget("normalAndSpecularBuffer", state => state.normalAndSpecularBuffer);

	return shader;
};

const loadMaterial = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [];

	if (configuration.useHeightMap)
		directives.push({ name: "USE_HEIGHT_MAP", value: 1 });

	// Setup material shader
	const shader = new webgl.Shader<MaterialState>(gl, materialVertexShader, materialFragmentShader, directives);

	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("normals", 3, gl.FLOAT, state => state.geometry.normals);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);
	shader.bindAttributePerGeometry("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerModel("normalMatrix", gl => gl.uniformMatrix3fv, state => state.target.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	shader.bindTexturePerTarget("lightBuffer", state => state.lightBuffer);

	if (configuration.lightModel >= LightModel.Lambert) { // FIXME: inconsistent with geometry shader + deferred shading?
		shader.bindPropertyPerMaterial("diffuseColor", gl => gl.uniform4fv, state => state.material.diffuseColor);
		shader.bindTexturePerMaterial("diffuseMap", state => state.material.diffuseMap);
	}

	if (configuration.useHeightMap)
		shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);

	if (configuration.lightModel >= LightModel.Phong) {
		shader.bindPropertyPerMaterial("specularColor", gl => gl.uniform4fv, state => state.material.specularColor);
		shader.bindTexturePerMaterial("specularMap", state => state.material.specularMap);
	}

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	public readonly depthBuffer: WebGLTexture;
	public readonly lightBuffer: WebGLTexture;
	public readonly normalAndSpecularBuffer: WebGLTexture;

	private readonly geometryTarget: webgl.Target;
	private readonly geometryShader: webgl.Shader<State>;
	private readonly gl: WebGLRenderingContext;
	private readonly lightShader: webgl.Shader<LightState>;
	private readonly lightSphere: webgl.Model;
	private readonly lightTarget: webgl.Target;
	private readonly materialShader: webgl.Shader<MaterialState>;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const geometry = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);
		const light = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);

		this.depthBuffer = geometry.setupDepthTexture(webgl.Storage.Depth16);
		this.geometryShader = loadGeometry(gl, configuration);
		this.geometryTarget = geometry;
		this.gl = gl;
		this.lightBuffer = light.setupColorTexture(webgl.Storage.RGBA8, 0);
		this.lightShader = loadLight(gl, configuration);
		this.lightSphere = webgl.loadModel(gl, sphere.model);
		this.lightTarget = light;
		this.materialShader = loadMaterial(gl, configuration);
		this.normalAndSpecularBuffer = geometry.setupColorTexture(webgl.Storage.RGBA8, 0);
	}

	public render(target: webgl.Target, scene: webgl.Scene, state: State) {
		const ambientLightColor = /*scene.ambientLightColor || */{ x: 0, y: 0, z: 0 };
		const gl = this.gl;
		const lightSubjects = new Array<webgl.Subject>(1);
		const pointLights = scene.pointLights || [];
		const viewportSize = { x: gl.canvas.clientWidth, y: gl.canvas.clientHeight };

		// Render geometries to geometry buffers
		gl.disable(gl.BLEND);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		this.geometryTarget.clear();
		this.geometryTarget.draw(this.geometryShader, scene.subjects, state);

		// Render lights to light buffer
		gl.cullFace(gl.FRONT);

		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.DST_COLOR, gl.ZERO);

		this.lightTarget.setClearColor(Math.pow(2, -ambientLightColor.x), Math.pow(2, -ambientLightColor.y), Math.pow(2, -ambientLightColor.z), 1);
		this.lightTarget.clear();

		for (const pointLight of pointLights) {
			lightSubjects[0] = {
				matrix: matrix.Matrix4.createIdentity()
					.translate(pointLight.position)
					.scale({ x: pointLight.radius, y: pointLight.radius, z: pointLight.radius }),
				model: this.lightSphere
			};

			this.lightTarget.draw(this.lightShader, lightSubjects, {
				depthBuffer: this.depthBuffer,
				normalAndSpecularBuffer: this.normalAndSpecularBuffer,
				pointLight: pointLight,
				projectionMatrix: state.projectionMatrix,
				viewMatrix: state.viewMatrix,
				viewportSize: viewportSize
			});
		}

		// Render materials to output
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		target.draw(this.materialShader, scene.subjects, {
			lightBuffer: this.lightBuffer,
			projectionMatrix: state.projectionMatrix,
			viewMatrix: state.viewMatrix
		});
	}
}

export { Configuration, LightModel, Renderer, State }