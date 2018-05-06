import * as matrix from "../../math/matrix";
import * as webgl from "../webgl";

const invalidAttributeBinding = (name: string) => Error(`cannot draw mesh with no ${name} attribute when shader expects one`);
const invalidUniformBinding = (name: string) => Error(`cannot draw mesh with no ${name} uniform when shader expects one`);

class Painter<State> implements webgl.Painter<State> {
	private readonly context: WebGLRenderingContext;
	private readonly shader: webgl.Shader<State>;

	public constructor(gl: WebGLRenderingContext, shader: webgl.Shader<State>) {
		this.context = gl;
		this.shader = shader;
	}

	public paint(subjects: Iterable<webgl.Subject>, view: matrix.Matrix4, state: State) {
		const gl = this.context;
		const shader = this.shader;

		gl.useProgram(shader.program);

		for (const subject of subjects) {
			// Assign per-call property uniforms
			for (const binding of shader.getPropertyPerTargetBindings())
				binding.bind(gl, state);

			// Assign per-call texture uniforms
			let textureIndex = 0;

			for (const binding of shader.getTexturePerTargetBindings()) {
				if (!binding.bind(gl, state, textureIndex++))
					throw invalidUniformBinding(binding.name);
			}

			// Draw subject nodes
			this.draw(subject.mesh.nodes, subject.matrix, view, textureIndex);
		}
	}

	private draw(nodes: Iterable<webgl.Node>, parentTransform: matrix.Matrix4, viewMatrix: matrix.Matrix4, textureIndex: number) {
		const gl = this.context;
		const shader = this.shader;

		for (const node of nodes) {
			const transform = parentTransform.compose(node.transform);

			this.draw(node.children, transform, viewMatrix, textureIndex);

			for (const primitive of node.primitives) {
				const geometry = primitive.geometry;
				const material = primitive.material;

				// Assign per-material property uniforms
				for (const binding of shader.getPropertyPerMaterialBindings())
					binding.bind(gl, material);

				// Assign per-material texture uniforms
				for (const binding of shader.getTexturePerMaterialBindings()) {
					if (!binding.bind(gl, material, textureIndex++))
						throw invalidUniformBinding(binding.name);
				}

				// Assign per-geometry property uniforms
				for (const binding of shader.getPropertyPerNodeBindings()) {
					binding.bind(gl, {
						normalMatrix: viewMatrix.compose(transform).getTransposedInverse3x3(),
						transform: transform
					});
				}

				// Assign per-geometry attributes
				for (const binding of shader.getAttributePerGeometryBindings()) {
					if (!binding.bind(gl, geometry))
						throw invalidAttributeBinding(binding.name);
				}

				// Perform draw call
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
				gl.drawElements(gl.TRIANGLES, geometry.count, geometry.indexType, 0);
			}
		}
	}
}

export { Painter }