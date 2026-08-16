import { createCompositeReleasable, Releasable } from "../../io/resource";
import { Matrix3, Matrix4 } from "../../math/matrix";
import { GlPencil, GlTarget } from "../webgl/target";
import { GlMaterial, GlMesh, GlPolygon } from "../webgl/model";
import { GlBuffer } from "../webgl/resource";
import { GlShaderBinding } from "../webgl/shader";
import { Renderer } from "../renderer";

type GlFeatureMeshBinder<TScene> = (
  flag: GlFeatureMeshFlag,
) => GlFeatureMeshBinding<TScene>;

type GlFeatureMeshBinding<TScene> = Releasable & {
  materialBinding: GlShaderBinding<GlMaterial>;
  polygonBinding: GlShaderBinding<GlPolygon>;
  sceneBinding: GlShaderBinding<TScene>;
  subjectBinding: GlShaderBinding<GlFeatureMeshSubject>;
};

type GlFeatureMeshConfiguration = {
  autoReleaseShader?: boolean;
};

type GlFeatureMeshFlag = {
  hasCoordinate: boolean;
  hasNormal: boolean;
  hasTangent: boolean;
  hasTint: boolean;
};

type GlFeatureMeshNode = {
  children: GlFeatureMeshNode[];
  primitives: GlFeaturePrimitive[];
  transform: Matrix4;
};

type GlFeaturePrimitive = {
  indexBuffer: GlBuffer;
  polygon: GlPolygon;
};

type GlFeatureMeshShader<TScene> = {
  binding: GlFeatureMeshBinding<TScene>;
  nodesByMaterial: Map<GlMaterial, Map<Symbol, GlFeatureMeshNode>>;
};

type GlFeatureMeshRenderer<TScene extends GlFeatureMeshScene> = Releasable &
  Renderer<GlTarget, TScene, GlMesh>;

type GlFeatureMeshScene = {
  view: Matrix4;
};

type GlFeatureMeshSubject = {
  model: Matrix4;
  normal: Matrix3;
};

/*
 ** Create a renderer keeping scene objects organized in a hierarchical tree to
 ** reuse bindings as much as possible:
 ** Renderer > Shader feature > Material > Nested objects > Polygons
 */
const createGlFeatureMeshRenderer = <TScene extends GlFeatureMeshScene>(
  mode: GlPencil,
  binder: GlFeatureMeshBinder<TScene>,
  configuration: GlFeatureMeshConfiguration,
): GlFeatureMeshRenderer<TScene> => {
  const autoReleaseShader = configuration.autoReleaseShader ?? false;
  const releasable = createCompositeReleasable();
  const shaders = new Map<number, GlFeatureMeshShader<TScene>>();

  /**
   * Recursive mesh drawing function, recursively draw exploded meshes. When
   * this function is called, shader and material have already been enabled.
   */
  const renderMesh = (
    target: GlTarget,
    subjectBinding: GlShaderBinding<GlFeatureMeshSubject>,
    polygonBinding: GlShaderBinding<GlPolygon>,
    mesh: GlFeatureMeshNode,
    view: Matrix4,
    parent: Matrix4,
  ): void => {
    const model = Matrix4.fromSource(parent, ["multiply", mesh.transform]);
    const normal = Matrix3.fromSource(view, ["multiply", model], ["invert"]);

    subjectBinding.bind({ model, normal });

    for (const child of mesh.children) {
      renderMesh(target, subjectBinding, polygonBinding, child, view, model);
    }

    for (const { indexBuffer, polygon } of mesh.primitives) {
      polygonBinding.bind(polygon);
      target.draw(mode, indexBuffer);
    }
  };

  /**
   * Recursive mesh explosion function, split mesh polygons by polygon feature
   * key (as different features will be drawn by different shaders) then
   * material, preserving primitive hierarchy.
   */
  const explode = (
    mesh: GlMesh,
  ): Map<number, Map<GlMaterial, GlFeatureMeshNode>> => {
    const { children, primitives, transform } = mesh;
    const results = new Map<number, Map<GlMaterial, GlFeatureMeshNode>>();

    for (const child of children) {
      const result = explode(child);

      for (const [key, childNodes] of result) {
        // Get or register by polygon feature key
        const nodes =
          results.get(key) ?? new Map<GlMaterial, GlFeatureMeshNode>();

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
      const nodes =
        results.get(key) ?? new Map<GlMaterial, GlFeatureMeshNode>();

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
    addSubject(mesh) {
      const removals: { featureKey: number; materials: GlMaterial[] }[] = [];
      const results = explode(mesh);
      const symbol = Symbol();

      for (const [featureKey, nodeByMaterial] of results) {
        let shader = shaders.get(featureKey);
        let nodesByMaterial: Map<GlMaterial, Map<Symbol, GlFeatureMeshNode>>;

        if (shader === undefined) {
          const binding = binder(keyToFlag(featureKey));

          releasable.register(binding);

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

      return () => {
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

          if (autoReleaseShader && nodesByMaterial.size === 0) {
            binding.release();
            releasable.remove(binding);
            shaders.delete(featureKey);
          }
        }
      };
    },

    release() {
      releasable.release();
    },

    render(target, scene) {
      for (const { binding, nodesByMaterial } of shaders.values()) {
        const {
          materialBinding,
          polygonBinding,
          sceneBinding,
          subjectBinding,
        } = binding;

        sceneBinding.bind(scene);

        for (const [material, meshes] of nodesByMaterial.entries()) {
          materialBinding.bind(material);

          for (const mesh of meshes.values()) {
            renderMesh(
              target,
              subjectBinding,
              polygonBinding,
              mesh,
              scene.view,
              Matrix4.identity,
            );
          }
        }
      }
    },

    setSize() {},
  };
};

const keyToFlag = (key: number): GlFeatureMeshFlag => ({
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
  type GlFeatureMeshBinder,
  type GlFeatureMeshBinding,
  type GlFeatureMeshConfiguration,
  type GlFeatureMeshFlag,
  type GlFeatureMeshRenderer,
  type GlFeatureMeshScene,
  type GlFeatureMeshSubject,
  createGlFeatureMeshRenderer,
};
