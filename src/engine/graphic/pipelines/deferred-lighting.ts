import * as matrix from "../../math/matrix";
import * as normal from "./snippets/normal";
import * as painter from "../painters/singular";
import * as parallax from "./snippets/parallax";
import * as phong from "./snippets/phong";
import * as quad from "./resources/quad";
import * as rgb from "./snippets/rgb";
import * as shininess from "./snippets/shininess";
import * as sphere from "./resources/sphere";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

const enum LightModel {
	None,
	Phong
}

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

void main(void) {
	vec4 pointCamera = viewMatrix * modelMatrix * vec4(points, 1.0);

	coord = coords;
	normal = normalize(normalMatrix * normals);
	point = pointCamera.xyz;
	tangent = normalize(normalMatrix * tangents);

	bitangent = cross(normal, tangent);

	gl_Position = projectionMatrix * pointCamera;
}`;

const geometryFragmentShader = `
${normal.encodeDeclare}
${normal.perturbDeclare("FORCE_NORMAL_MAP")}
${parallax.perturbDeclare("FORCE_HEIGHT_MAP")}
${shininess.encodeDeclare}

uniform sampler2D glossMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D normalMap;
uniform float shininess;

in vec3 bitangent;
in vec2 coord;
in vec3 normal;
in vec3 point;
in vec3 tangent;

layout(location=0) out vec4 normalAndGloss;

void main(void) {
	vec3 t = normalize(tangent);
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);

	vec3 eyeDirection = normalize(-point);
	vec2 coordParallax = ${parallax.perturbInvoke("FORCE_HEIGHT_MAP", "coord", "heightMap", "heightMapEnabled", "eyeDirection", "heightParallaxScale", "heightParallaxBias", "t", "b", "n")};

	// Color target: [normal, normal, shininess, gloss]
	vec3 normalModified = ${normal.perturbInvoke("FORCE_NORMAL_MAP", "normalMap", "normalMapEnabled", "coordParallax", "t", "b", "n")};
	vec2 normalPack = ${normal.encodeInvoke("normalModified")};

	float gloss = texture(glossMap, coordParallax).r;
	float shininessPack = ${shininess.encodeInvoke("shininess")};

	normalAndGloss = vec4(normalPack, shininessPack, gloss);
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

uniform sampler2D depthBuffer;
uniform sampler2D normalAndGlossBuffer;

in vec3 lightDirectionCamera;
in vec3 lightPositionCamera;

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

	// Decode geometry and material properties from samples
	vec3 normal = ${normal.decodeInvoke("normalAndGlossSample.rg")};
	float gloss = normalAndGlossSample.a;
	float shininess = ${shininess.decodeInvoke("normalAndGlossSample.b")};

	// Compute point in camera space from fragment coord and depth buffer
	vec3 point = getPoint(gl_FragCoord.xy / viewportSize, depthSample.r);
	vec3 eyeDirection = normalize(-point);

	// Compute lightning parameters
	#if LIGHT_TYPE == ${LightType.Directional}
		vec3 lightColor = directionalLight.color;
		vec3 lightDirection = normalize(lightDirectionCamera);
		float lightPower = 1.0;
	#elif LIGHT_TYPE == ${LightType.Point}
		vec3 lightColor = pointLight.color;
		vec3 lightDirection = normalize(lightPositionCamera - point);
		float lightPower = max(1.0 - length(lightPositionCamera - point) / pointLight.radius, 0.0);
	#endif

	float lightDiffusePower = ${phong.getDiffusePowerInvoke("normal", "lightDirection")};
	float lightSpecularPower = ${phong.getSpecularPowerInvoke("normal", "lightDirection", "eyeDirection", "shininess")};

	// Emit lighting parameters
	fragColor = exp2(-vec4(lightDiffusePower * lightColor, lightSpecularPower * gloss) * lightPower);
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
${parallax.perturbDeclare("FORCE_HEIGHT_MAP")}
${rgb.linearToStandardDeclare}
${rgb.standardToLinearDeclare}

