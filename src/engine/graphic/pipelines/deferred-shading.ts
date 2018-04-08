import * as matrix from "../../math/matrix";
import * as normal from "./snippets/normal";
import * as parallax from "./snippets/parallax";
import * as phong from "./snippets/phong";
import * as quad from "./resources/quad";
import * as shininess from "./snippets/shininess";
import * as sphere from "./resources/sphere";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

const enum LightModel {
	None,
	Phong
}

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
${parallax.heightDeclare}
${normal.encodeDeclare}
${shininess.encodeDeclare}

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D glossMap;
uniform sampler2D normalMap;
uniform float shininess;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 albedoAndShininess;
layout(location=1) out vec4 normalAndGloss;

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
	vec3 eyeDirectionTangent = vec3(dot(eyeDirection, tangent), dot(eyeDirection, bitangent), dot(eyeDirection, normal));

	#ifdef USE_HEIGHT_MAP
		vec2 parallaxCoord = ${parallax.heightInvoke("coord", "heightMap", "eyeDirectionTangent", "heightParallaxScale", "heightParallaxBias")};
	#else
		vec2 parallaxCoord = coord;
	#endif

	// Color target 1: [albedo.rgb, shininess]
	vec3 albedo = albedoFactor.rgb * texture(albedoMap, parallaxCoord).rgb;
	float shininessPack = ${shininess.encodeInvoke("shininess")};

	albedoAndShininess = vec4(albedo, shininessPack);

	// Color target 2: [normal.pp, zero, gloss]
	vec2 normalPack = ${normal.encodeInvoke("getNormal(normal, parallaxCoord)")};
	float gloss = texture(glossMap, parallaxCoord).r;
	float unused = 0.0;

	normalAndGloss = vec4(normalPack, unused, gloss);
}`;

const ambientHeaderShader = `
uniform vec3 ambientLightColor;`;

const ambientVertexShader = `
${ambientHeaderShader}

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
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
struct DirectionalLight {
	vec3 color;
	vec3 direction;
};

struct PointLight {
	vec3 color;
	vec3 position;
	float radius;
};

uniform DirectionalLight directionalLight;
uniform PointLight pointLight;`;

const lightVertexShader = `
${lightHeaderShader}

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

out vec3 lightDirectionCamera;
out vec3 lightPositionCamera;

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	#if LIGHT_TYPE == ${LightType.Directional}
		lightDirectionCamera = toCameraDirection(directionalLight.direction);
	#elif LIGHT_TYPE == ${LightType.Point}
		lightPositionCamera = toCameraPosition(pointLight.position);
	#endif

	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const lightFragmentShader = `
${lightHeaderShader}

${normal.decodeDeclare}
${phong.getDiffusePowerDeclare}
${phong.getSpecularPowerDeclare}
${shininess.decodeDeclare}

uniform mat4 inverseProjectionMatrix;
uniform vec2 viewportSize;

uniform sampler2D albedoAndShininess;
uniform sampler2D depth;
uniform sampler2D normalAndGloss;

in vec3 lightDirectionCamera;
in vec3 lightPositionCamera;

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
	vec4 normalAndGlossSample = texelFetch(normalAndGloss, bufferCoord, 0);

	// Decode geometry and material properties from samples
	vec3 albedo = albedoAndShininessSample.rgb;
	vec3 normal = ${normal.decodeInvoke("normalAndGlossSample.rg")};
	float gloss = normalAndGlossSample.a;
	float shininess = ${shininess.decodeInvoke("albedoAndShininessSample.a")};

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(depthSample.r);

	// Compute lightning
	#if LIGHT_TYPE == ${LightType.Directional}
		vec3 lightDiffuseColor = directionalLight.color;
		vec3 lightDirection = normalize(lightDirectionCamera);
		float lightPower = 1.0;
		vec3 lightSpecularColor = directionalLight.color * gloss;
	#elif LIGHT_TYPE == ${LightType.Point}
		vec3 lightDiffuseColor = pointLight.color;
		vec3 lightDirection = normalize(lightPositionCamera - point);
		float lightPower = max(1.0 - length(lightPositionCamera - point) / pointLight.radius, 0.0);
		vec3 lightSpecularColor = pointLight.color * gloss;
	#endif

	float lightDiffusePower = ${phong.getDiffusePowerInvoke("normal", "lightDirection")};
	float lightSpecularPower = ${phong.getSpecularPowerInvoke("normal", "lightDirection", "normalize(-point)", "shininess")};

	vec3 lightColor =
		lightDiffusePower * lightDiffuseColor * float(LIGHT_MODEL_PHONG_DIFFUSE) +
		lightSpecularPower * lightSpecularColor * float(LIGHT_MODEL_PHONG_SPECULAR);

	fragColor = vec4(albedo * lightColor * lightPower, 1.0);
}`;

interface AmbientState extends State {
	albedoAndShininessBuffer: WebGLTexture,
	ambientLightColor: vector.Vector3
}

