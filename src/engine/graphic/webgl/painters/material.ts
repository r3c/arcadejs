import { Matrix3, Matrix4 } from "../../../math/matrix";
import * as webgl from "../../webgl";

interface Batch<State> {
  shaders: Map<number, BatchOfShader<State>>;
}

interface BatchOfGeometry {
  instances: Instance[];
}

interface BatchOfMaterial {
  geometries: Map<webgl.GlPolygon, BatchOfGeometry>;
}

interface BatchOfShader<TState> {
  materials: Map<webgl.GlMaterial, BatchOfMaterial>;
  shader: webgl.GlShader<TState>;
}

interface Instance {
  modelMatrix: Matrix4;
}

type MaterialClassifier<State> = (
  material: webgl.GlMaterial,
  state: State
) => number;
type ShaderConstructor<State> = (
  material: webgl.GlMaterial,
  state: State
) => webgl.GlShader<State>;

class MaterialPainter<TContext> implements webgl.GlPainter<TContext> {
  private readonly materialClassifier: MaterialClassifier<TContext>;
  private readonly shaderConstructor: ShaderConstructor<TContext>;
  private readonly shaderRepository: webgl.GlShader<TContext>[];

  public constructor(
    materialClassifier: MaterialClassifier<TContext>,
    shaderConstructor: ShaderConstructor<TContext>
  ) {
    this.materialClassifier = materialClassifier;
    this.shaderConstructor = shaderConstructor;
    this.shaderRepository = new Array<webgl.GlShader<TContext>>(64);
  }

  public paint(
    target: webgl.GlTarget,
    subjects: Iterable<webgl.GlSubject>,
    view: Matrix4,
    state: TContext
  ): void {
    const batch: Batch<TContext> = {
      shaders: new Map(),
    };

    for (const subject of subjects)
      this.group(batch, subject.model.meshes, subject.matrix, state);

    this.draw(target, batch, view, state);
  }

  private create(index: number, material: webgl.GlMaterial, state: TContext) {
    if (this.shaderRepository[index] === undefined) {
      this.shaderRepository[index] = this.shaderConstructor(material, state);
    }

    return this.shaderRepository[index];
  }

  private draw(
    target: webgl.GlTarget,
    batch: Batch<TContext>,
    viewMatrix: Matrix4,
    state: TContext
  ): void {
    const normalMatrix = Matrix3.createIdentity();

    // Process batch shaders
    for (const { materials, shader } of batch.shaders.values()) {
      shader.activate();

      const shaderTextureIndex = shader.bindTarget(state);

      // Process batch materials
      for (const [material, { geometries }] of materials.entries()) {
        shader.bindMaterial(material, shaderTextureIndex);

        // Process batch geometries
        for (const [geometry, { instances }] of geometries.entries()) {
          shader.bindGeometry(geometry);

          for (const { modelMatrix } of instances) {
            normalMatrix.set(viewMatrix);
            normalMatrix.multiply(modelMatrix);
            normalMatrix.invert();

            shader.bindNode({ modelMatrix, normalMatrix });

            target.draw(
              0,
              geometry.indexBuffer,
              geometry.indexCount,
              geometry.indexType
            );
          }
        }
      }
    }
  }

  private group(
    batch: Batch<TContext>,
    nodes: Iterable<webgl.GlMesh>,
    parent: Matrix4,
    state: TContext
  ): void {
    const modelMatrix = Matrix4.createIdentity();

    for (const node of nodes) {
      modelMatrix.set(parent);
      modelMatrix.multiply(node.transform);

      this.group(batch, node.children, modelMatrix, state);

      for (const { polygon: geometry, material } of node.primitives) {
        // Get or create shader batch
        const shaderIndex = this.materialClassifier(material, state);

        let batchOfShader = batch.shaders.get(shaderIndex);

        if (batchOfShader === undefined) {
          batchOfShader = {
            materials: new Map(),
            shader: this.create(shaderIndex, material, state),
          };

          batch.shaders.set(shaderIndex, batchOfShader);
        }

        // Get or create material batch
        let batchOfMaterial = batchOfShader.materials.get(material);

        if (batchOfMaterial === undefined) {
          batchOfMaterial = {
            geometries: new Map(),
          };

          batchOfShader.materials.set(material, batchOfMaterial);
        }

        // Get or create geometry batch
        let batchOfGeometry = batchOfMaterial.geometries.get(geometry);

        if (batchOfGeometry === undefined) {
          batchOfGeometry = {
            instances: [],
          };

          batchOfMaterial.geometries.set(geometry, batchOfGeometry);
        }

        // Append to models
        batchOfGeometry.instances.push({ modelMatrix });
      }
    }
  }
}

export { MaterialPainter };
