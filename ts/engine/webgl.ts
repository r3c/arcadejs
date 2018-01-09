
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

const createProgram = (gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) => {
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

	const program = gl.createProgram();

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const error = gl.getProgramInfoLog(program);

		gl.deleteProgram(program);

		throw Error(`could not link program: ${error}`);
	}

	return program;
};

const draw = (gl: WebGLRenderingContext) => {
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
};

export { draw }