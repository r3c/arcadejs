import { createDelegateDisposable, Disposable } from "../../language/lifecycle";
import { Matrix3, Matrix4 } from "../../math/matrix";
import { GlTarget } from "../webgl";
import { GlMaterial, GlMesh, GlPolygon } from "../webgl/model";
import { GlBuffer } from "../webgl/resource";
import { GlShaderBinding } from "../webgl/shader";
import { Renderer } from "../renderer";

type GlMeshBinder<TScene> = (feature: GlMeshFeature) => GlMeshBinding<TScene>;

type GlMeshBinding<TScene> = Disposable & {
  material: GlShaderBinding<GlMaterial>;
  matrix: GlShaderBinding<GlMeshMatrix>;
  polygon: GlShaderBinding<GlPolygon>;
  scene: GlShaderBinding<TScene>;
};

type GlMeshFeature = {
  hasCoordinate: boolean;
  hasNormal: boolean;
  hasTangent: boolean;
  hasTint: boolean;
};

type GlMeshMatrix = {
  model: Matrix4;
  normal: Matrix3;
};

type GlMeshNode = {
  children: GlMeshNode[];
  primitives: GlMeshPrimitive[];
  transform: Matrix4;
};

type GlMeshHandle = {
  remove: () => void;
};

type GlMeshPrimitive = {
  indexBuffer: GlBuffer;
  polygon: GlPolygon;
};

type GlMeshRenderer<TScene extends GlMeshScene> = Disposable &
  Renderer<TScene, GlMesh, GlMeshHandle>;

const enum GlMeshRendererMode {
  Triangle,
  Wire,
}

type GlMeshScene = {
  view: Matrix4;
};

type GlMeshShader<TScene> = {
  binding: GlMeshBinding<TScene>;
  nodesByMaterial: Map<GlMaterial, Map<Symbol, GlMeshNode>>;
};

const drawModes = {
  [GlMeshRendererMode.Triangle]: WebGL2RenderingContext["TRIANGLES"],
  [GlMeshRendererMode.Wire]: WebGL2RenderingContext["LINES"],
};

/*
 ** Create a renderer keeping scene objects organized in a hierarchical tree to
 ** reuse bindings as much as possible:
 ** Renderer > Shader feature > Material > Nested objects > Polygons
 */
