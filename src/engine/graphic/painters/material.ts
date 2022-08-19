import { Matrix4 } from "../../math/matrix";
import * as webgl from "../webgl";

interface MaterialBatch {
  material: webgl.Material;
  models: ModelBatch[];
}

interface ModelBatch {
  geometry: webgl.Geometry;
  transform: Matrix4;
}

interface RootBatch<State> {
  shaders: { [variant: number]: ShaderBatch<State> };
}

interface ShaderBatch<State> {
  materials: { [id: string]: MaterialBatch };
  shader: webgl.Shader<State>;
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
    const batch: RootBatch<State> = {
      shaders: {},
    };

    for (const subject of subjects)
      this.sort(batch, subject.mesh.nodes, subject.matrix, state);

    this.draw(target, batch, view, state);
  }

  private create(index: number, material: webgl.Material, state: State) {
    if (this.shaderRepository[index] === undefined)
      this.shaderRepository[index] = this.shaderConstructor(material, state);

    return this.shaderRepository[index];
  }

  private draw(
    target: webgl.Target,
    batch: RootBatch<State>,
    view: Matrix4,
    state: State
  ): void {
    const normal = Matrix4.createIdentity();

    // Process batch shaders
    for (const shaderIndex in batch.shaders) {
      const shaderBatch = batch.shaders[shaderIndex];
      const shader = shaderBatch.shader;

      shader.activate();

      // Assign per-call properties
      const shaderTextureIndex = shader.bindTarget(state);

      // Process batch materials
      for (const id in shaderBatch.materials) {
        const materialBatch = shaderBatch.materials[id];
        const material = materialBatch.material;

        // Assign per-material properties
        shader.bindMaterial(material, shaderTextureIndex);

        // Process batch models
        for (const model of materialBatch.models) {
          const geometry = model.geometry;

          shader.bindGeometry(geometry);
          shader.bindNode({
            normalMatrix: normal
              .duplicate(view)
              .multiply(model.transform)
              .toTransposedInverse3x3(),
            transform: model.transform,
          });

          target.draw(
            0,
            geometry.indexBuffer,
            geometry.count,
            geometry.indexType
          );
        }
      }
    }
  }

  private sort(
    batch: RootBatch<State>,
    nodes: Iterable<webgl.Node>,
    parent: Matrix4,
    state: State
  ): void {
    const transform = Matrix4.createIdentity();

    for (const node of nodes) {
      transform.duplicate(parent).multiply(node.transform);

      this.sort(batch, node.children, transform, state);

      for (const primitive of node.primitives) {
        // Get or create shader batch
        const shaderIndex = this.materialClassifier(primitive.material, state);

        let shaderBatch = batch.shaders[shaderIndex];

        if (shaderBatch === undefined) {
          shaderBatch = {
            materials: {},
            shader: this.create(shaderIndex, primitive.material, state),
          };

          batch.shaders[shaderIndex] = shaderBatch;
        }

        // Get or create material batch
        let materialBatch = shaderBatch.materials[primitive.material.id];

        if (materialBatch === undefined) {
          materialBatch = {
            material: primitive.material,
            models: [],
          };

          shaderBatch.materials[primitive.material.id] = materialBatch;
        }

        // Append to models
        materialBatch.models.push({
          geometry: primitive.geometry,
          transform: transform,
        });
      }
    }
  }
}

export { Painter };
