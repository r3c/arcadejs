import { Matrix3, Matrix4 } from "../../math/matrix";
import * as webgl from "../webgl";

interface Batch<State> {
  shaders: Map<number, BatchOfShader<State>>;
}

interface BatchOfGeometry {
  instances: Instance[];
}

interface BatchOfMaterial {
  geometries: Map<webgl.Geometry, BatchOfGeometry>;
}

interface BatchOfShader<TState> {
  materials: Map<webgl.Material, BatchOfMaterial>;
  shader: webgl.Shader<TState>;
}

interface Instance {
  modelMatrix: Matrix4;
}

type MaterialClassifier<State> = (
  material: webgl.Material,
  state: State
) => number;
type ShaderConstructor<State> = (
  material: webgl.Material,
  state: State
) => webgl.Shader<State>;

class MaterialPainter<TContext> implements webgl.Painter<TContext> {
  private readonly materialClassifier: MaterialClassifier<TContext>;
  private readonly shaderConstructor: ShaderConstructor<TContext>;
  private readonly shaderRepository: webgl.Shader<TContext>[];

  public constructor(
    materialClassifier: MaterialClassifier<TContext>,
    shaderConstructor: ShaderConstructor<TContext>
  ) {
    this.materialClassifier = materialClassifier;
    this.shaderConstructor = shaderConstructor;
    this.shaderRepository = new Array<webgl.Shader<TContext>>(64);
  }

  public paint(
    target: webgl.Target,
    subjects: Iterable<webgl.Subject>,
    view: Matrix4,
    state: TContext
  ): void {
    const batch: Batch<TContext> = {
      shaders: new Map(),
    };

    for (const subject of subjects)
      this.group(batch, subject.mesh.nodes, subject.matrix, state);

    this.draw(target, batch, view, state);
  }

  private create(index: number, material: webgl.Material, state: TContext) {
    if (this.shaderRepository[index] === undefined) {
      this.shaderRepository[index] = this.shaderConstructor(material, state);
    }

    return this.shaderRepository[index];
  }

  private draw(
    target: webgl.Target,
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
            normalMatrix.duplicate(viewMatrix).multiply(modelMatrix).invert();

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
    nodes: Iterable<webgl.Node>,
    parent: Matrix4,
    state: TContext
  ): void {
    const modelMatrix = Matrix4.createIdentity();

    for (const node of nodes) {
      modelMatrix.duplicate(parent).multiply(node.transform);

      this.group(batch, node.children, modelMatrix, state);

      for (const { geometry, material } of node.primitives) {
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
