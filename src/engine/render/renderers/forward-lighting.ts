import * as matrix from "../../math/matrix";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

const commonShader = `
#define LIGHT_MODEL_AMBIENT 1
#define LIGHT_MODEL_LAMBERT 2
#define LIGHT_MODEL_PHONG 3

struct PointLight {
	vec3 diffuseColor;
	vec3 position;
	float radius; // FIXME: ignored
	vec3 specularColor;
};

uniform PointLight pointLights[POINT_LIGHT_COUNT];`;

const vertexShader = `
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space (normal mapping disabled) or tangent space (normal mapping enabled)
out vec3 lightDirections[POINT_LIGHT_COUNT]; // Direction of lights in same space than eye vector
out vec3 normal; // Normal at point in same space than eye vector

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 point = viewMatrix * modelMatrix * vec4(points, 1.0);

	vec3 pointCamera = point.xyz;
	vec3 eyeDirectionCamera = normalize(-pointCamera);

	coord = coords;

	vec3 n = normalize(normalMatrix * normals);
	vec3 t = normalize(normalMatrix * tangents);
	vec3 b = cross(n, t);

	#ifdef USE_NORMAL_MAP
		for (int i = 0; i < POINT_LIGHT_COUNT; ++i) {
			vec3 lightDirectionCamera = normalize(toCameraPosition(pointLights[i].position) - pointCamera);

			lightDirections[i] = vec3(dot(lightDirectionCamera, t), dot(lightDirectionCamera, b), dot(lightDirectionCamera, n));
		}

		eye = vec3(dot(eyeDirectionCamera, t), dot(eyeDirectionCamera, b), dot(eyeDirectionCamera, n));
		normal = vec3(0.0, 0.0, 1.0);
	#else
		for (int i = 0; i < POINT_LIGHT_COUNT; ++i)
			lightDirections[i] = toCameraPosition(pointLights[i].position) - pointCamera;

		eye = eyeDirectionCamera;
		normal = n;
	#endif

	gl_Position = projectionMatrix * point;
}`;

const fragmentShader = `
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
in vec3 lightDirections[POINT_LIGHT_COUNT];
in vec3 normal;

layout(location=0) out vec4 fragColor;

vec2 getCoord(in vec2 initialCoord, in vec3 eyeDirection, float parallaxScale, float parallaxBias) {
	#ifdef USE_HEIGHT_MAP
		float parallaxHeight = texture(heightMap, initialCoord).r;

		return initialCoord + (parallaxHeight * parallaxScale - parallaxBias) * eyeDirection.xy / eyeDirection.z;
	#else
		return initialCoord;
	#endif
}

vec3 getLight(in vec2 coord, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection, in PointLight light) {
	float lightNormalCosine = dot(normal, lightDirection);
	vec3 outputColor = vec3(0, 0, 0);

	if (lightNormalCosine > 0.0) {
		if (LIGHT_MODEL >= LIGHT_MODEL_LAMBERT) {
			vec3 diffuseMaterial = texture(diffuseMap, coord).rgb;
			float diffusePower = lightNormalCosine;

			outputColor += diffuseColor.rgb * light.diffuseColor * diffuseMaterial * diffusePower;
		}

		if (LIGHT_MODEL >= LIGHT_MODEL_PHONG) {
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

			outputColor += specularColor.rgb * light.specularColor * specularMaterial * specularPower;
		}
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

	if (LIGHT_MODEL >= LIGHT_MODEL_AMBIENT)
		outputColor += vec3(0.3, 0.3, 0.3) * ambientColor.rgb * texture(ambientMap, modifiedCoord).rgb;

	for (int i = 0; i < POINT_LIGHT_COUNT; ++i)
		outputColor += getLight(modifiedCoord, modifiedNormal, eyeDirection, normalize(lightDirections[i]), pointLights[i]);

	fragColor = vec4(outputColor, 1.0);
}`;

interface Configuration {
	lightModel: LightModel,
	pointLightCount: number,
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
	pointLights: webgl.PointLight[]
}

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const load = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const directives = [];

	directives.push({ name: "LIGHT_MODEL", value: <number>configuration.lightModel });
	directives.push({ name: "POINT_LIGHT_COUNT", value: configuration.pointLightCount });

	if (configuration.useHeightMap)
		directives.push({ name: "USE_HEIGHT_MAP", value: 1 });

	if (configuration.useNormalMap)
		directives.push({ name: "USE_NORMAL_MAP", value: 1 });

	const shader = new webgl.Shader<LightState>(gl, commonShader + vertexShader, commonShader + fragmentShader, directives);

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

	for (let i = 0; i < configuration.pointLightCount; ++i) {
		shader.bindPropertyPerTarget("pointLights[" + i + "].diffuseColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLights[i].diffuseColor));
		shader.bindPropertyPerTarget("pointLights[" + i + "].position", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLights[i].position));
		shader.bindPropertyPerTarget("pointLights[" + i + "].radius", gl => gl.uniform1f, state => state.pointLights[i].radius);
		shader.bindPropertyPerTarget("pointLights[" + i + "].specularColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.pointLights[i].specularColor));
	}

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	private readonly gl: WebGLRenderingContext;
	private readonly shader: webgl.Shader<LightState>;

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		this.gl = gl;
		this.shader = load(gl, configuration);
	}

	public render(target: webgl.Target, scene: webgl.Scene, state: State) {
		const gl = this.gl;

		gl.disable(gl.BLEND);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		gl.enable(gl.DEPTH_TEST);

		target.draw(this.shader, scene.subjects, {
			pointLights: scene.pointLights || [],
			projectionMatrix: state.projectionMatrix,
			viewMatrix: state.viewMatrix
		});
	}
}

export { Configuration, LightModel, Renderer, State }