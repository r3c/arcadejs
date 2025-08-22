import { createDelegateDisposable, Disposable } from "../../language/lifecycle";
import { Matrix3, Matrix4 } from "../../math/matrix";
import { GlTarget } from "../webgl";
import { GlMaterial, GlMesh, GlPolygon } from "./model";
import { GlBuffer } from "./resource";
import { GlShaderBinding } from "./shader";

type Painter<TScene> = Disposable & {
  /**
   * Register a new mesh on this painter to be displayed on each render until it
   * is deleted. Once registered, mesh's transform matrix can be updated but its
   * children and polygons cannot.
   */
  register: (mesh: GlMesh) => PainterResource;

  /**
   * Render current painter with all its registered meshes onto given target.
   */
  render: (target: GlTarget, scene: TScene, viewMatrix: Matrix4) => void;
};

type PainterBinder<TScene> = (
  feature: PainterFeature
) => PainterBinding<TScene>;

type PainterBinding<TScene> = Disposable & {
  materialBinding: GlShaderBinding<GlMaterial>;
  matrixBinding: GlShaderBinding<PainterMatrix>;
  polygonBinding: GlShaderBinding<GlPolygon>;
  sceneBinding: GlShaderBinding<TScene>;
};

type PainterFeature = {
  hasCoordinate: boolean;
  hasNormal: boolean;
  hasTangent: boolean;
  hasTint: boolean;
};

type PainterMatrix = {
  model: Matrix4;
  normal: Matrix3;
};

type PainterMesh = {
  children: PainterMesh[];
  primitives: PainterPrimitive[];
  transform: Matrix4;
};

const enum PainterMode {
  Triangle,
  Wire,
}

type PainterPrimitive = {
  indexBuffer: GlBuffer;
  polygon: GlPolygon;
};

type PainterResource = {
  remove: () => void;
};

type PainterShader<TScene> = {
  binding: PainterBinding<TScene>;
  volumes: PainterVolume[];
};

type PainterVolume = {
  material: GlMaterial;
  mesh: PainterMesh;
};

const drawModes = {
  [PainterMode.Triangle]: WebGL2RenderingContext["TRIANGLES"],
  [PainterMode.Wire]: WebGL2RenderingContext["LINES"],
};

/*
 ** Create a painter keeping scene objects organized in a hierarchical tree to
 ** reuse bindings as much as possible:
 ** Painter > Shader feature > Material > Nested objects > Polygons
 */
const createBindingPainter = <TScene>(
  mode: PainterMode,
  binder: PainterBinder<TScene>
): Painter<TScene> => {
  const disposable = createDelegateDisposable();
  const drawMode = drawModes[mode];
  const shaders = new Map<number, PainterShader<TScene>>();

  if (drawMode === undefined) {
    throw new Error("unknown draw mode");
  }

  /**
   * Recursive mesh drawing function, recursively draw exploded meshes. When
   * this function is called, shader and material have already been enabled.
   */
  const draw = (
    target: GlTarget,
    matrixBinding: GlShaderBinding<PainterMatrix>,
    polygonBinding: GlShaderBinding<GlPolygon>,
    mesh: PainterMesh,
    view: Matrix4,
    parent: Matrix4
  ): void => {
    const model = Matrix4.fromSource(parent, ["multiply", mesh.transform]);
    const normal = Matrix3.fromSource(view, ["multiply", model], ["invert"]);

    matrixBinding.bind({ model, normal });

    for (const child of mesh.children) {
      draw(target, matrixBinding, polygonBinding, child, view, model);
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
  const explode = (mesh: GlMesh): Map<number, Map<GlMaterial, PainterMesh>> => {
    const { children, primitives, transform } = mesh;
    const results = new Map<number, Map<GlMaterial, PainterMesh>>();

    for (const child of children) {
      const result = explode(child);

      for (const [key, childMap] of result) {
        // Get or register by polygon feature key
        const meshes = results.get(key) ?? new Map<GlMaterial, PainterMesh>();

        results.set(key, meshes);

        for (const [material, children] of childMap) {
          // Get or register by material
          const mesh = meshes.get(material) ?? {
            children: [],
            primitives: [],
            transform,
          };

          meshes.set(material, mesh);

          // Append child mesh
          mesh.children.push(children);
        }
      }
    }

    for (const { index, material, polygon } of primitives) {
      const key = polygonToKey(polygon);

      // Get or register by polygon feature key
      const meshes = results.get(key) ?? new Map<GlMaterial, PainterMesh>();

      results.set(key, meshes);

      // Get or register by material
      const mesh = meshes.get(material) ?? {
        children: [],
        primitives: [],
        transform,
      };

      meshes.set(material, mesh);

      // Append primitive
      mesh.primitives.push({ indexBuffer: index, polygon });
    }

    return results;
  };

  return {
    dispose: disposable.dispose,

    register: (mesh) => {
      const results = explode(mesh);

      for (const [featureKey, meshesByMaterial] of results) {
        let shader = shaders.get(featureKey);
        let volumes: PainterVolume[];

        if (shader === undefined) {
          const binding = binder(keyToFeature(featureKey));

          disposable.register(binding);

          volumes = [];

          shaders.set(featureKey, { binding, volumes });
        } else {
          volumes = shader.volumes;
        }

        for (const [material, mesh] of meshesByMaterial.entries()) {
          volumes.push({ material, mesh });
        }
      }

      return {
        remove: () => {
          throw new Error("not implemented");
        },
      };
    },

    render: (target, scene, viewMatrix) => {
      for (const { binding, volumes } of shaders.values()) {
        const { materialBinding, matrixBinding, polygonBinding, sceneBinding } =
          binding;

        sceneBinding.bind(scene);

        for (const { material, mesh } of volumes) {
          materialBinding.bind(material);

          draw(
            target,
            matrixBinding,
            polygonBinding,
            mesh,
            viewMatrix,
            Matrix4.identity
          );
        }
      }
    },
  };
};

const keyToFeature = (key: number): PainterFeature => ({
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
  type Painter,
  type PainterBinder,
  type PainterBinding,
  type PainterFeature,
  type PainterMatrix,
  PainterMode,
  createBindingPainter,
};