interface Configuration {
	lightModel: LightModel,
	lightModelPhongNoAmbient?: boolean,
	lightModelPhongNoDiffuse?: boolean,
	lightModelPhongNoSpecular?: boolean,
	useHeightMap: boolean,
	useNormalMap: boolean
}

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

interface LightState<TLight> extends State {
	albedoAndShininessBuffer: WebGLTexture,
	depthBuffer: WebGLTexture,
	light: TLight,
	normalAndGlossBuffer: WebGLTexture,
	viewportSize: vector.Vector2
}

const enum LightType {
	Directional,
	Point
}

const loadAmbient = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [];

	switch (configuration.lightModel) {
		case LightModel.Phong:
			directives.push({ name: "LIGHT_MODEL_AMBIENT", value: configuration.lightModelPhongNoAmbient ? 0 : 1 });

			break;
	}

	// Setup light shader
	const shader = new webgl.Shader<AmbientState>(gl, ambientVertexShader, ambientFragmentShader, directives);

	shader.bindAttributePerGeometry("points", state => state.geometry.points);

	shader.bindMatrixPerNode("modelMatrix", gl => gl.uniformMatrix4fv, state => state.matrix.getValues());

	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	shader.bindTexturePerTarget("albedoAndShininess", state => state.albedoAndShininessBuffer);
	shader.bindPropertyPerTarget("ambientLightColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.ambientLightColor));

	return shader;
};

const loadGeometry = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [];

	if (configuration.useHeightMap)
		directives.push({ name: "USE_HEIGHT_MAP", value: 1 });

	if (configuration.useNormalMap)
		directives.push({ name: "USE_NORMAL_MAP", value: 1 });

	// Setup geometry shader
	const shader = new webgl.Shader<State>(gl, geometryVertexShader, geometryFragmentShader, directives);

	shader.bindAttributePerGeometry("coords", state => state.geometry.coords);
	shader.bindAttributePerGeometry("normals", state => state.geometry.normals);
	shader.bindAttributePerGeometry("points", state => state.geometry.points);
	shader.bindAttributePerGeometry("tangents", state => state.geometry.tangents);

	shader.bindMatrixPerNode("modelMatrix", gl => gl.uniformMatrix4fv, state => state.matrix.getValues());
	shader.bindMatrixPerNode("normalMatrix", gl => gl.uniformMatrix3fv, state => state.global.viewMatrix.compose(state.matrix).getTransposedInverse3x3());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	shader.bindPropertyPerMaterial("albedoFactor", gl => gl.uniform4fv, state => state.material.albedoFactor);
	shader.bindTexturePerMaterial("albedoMap", state => state.material.albedoMap);

	if (configuration.lightModel === LightModel.Phong) {
		shader.bindTexturePerMaterial("glossMap", state => state.material.glossMap);
		shader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);
	}

	if (configuration.useHeightMap) {
		shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);
		shader.bindPropertyPerMaterial("heightParallaxBias", gl => gl.uniform1f, state => state.material.heightParallaxBias);
		shader.bindPropertyPerMaterial("heightParallaxScale", gl => gl.uniform1f, state => state.material.heightParallaxScale);
	}

	if (configuration.useNormalMap)
		shader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);

	return shader;
};

const loadLight = <T>(gl: WebGLRenderingContext, configuration: Configuration, type: LightType) => {
	// Build directives from configuration
	const directives = [
		{ name: "LIGHT_TYPE", value: type }
	];

	switch (configuration.lightModel) {
		case LightModel.Phong:
			directives.push({ name: "LIGHT_MODEL_PHONG_DIFFUSE", value: configuration.lightModelPhongNoDiffuse ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_SPECULAR", value: configuration.lightModelPhongNoSpecular ? 0 : 1 });

			break;
	}

	// Setup light shader
	const shader = new webgl.Shader<LightState<T>>(gl, lightVertexShader, lightFragmentShader, directives);

	shader.bindAttributePerGeometry("points", state => state.geometry.points);

	shader.bindMatrixPerNode("modelMatrix", gl => gl.uniformMatrix4fv, state => state.matrix.getValues());

	shader.bindMatrixPerTarget("inverseProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.inverse().getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	shader.bindPropertyPerTarget("viewportSize", gl => gl.uniform2fv, state => vector.Vector2.toArray(state.viewportSize));

	shader.bindTexturePerTarget("albedoAndShininess", state => state.albedoAndShininessBuffer);
	shader.bindTexturePerTarget("depth", state => state.depthBuffer);
	shader.bindTexturePerTarget("normalAndGloss", state => state.normalAndGlossBuffer);

	return shader;
};

const loadLightDirectional = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const shader = loadLight<webgl.DirectionalLight>(gl, configuration, LightType.Directional);

	shader.bindPropertyPerTarget("directionalLight.color", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.light.color));
	shader.bindPropertyPerTarget("directionalLight.direction", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.light.direction));

	return shader;
};