const createGlMeshRenderer = <TScene extends GlMeshScene>(
  target: GlTarget,
  mode: GlMeshRendererMode,
  binder: GlMeshBinder<TScene>
): GlMeshRenderer<TScene> => {
  const disposable = createDelegateDisposable();
  const drawMode = drawModes[mode];
  const shaders = new Map<number, GlMeshShader<TScene>>();

  if (drawMode === undefined) {
    throw new Error("unknown draw mode");
  }

  /**
   * Recursive mesh drawing function, recursively draw exploded meshes. When
   * this function is called, shader and material have already been enabled.
   */
  const renderMesh = (
    target: GlTarget,
    matrixBinding: GlShaderBinding<GlMeshMatrix>,
    polygonBinding: GlShaderBinding<GlPolygon>,
    mesh: GlMeshNode,
    view: Matrix4,
    parent: Matrix4
  ): void => {
    const model = Matrix4.fromSource(parent, ["multiply", mesh.transform]);
    const normal = Matrix3.fromSource(view, ["multiply", model], ["invert"]);

    matrixBinding.bind({ model, normal });

    for (const child of mesh.children) {
      renderMesh(target, matrixBinding, polygonBinding, child, view, model);
    }

    for (const { indexBuffer, polygon } of mesh.primitives) {
      polygonBinding.bind(polygon);
      target.draw(0, drawMode, indexBuffer);
    }
  };

  /**
   * Recursive mesh explosion function, split mesh polygons by polygon feature
   * key (as different features will be drawn by different shaders) then
   * material, preserving primitive hierarchy.
   */
  const explode = (mesh: GlMesh): Map<number, Map<GlMaterial, GlMeshNode>> => {
    const { children, primitives, transform } = mesh;
    const results = new Map<number, Map<GlMaterial, GlMeshNode>>();

    for (const child of children) {
      const result = explode(child);

      for (const [key, childNodes] of result) {
        // Get or register by polygon feature key
        const nodes = results.get(key) ?? new Map<GlMaterial, GlMeshNode>();

        results.set(key, nodes);

        for (const [material, childNode] of childNodes) {
          // Get or register by material
          const node = nodes.get(material) ?? {
            children: [],
            primitives: [],
            transform,
          };

          nodes.set(material, node);

          // Append child mesh
          node.children.push(childNode);
        }
      }
    }

    for (const { indexBuffer, material, polygon } of primitives) {
      const key = polygonToKey(polygon);

      // Get or register by polygon feature key
      const nodes = results.get(key) ?? new Map<GlMaterial, GlMeshNode>();

      results.set(key, nodes);

      // Get or register by material
      const node = nodes.get(material) ?? {
        children: [],
        primitives: [],
        transform,
      };

      nodes.set(material, node);

      // Append primitive
      node.primitives.push({ indexBuffer, polygon });
    }

    return results;
  };

  return {
    append(mesh) {
      const removals: { featureKey: number; materials: GlMaterial[] }[] = [];
      const results = explode(mesh);
      const symbol = Symbol();

      for (const [featureKey, nodeByMaterial] of results) {
        let shader = shaders.get(featureKey);
        let nodesByMaterial: Map<GlMaterial, Map<Symbol, GlMeshNode>>;

        if (shader === undefined) {
          const binding = binder(keyToFeature(featureKey));

          disposable.register(binding);

          nodesByMaterial = new Map();

          shaders.set(featureKey, { binding, nodesByMaterial });
        } else {
          nodesByMaterial = shader.nodesByMaterial;
        }

        const materials: GlMaterial[] = [];

        for (const [material, node] of nodeByMaterial.entries()) {
          const nodes = nodesByMaterial.get(material) ?? new Map();

          nodesByMaterial.set(material, nodes);

          materials.push(material);
          nodes.set(symbol, node);
        }

        removals.push({ featureKey, materials });
      }

      return {
        remove() {
          for (const { featureKey, materials } of removals) {
            const shader = shaders.get(featureKey);

            if (shader === undefined) {
              continue;
            }

            const { binding, nodesByMaterial } = shader;

            for (const material of materials) {
              const nodes = nodesByMaterial.get(material);

              if (nodes === undefined) {
                continue;
              }

              nodes.delete(symbol);

              if (nodes.size === 0) {
                nodesByMaterial.delete(material);
              }
            }

            if (nodesByMaterial.size === 0) {
              binding.dispose();
              disposable.remove(binding);
              shaders.delete(featureKey);
            }
          }
        },
      };
    },

    dispose() {
      disposable.dispose();
    },

    render(scene) {
      for (const {
        binding,
        nodesByMaterial: meshesByMaterial,
      } of shaders.values()) {
        binding.scene.bind(scene);

        for (const [material, meshes] of meshesByMaterial.entries()) {
          binding.material.bind(material);

          for (const mesh of meshes.values()) {
            renderMesh(
              target,
              binding.matrix,
              binding.polygon,
              mesh,
              scene.view,
              Matrix4.identity
            );
          }
        }
      }
    },

    resize() {},
  };
};

const keyToFeature = (key: number): GlMeshFeature => ({
  hasCoordinate: (key & 1) !== 0,
  hasNormal: (key & 2) !== 0,
  hasTangent: (key & 4) !== 0,
  hasTint: (key & 8) !== 0,
});

const polygonToKey = (polygon: GlPolygon): number => {
  const hasCoordinateBit = polygon.coordinate !== undefined ? 1 : 0;
  const hasNormalBit = polygon.normal !== undefined ? 2 : 0;
  const hasTangent = polygon.tangent !== undefined ? 4 : 0;
  const hasTint = polygon.tint !== undefined ? 8 : 0;

  return hasCoordinateBit + hasNormalBit + hasTangent + hasTint;
};

export {
  type GlMeshBinder,
  type GlMeshBinding,
  type GlMeshFeature,
  type GlMeshMatrix,
  type GlMeshRenderer,
  type GlMeshScene,
  GlMeshRendererMode,
  createGlMeshRenderer,
};