uniform vec3 ambientLightColor;
uniform sampler2D lightBuffer;

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform vec4 glossFactor;
uniform sampler2D glossMap;
uniform sampler2D heightMap;
uniform float heightParallaxBias;
uniform float heightParallaxScale;

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
	vec3 t = normalize(tangent);
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);

	vec3 eyeDirection = normalize(-point);
	vec2 coordParallax = ${parallax.perturbInvoke("FORCE_HEIGHT_MAP", "coord", "heightMap", "heightMapEnable", "eyeDirection", "heightParallaxScale", "heightParallaxBias", "t", "b", "n")};

	vec3 albedo = albedoFactor.rgb * ${rgb.standardToLinearInvoke("texture(albedoMap, coordParallax).rgb")};
	vec3 gloss = glossFactor.rgb * texture(glossMap, coordParallax).rgb;

	// Emit final fragment color
	vec3 color = albedo * (ambientLight + diffuseLight) + gloss * specularLight;

	fragColor = vec4(${rgb.linearToStandardInvoke("color")}, 1.0);
}`;

interface Configuration {
	lightModel: LightModel,
	lightModelPhongNoAmbient?: boolean,
	lightModelPhongNoDiffuse?: boolean,
	lightModelPhongNoSpecular?: boolean,
	useHeightMap: boolean,
	useNormalMap: boolean
}

interface LightState<TLight> extends State {
	depthBuffer: WebGLTexture,
	light: TLight,
	normalAndGlossBuffer: WebGLTexture,
	viewportSize: vector.Vector2
}

const enum LightType {
	Directional,
	Point
}

interface MaterialState extends State {
	ambientLightColor: vector.Vector3,
	lightBuffer: WebGLTexture
}

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const loadGeometry = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [
		{ name: "FORCE_HEIGHT_MAP", value: configuration.useHeightMap ? 1 : 0 },
		{ name: "FORCE_NORMAL_MAP", value: configuration.useNormalMap ? 1 : 0 }
	];

	// Setup geometry shader
	const shader = new webgl.Shader<State>(gl, geometryVertexShader, geometryFragmentShader, directives);

	shader.bindAttributePerGeometry("coords", geometry => geometry.coords);
	shader.bindAttributePerGeometry("normals", geometry => geometry.normals);
	shader.bindAttributePerGeometry("points", geometry => geometry.points);
	shader.bindAttributePerGeometry("tangents", geometry => geometry.tangents);

	shader.bindMatrixPerNode("modelMatrix", state => state.transform.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerNode("normalMatrix", state => state.normalMatrix, gl => gl.uniformMatrix3fv);
	shader.bindMatrixPerTarget("projectionMatrix", state => state.projectionMatrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerTarget("viewMatrix", state => state.viewMatrix.getValues(), gl => gl.uniformMatrix4fv);

	if (configuration.lightModel === LightModel.Phong) {
		shader.bindTexturePerMaterial("glossMap", undefined, material => material.glossMap);
		shader.bindPropertyPerMaterial("shininess", material => material.shininess, gl => gl.uniform1f);
	}

	if (configuration.useHeightMap) {
		shader.bindTexturePerMaterial("heightMap", undefined, material => material.heightMap);
		shader.bindPropertyPerMaterial("heightParallaxBias", material => material.heightParallaxBias, gl => gl.uniform1f);
		shader.bindPropertyPerMaterial("heightParallaxScale", material => material.heightParallaxScale, gl => gl.uniform1f);
	}

	if (configuration.useNormalMap)
		shader.bindTexturePerMaterial("normalMap", undefined, material => material.normalMap);

	return shader;
};

const loadLight = <T>(gl: WebGLRenderingContext, configuration: Configuration, type: LightType) => {
	const directives = [
		{ name: "LIGHT_TYPE", value: type }
	];

	// Setup light shader
	const shader = new webgl.Shader<LightState<T>>(gl, lightVertexShader, lightFragmentShader, directives);

	shader.bindAttributePerGeometry("points", geometry => geometry.points);

	shader.bindMatrixPerNode("modelMatrix", state => state.transform.getValues(), gl => gl.uniformMatrix4fv);

	shader.bindMatrixPerTarget("inverseProjectionMatrix", state => state.projectionMatrix.inverse().getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerTarget("projectionMatrix", state => state.projectionMatrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerTarget("viewMatrix", state => state.viewMatrix.getValues(), gl => gl.uniformMatrix4fv);

	shader.bindPropertyPerTarget("viewportSize", state => vector.Vector2.toArray(state.viewportSize), gl => gl.uniform2fv);

	shader.bindTexturePerTarget("depthBuffer", undefined, state => state.depthBuffer);
	shader.bindTexturePerTarget("normalAndGlossBuffer", undefined, state => state.normalAndGlossBuffer);

	return shader;
};

const loadLightDirectional = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const shader = loadLight<webgl.DirectionalLight>(gl, configuration, LightType.Directional);

	shader.bindPropertyPerTarget("directionalLight.color", state => vector.Vector3.toArray(state.light.color), gl => gl.uniform3fv);
	shader.bindPropertyPerTarget("directionalLight.direction", state => vector.Vector3.toArray(state.light.direction), gl => gl.uniform3fv);

	return shader;
};

const loadLightPoint = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const shader = loadLight<webgl.PointLight>(gl, configuration, LightType.Point);

	shader.bindPropertyPerTarget("pointLight.color", state => vector.Vector3.toArray(state.light.color), gl => gl.uniform3fv);
	shader.bindPropertyPerTarget("pointLight.position", state => vector.Vector3.toArray(state.light.position), gl => gl.uniform3fv);
	shader.bindPropertyPerTarget("pointLight.radius", state => state.light.radius, gl => gl.uniform1f);

	return shader;
};

const loadMaterial = (gl: WebGLRenderingContext, configuration: Configuration) => {
	// Build directives from configuration
	const directives = [];

	switch (configuration.lightModel) {
		case LightModel.Phong:
			directives.push({ name: "LIGHT_MODEL_AMBIENT", value: configuration.lightModelPhongNoAmbient ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_DIFFUSE", value: configuration.lightModelPhongNoDiffuse ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_SPECULAR", value: configuration.lightModelPhongNoSpecular ? 0 : 1 });

			break;
	}

	directives.push({ name: "FORCE_HEIGHT_MAP", value: configuration.useHeightMap ? 1 : 0 });

	// Setup material shader
	const shader = new webgl.Shader<MaterialState>(gl, materialVertexShader, materialFragmentShader, directives);

	shader.bindAttributePerGeometry("coords", geometry => geometry.coords);
	shader.bindAttributePerGeometry("normals", geometry => geometry.normals);
	shader.bindAttributePerGeometry("points", geometry => geometry.points);
	shader.bindAttributePerGeometry("tangents", geometry => geometry.tangents);

	shader.bindMatrixPerNode("modelMatrix", state => state.transform.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerNode("normalMatrix", state => state.normalMatrix, gl => gl.uniformMatrix3fv);
	shader.bindMatrixPerTarget("projectionMatrix", state => state.projectionMatrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.bindMatrixPerTarget("viewMatrix", state => state.viewMatrix.getValues(), gl => gl.uniformMatrix4fv);

	shader.bindPropertyPerTarget("ambientLightColor", state => vector.Vector3.toArray(state.ambientLightColor), gl => gl.uniform3fv);
	shader.bindTexturePerTarget("lightBuffer", undefined, state => state.lightBuffer);

	shader.bindPropertyPerMaterial("albedoFactor", material => material.albedoFactor, gl => gl.uniform4fv);
	shader.bindTexturePerMaterial("albedoMap", undefined, material => material.albedoMap);

	if (configuration.lightModel >= LightModel.Phong) {
		shader.bindPropertyPerMaterial("glossFactor", material => material.glossFactor, gl => gl.uniform4fv);
		shader.bindTexturePerMaterial("glossMap", undefined, material => material.glossMap);
	}

	if (configuration.useHeightMap) {
		shader.bindTexturePerMaterial("heightMap", undefined, material => material.heightMap);
		shader.bindPropertyPerMaterial("heightParallaxBias", material => material.heightParallaxBias, gl => gl.uniform1f);
		shader.bindPropertyPerMaterial("heightParallaxScale", material => material.heightParallaxScale, gl => gl.uniform1f);
	}

	return shader;
};

class Pipeline implements webgl.Pipeline {
	public readonly depthBuffer: WebGLTexture;
	public readonly lightBuffer: WebGLTexture;
	public readonly normalAndGlossBuffer: WebGLTexture;

	private readonly directionalLightPainter: webgl.Painter<LightState<webgl.DirectionalLight>>;
	private readonly fullscreenMesh: webgl.Mesh;
	private readonly fullscreenProjection: matrix.Matrix4;
	private readonly geometryPainter: webgl.Painter<State>;
	private readonly geometryTarget: webgl.Target;
	private readonly gl: WebGLRenderingContext;
	private readonly lightTarget: webgl.Target;
	private readonly materialPainter: webgl.Painter<MaterialState>;
	private readonly pointLightPainter: webgl.Painter<LightState<webgl.PointLight>>;
	private readonly sphereMesh: webgl.Mesh;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const geometry = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);
		const light = new webgl.Target(gl, gl.canvas.clientWidth, gl.canvas.clientHeight);

		this.depthBuffer = geometry.setupDepthTexture(webgl.Format.Depth16);
		this.directionalLightPainter = new painter.Painter(gl, loadLightDirectional(gl, configuration));
		this.fullscreenMesh = webgl.loadMesh(gl, quad.mesh);
		this.fullscreenProjection = matrix.Matrix4.createOrthographic(-1, 1, -1, 1, -1, 1);
		this.geometryPainter = new painter.Painter(gl, loadGeometry(gl, configuration));
		this.geometryTarget = geometry;
		this.gl = gl;
		this.lightBuffer = light.setupColorTexture(webgl.Format.RGBA8);
		this.lightTarget = light;
		this.materialPainter = new painter.Painter(gl, loadMaterial(gl, configuration));
		this.pointLightPainter = new painter.Painter(gl, loadLightPoint(gl, configuration));
		this.normalAndGlossBuffer = geometry.setupColorTexture(webgl.Format.RGBA8);
		this.sphereMesh = webgl.loadMesh(gl, sphere.mesh);
	}

	public process(target: webgl.Target, transform: webgl.Transform, scene: webgl.Scene) {
		const gl = this.gl;
		const viewportSize = { x: gl.canvas.clientWidth, y: gl.canvas.clientHeight };

		// Render geometries to geometry buffers
		gl.disable(gl.BLEND);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		this.geometryTarget.clear();
		this.geometryTarget.draw(this.geometryPainter, scene.subjects, transform.viewMatrix, transform);

		// Render lights to light buffer
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.DST_COLOR, gl.ZERO);

		this.lightTarget.setClearColor(1, 1, 1, 1);
		this.lightTarget.clear();

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
				this.lightTarget.draw(this.directionalLightPainter, subjects, transform.viewMatrix, {
					depthBuffer: this.depthBuffer,
					normalAndGlossBuffer: this.normalAndGlossBuffer,
					light: directionalLight,
					projectionMatrix: this.fullscreenProjection,
					viewMatrix: transform.viewMatrix,
					viewportSize: viewportSize
				});
			}
		}

		if (scene.pointLights !== undefined) {
			const subjects = [{
				matrix: matrix.Matrix4.createIdentity(),
				mesh: this.sphereMesh
			}];

			gl.cullFace(gl.FRONT);

			for (const pointLight of scene.pointLights) {
				subjects[0].matrix = matrix.Matrix4.createIdentity()
					.translate(pointLight.position)
					.scale({ x: pointLight.radius, y: pointLight.radius, z: pointLight.radius });

				this.lightTarget.draw(this.pointLightPainter, subjects, transform.viewMatrix, {
					depthBuffer: this.depthBuffer,
					normalAndGlossBuffer: this.normalAndGlossBuffer,
					light: pointLight,
					projectionMatrix: transform.projectionMatrix,
					viewMatrix: transform.viewMatrix,
					viewportSize: viewportSize
				});
			}
		}

		// Render materials to output
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.disable(gl.BLEND);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		target.draw(this.materialPainter, scene.subjects, transform.viewMatrix, {
			ambientLightColor: scene.ambientLightColor || vector.Vector3.zero,
			lightBuffer: this.lightBuffer,
			projectionMatrix: transform.projectionMatrix,
			viewMatrix: transform.viewMatrix
		});
	}

	public resize(width: number, height: number) {
		this.geometryTarget.resize(width, height);
		this.lightTarget.resize(width, height);
	}
}

export { Configuration, LightModel, Pipeline }