const loadLightPoint = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const shader = loadLight<webgl.PointLight>(gl, configuration, LightType.Point);

	shader.bindPropertyPerTarget("pointLight.color", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.light.color));
	shader.bindPropertyPerTarget("pointLight.position", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.light.position));
	shader.bindPropertyPerTarget("pointLight.radius", gl => gl.uniform1f, state => state.light.radius);

	return shader;
};

class Pipeline implements webgl.Pipeline {
	public readonly albedoAndShininessBuffer: WebGLTexture;
	public readonly depthBuffer: WebGLTexture;
	public readonly normalAndGlossBuffer: WebGLTexture;

	private readonly ambientLightShader: webgl.Shader<AmbientState>;
	private readonly directionalLightShader: webgl.Shader<LightState<webgl.DirectionalLight>>;
	private readonly fullscreenMesh: webgl.Mesh;
	private readonly fullscreenProjection: matrix.Matrix4;
	private readonly geometryTarget: webgl.Target;
	private readonly geometryShader: webgl.Shader<State>;
	private readonly gl: WebGLRenderingContext;
	private readonly pointLightShader: webgl.Shader<LightState<webgl.PointLight>>;
	private readonly sphereModel: webgl.Mesh;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const geometry = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);

		this.albedoAndShininessBuffer = geometry.setupColorTexture(webgl.Format.RGBA8);
		this.ambientLightShader = loadAmbient(gl, configuration);
		this.depthBuffer = geometry.setupDepthTexture(webgl.Format.Depth16);
		this.directionalLightShader = loadLightDirectional(gl, configuration);
		this.fullscreenMesh = webgl.loadMesh(gl, quad.mesh);
		this.fullscreenProjection = matrix.Matrix4.createOrthographic(-1, 1, -1, 1, -1, 1);
		this.geometryTarget = geometry;
		this.geometryShader = loadGeometry(gl, configuration);
		this.gl = gl;
		this.normalAndGlossBuffer = geometry.setupColorTexture(webgl.Format.RGBA8);
		this.pointLightShader = loadLightPoint(gl, configuration);
		this.sphereModel = webgl.loadMesh(gl, sphere.mesh);
	}

	public process(target: webgl.Target, transform: webgl.Transform, scene: webgl.Scene) {
		const gl = this.gl;
		const viewportSize = { x: gl.canvas.clientWidth, y: gl.canvas.clientHeight };

		// Draw scene geometries
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		this.geometryTarget.clear();
		this.geometryTarget.draw(this.geometryShader, scene.subjects, transform);

		// Draw scene lights
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		// Draw ambient light using fullscreen quad
		if (scene.ambientLightColor !== undefined) {
			const subjects = [{
				matrix: matrix.Matrix4.createIdentity(),
				mesh: this.fullscreenMesh
			}];

			target.draw(this.ambientLightShader, subjects, {
				albedoAndShininessBuffer: this.albedoAndShininessBuffer,
				ambientLightColor: scene.ambientLightColor,
				projectionMatrix: this.fullscreenProjection,
				viewMatrix: matrix.Matrix4.createIdentity()
			});
		}

		// Draw directional lights using fullscreen quads
		if (scene.directionalLights !== undefined) {
			// FIXME: a simple identity matrix could be use here at the cost of
			// passing 2 distinct "view" matrices to light shader:
			// - One for projecting our quad to fullscreen
			// - One for computing light directions in camera space
			const subjects = [{
				matrix: transform.viewMatrix.inverse(),
				mesh: this.fullscreenMesh
			}];

			for (const directionalLight of scene.directionalLights) {
				target.draw(this.directionalLightShader, subjects, {
					albedoAndShininessBuffer: this.albedoAndShininessBuffer,
					depthBuffer: this.depthBuffer,
					light: directionalLight,
					normalAndGlossBuffer: this.normalAndGlossBuffer,
					projectionMatrix: this.fullscreenProjection,
					viewMatrix: transform.viewMatrix,
					viewportSize: viewportSize
				});
			}
		}

		// Draw point lights using spheres
		if (scene.pointLights !== undefined) {
			const subjects = [{
				matrix: matrix.Matrix4.createIdentity(),
				mesh: this.sphereModel
			}];

			gl.cullFace(gl.FRONT);

			for (const pointLight of scene.pointLights) {
				subjects[0].matrix = matrix.Matrix4.createIdentity()
					.translate(pointLight.position)
					.scale({ x: pointLight.radius, y: pointLight.radius, z: pointLight.radius });

				target.draw(this.pointLightShader, subjects, {
					albedoAndShininessBuffer: this.albedoAndShininessBuffer,
					depthBuffer: this.depthBuffer,
					normalAndGlossBuffer: this.normalAndGlossBuffer,
					light: pointLight,
					projectionMatrix: transform.projectionMatrix,
					viewMatrix: transform.viewMatrix,
					viewportSize: viewportSize
				});
			}
		}
	}

	public resize(width: number, height: number) {
		this.geometryTarget.resize(width, height);
	}
}

export { Configuration, LightModel, Pipeline, State }