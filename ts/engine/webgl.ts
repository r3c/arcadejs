import * as graphic from "./graphic";
import * as math from "./math";

interface Material {
	ambient: WebGLTexture | undefined,
	ambientColor: math.Vector4,
	diffuse: WebGLTexture | undefined,
	diffuseColor: math.Vector4,
	specular: WebGLTexture | undefined
	specularColor: math.Vector4
}

interface MaterialMap {
	[name: string]: Material
}

interface Mesh {
	colors: WebGLBuffer | undefined,
	coords: WebGLBuffer | undefined,
	faces: WebGLBuffer,
	material: Material,
	normals: WebGLBuffer | undefined,
	positions: WebGLBuffer,
	vertices: number
}

interface ShaderAttributes {
	color: number | undefined,
	coord: number | undefined,
	normal: number | undefined,
	position: number
}

interface ShaderUniforms {
	ambient: WebGLUniformLocation | undefined,
	modelViewMatrix: WebGLUniformLocation,
	projectionMatrix: WebGLUniformLocation
}

interface Shader {
	attributes: ShaderAttributes;
	program: WebGLProgram;
	uniforms: ShaderUniforms;
}

const defaultColor = {
	x: 1,
	y: 1,
	z: 1,
	w: 1
};

function flatMap<T, U>(items: T[], convert: (item: T) => U[]) {
	return new Array<U>().concat(...items.map(convert));
}

const createBuffer = (gl: WebGLRenderingContext, target: number, values: ArrayBufferView) => {
	const buffer = gl.createBuffer();

	if (buffer === null)
		throw Error("could not create buffer");

	gl.bindBuffer(target, buffer);
	gl.bufferData(target, values, gl.STATIC_DRAW);

	return buffer;
};

const createProgram = (gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) => {
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

	const program = gl.createProgram();

	if (program === null)
		throw Error("could not create program");

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const error = gl.getProgramInfoLog(program);

		gl.deleteProgram(program);

		throw Error(`could not link program: ${error}`);
	}

	return program;
}

const createShader = (gl: WebGLRenderingContext, shaderType: number, source: string) => {
	const shader = gl.createShader(shaderType);

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const error = gl.getShaderInfoLog(shader);

		gl.deleteShader(shader);

		throw Error(`could not compile shader: ${error}`);
	}

	return shader;
};

const createTexture = async (gl: WebGLRenderingContext, url: string) => {
	const isPowerOf2 = (value: number) => {
		return ((value - 1) & value) === 0;
	};

	return new Promise<WebGLTexture>((resolve, reject) => {
		const image = new Image();

		image.onabort = () => reject(`image load aborted: "${url}"`);
		image.onerror = () => reject(`image load failed: "${url}"`);
		image.onload = () => {
			const texture = gl.createTexture();

			if (texture === null)
				return reject(`texture creation failed: "${url}"`);

			if (!isPowerOf2(image.width) || !isPowerOf2(image.height))
				return reject(`image doesn't have power-of-2 dimensions: "${url}"`);

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.generateMipmap(gl.TEXTURE_2D);

			resolve(texture);
		};

		image.src = url;
	});
};

const clear = (gl: WebGLRenderingContext) => {
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

const draw = (gl: WebGLRenderingContext, shader: Shader, projection: math.Matrix, modelView: math.Matrix, meshes: Mesh[]) => {
	gl.useProgram(shader.program);

	for (const mesh of meshes) {
		// Bind colors vector if defined and supported
		if (mesh.colors !== undefined && shader.attributes.color !== undefined) {
			gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colors);
			gl.vertexAttribPointer(shader.attributes.color, 4, gl.FLOAT, false, 0, 0);
			gl.enableVertexAttribArray(shader.attributes.color);
		}

		// Bind coords vector if defined and supported
		if (mesh.coords !== undefined && shader.attributes.coord !== undefined) {
			gl.bindBuffer(gl.ARRAY_BUFFER, mesh.coords);
			gl.vertexAttribPointer(shader.attributes.coord, 2, gl.FLOAT, false, 0, 0);
			gl.enableVertexAttribArray(shader.attributes.coord);
		}

		// Bind ambient texture if defined and supported
		if (mesh.material.ambient !== undefined && shader.uniforms.ambient !== undefined) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, mesh.material.ambient);
			gl.uniform1i(shader.uniforms.ambient, 0);
		}

		// Bind positions vector
		gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positions);
		gl.vertexAttribPointer(shader.attributes.position, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(shader.attributes.position);

		// Set the shader uniforms
		gl.uniformMatrix4fv(shader.uniforms.projectionMatrix, false, new Float32Array(projection.getValues()));
		gl.uniformMatrix4fv(shader.uniforms.modelViewMatrix, false, new Float32Array(modelView.getValues()));

		// Bind indices array buffer and perform draw call
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.faces);
		gl.drawElements(gl.TRIANGLES, mesh.vertices, gl.UNSIGNED_SHORT, 0);
	}
};

const load = async (gl: WebGLRenderingContext, model: graphic.Model, path: string = "") => {
	const definitions = model.materials || {};
	const materials: MaterialMap = {};
	const meshes: Mesh[] = [];

	for (const mesh of model.meshes) {
		let material: Material;
		const name = mesh.materialName;

		if (name !== undefined && definitions[name] !== undefined) {
			if (materials[name] === undefined) {
				const definition = definitions[name];

				materials[name] = {
					ambient: definition.ambient !== undefined
						? await createTexture(gl, path + definition.ambient)
						: undefined,
					ambientColor: defaultColor,
					diffuse: undefined,
					diffuseColor: defaultColor,
					specular: undefined,
					specularColor: defaultColor
				}
			}

			material = materials[name];
		}
		else {
			material = {
				ambient: undefined,
				ambientColor: defaultColor,
				diffuse: undefined,
				diffuseColor: defaultColor,
				specular: undefined,
				specularColor: defaultColor
			};
		}

		meshes.push({
			colors: mesh.colors !== undefined
				? createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.colors, color => [color.x, color.y, color.z, color.w])))
				: undefined,
			coords: mesh.coords !== undefined
				? createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.coords, coord => [coord.x, coord.y])))
				: undefined,
			faces: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(flatMap(mesh.faces, face => [face[0], face[1], face[2]]))),
			material: material,
			normals: mesh.normals !== undefined
				? createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.normals, normal => [normal.x, normal.y, normal.z])))
				: undefined,
			positions: createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(flatMap(mesh.positions, position => [position.x, position.y, position.z]))),
			vertices: mesh.faces.length * 3
		});

	}

	return meshes;
};

const setup = (gl: WebGLRenderingContext) => {
	gl.clearColor(0, 0, 0, 1);
	gl.clearDepth(1.0);
	gl.depthFunc(gl.LEQUAL);
	gl.enable(gl.DEPTH_TEST);
};

export { Mesh, Shader, createProgram, clear, draw, load, setup }