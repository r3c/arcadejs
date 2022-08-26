import { Matrix3, Matrix4 } from "../../math/matrix";
import * as webgl from "../webgl";

interface Batch<State> {
  shaders: Map<number, BatchOfShader<State>>;
}

interface BatchOfGeometry {
  instances: Matrix4[];
}

interface BatchOfMaterial {
  geometries: Map<webgl.Geometry, BatchOfGeometry>;
}

interface BatchOfShader<TState> {
  materials: Map<webgl.Material, BatchOfMaterial>;
  shader: webgl.Shader<TState>;
}

type MaterialClassifier<State> = (
  material: webgl.Material,
  state: State
) => number;
type ShaderConstructor<State> = (
  material: webgl.Material,
  state: State
) => webgl.Shader<State>;

class Painter<State> implements webgl.Painter<State> {
  private readonly materialClassifier: MaterialClassifier<State>;
  private readonly shaderConstructor: ShaderConstructor<State>;
  private readonly shaderRepository: webgl.Shader<State>[];

  public constructor(
    materialClassifier: MaterialClassifier<State>,
    shaderConstructor: ShaderConstructor<State>
  ) {
    this.materialClassifier = materialClassifier;
    this.shaderConstructor = shaderConstructor;
    this.shaderRepository = new Array<webgl.Shader<State>>(64);
  }

  public paint(
    target: webgl.Target,
    subjects: Iterable<webgl.Subject>,
    view: Matrix4,
    state: State
  ): void {
    const batch: Batch<State> = {
      shaders: new Map(),
    };

    for (const subject of subjects)
      this.group(batch, subject.mesh.nodes, subject.matrix, state);

    this.draw(target, batch, view, state);
  }

  private create(index: number, material: webgl.Material, state: State) {
    if (this.shaderRepository[index] === undefined) {
      this.shaderRepository[index] = this.shaderConstructor(material, state);
    }

    return this.shaderRepository[index];
  }

  private draw(
    target: webgl.Target,
    batch: Batch<State>,
    view: Matrix4,
    state: State
  ): void {
    const normal = Matrix4.createIdentity();

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

          for (const transform of instances) {
            const viewTransformMatrix = normal
              .duplicate(view)
              .multiply(transform);

            const normalMatrix = Matrix3.fromObject(viewTransformMatrix)
              .invert()
              .toArray();

            shader.bindNode({ normalMatrix, transform });

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
    batch: Batch<State>,
    nodes: Iterable<webgl.Node>,
    parent: Matrix4,
    state: State
  ): void {
    const transform = Matrix4.createIdentity();

    for (const node of nodes) {
      transform.duplicate(parent).multiply(node.transform);

      this.group(batch, node.children, transform, state);

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
        batchOfGeometry.instances.push(transform);
      }
    }
  }
}

export { Painter };
