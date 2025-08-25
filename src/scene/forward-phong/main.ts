import {
  type Application,
  type ApplicationSetup,
  createCheckbox,
  createSelect,
  declare,
} from "../../engine/application";
import { Input, Pointer } from "../../engine/io/controller";
import { Renderer, WebGLScreen } from "../../engine/graphic/display";
import { range } from "../../engine/language/iterable";
import { loadMeshFromJson } from "../../engine/graphic/mesh";
import { Matrix4 } from "../../engine/math/matrix";
import { MutableVector3, Vector2, Vector3 } from "../../engine/math/vector";
import { GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { Mover, createCircleMover, createOrbitMover } from "../move";
import {
  Memo,
  createBooleansIndexer,
  memoize,
} from "../../engine/language/memo";
import { createModel } from "../../engine/graphic/webgl/model";
import {
  DebugTextureRenderer,
  DebugTextureEncoding,
  DebugTextureChannel,
} from "../../engine/graphic/webgl/renderers/debug-texture";
import { GlTexture } from "../../engine/graphic/webgl/texture";
import { Camera, createOrbitCamera } from "../../engine/stage/camera";
import {
  createForwardLightingRenderer,
  ForwardLightingLightModel,
  ForwardLightingRenderer,
  ForwardLightingScene,
  RendererSubject,
} from "../../engine/graphic/renderer";

/*
 ** What changed?
 ** - Directional (diffuse) and reflective (specular) lightning has been added to the scene
 ** - Shader supports tangent space transform for normal and height mapping
 ** - Scene uses two different shaders loaded from external files
 */

const configuration = {
  nbDirectionalLights: createSelect("dLights", ["0", "1", "2", "3"], 0),
  nbPointLights: createSelect("pLights", ["0", "1", "2", "3"], 1),
  move: createCheckbox("move", true),
  lightAmbient: createCheckbox("ambient", true),
  lightDiffuse: createCheckbox("diffuse", true),
  lightSpecular: createCheckbox("specular", true),
  useNormalMap: createCheckbox("nMap", true),
  useHeightMap: createCheckbox("hMap", true),
  debugMode: createSelect("debug", ["None", "Shadow"], 0),
};

type ApplicationState = {
  camera: Camera;
  debugRenderer: Renderer<GlTexture>;
  directionalLights: { mover: Mover; direction: MutableVector3 }[];
  directionalLightSubjects: RendererSubject[][];
  time: number;
  pointLights: { mover: Mover; position: MutableVector3 }[];
  pointLightSubjects: RendererSubject[][];
  projectionMatrix: Matrix4;
  rendererMemo: Memo<boolean[], ForwardLightingRenderer>;
  setup: ApplicationSetup<typeof configuration>;
  target: GlTarget;
};

const getOptions = (tweak: ApplicationSetup<typeof configuration>) => [
  tweak.lightAmbient,
  tweak.lightDiffuse,
  tweak.lightSpecular,
  tweak.useHeightMap,
  tweak.useNormalMap,
];

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration
> = {
  async create(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(screen.context);
    const target = new GlTarget(gl, screen.getSize());

    // Load models
    const cubeMesh = await loadMeshFromJson("model/cube/mesh.json");
    const cubeModel = createModel(gl, cubeMesh);
    const groundMesh = await loadMeshFromJson("model/ground/mesh.json");
    const groundModel = createModel(gl, groundMesh);
    const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.2, y: 0.2, z: 0.2 },
      ]),
    });
    const lightModel = createModel(gl, lightMesh);

    const directionalLights = range(3).map((i) => ({
      direction: Vector3.fromZero(),
      mover: createCircleMover(i),
    }));
    const directionalLightSubjects = range(directionalLights.length).map<
      RendererSubject[]
    >(() => []);

    const pointLights = range(3).map((i) => ({
      mover: createOrbitMover(i, 2, 2, 1),
      position: Vector3.fromZero(),
    }));
    const pointLightSubjects = range(directionalLights.length).map<
      RendererSubject[]
    >(() => []);

    // Create state
    return {
      camera: createOrbitCamera(
        {
          getRotate: () => input.fetchMove(Pointer.Grab),
          getMove: () => input.fetchMove(Pointer.Drag),
          getZoom: () => input.fetchZoom(),
        },
        { x: 0, y: 0, z: -5 },
        Vector2.zero
      ),
      debugRenderer: new DebugTextureRenderer(runtime, target, {
        encoding: DebugTextureEncoding.Monochrome,
        channel: DebugTextureChannel.Red,
        zNear: 0.1,
        zFar: 100,
      }),
      directionalLights,
      directionalLightSubjects,
      pointLights,
      pointLightSubjects,
      projectionMatrix: Matrix4.identity,
      rendererMemo: memoize(createBooleansIndexer(5), (flags) => {
        const renderer = createForwardLightingRenderer(runtime, target, {
          maxDirectionalLights: 3,
          maxPointLights: 3,
          lightModel: ForwardLightingLightModel.Phong,
          lightModelPhongNoAmbient: !flags[0],
          lightModelPhongNoDiffuse: !flags[1],
          lightModelPhongNoSpecular: !flags[2],
          noHeightMap: !flags[3],
          noNormalMap: !flags[4],
        });

        renderer.register({ model: cubeModel });

        const groundSubject = renderer.register({ model: groundModel });

        groundSubject.transform.translate({ x: 0, y: -1.5, z: 0 });

        for (const subjects of [
          ...directionalLightSubjects, // FIXME: only .slice(0, tweak.nbDirectionalLights) lights should be registered
          ...pointLightSubjects, // FIXME: only .slice(0, tweak.nbPointLights) lights should be registered
        ]) {
          subjects.push(
            renderer.register({ model: lightModel, noShadow: true })
          );
        }

        return renderer;
      }),
      setup: {} as any,
      target,
      time: 0,
    };
  },

  async change(state, setup) {
    state.setup = setup;
  },

  render(state) {
    const {
      camera,
      debugRenderer,
      directionalLights,
      pointLights,
      projectionMatrix,
      rendererMemo,
      setup,
      target,
    } = state;

    // Clear screen
    target.clear(0);

    // Forward pass
    const sceneRenderer = rendererMemo.get(getOptions(setup));
    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
      directionalLights: directionalLights
        .slice(0, setup.nbDirectionalLights)
        .map(({ direction }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          direction,
          shadow: true,
        })),
      pointLights: pointLights
        .slice(0, setup.nbPointLights)
        .map(({ position }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          position,
          radius: 5,
        })),
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
    };

    sceneRenderer.render(scene);

    // Draw texture debug
    if (setup.debugMode === 1) {
      debugRenderer.render(sceneRenderer.directionalShadowBuffers[0]);
    }
  },

  resize(state, size) {
    const { rendererMemo, setup, target } = state;

    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);

    rendererMemo.get(getOptions(setup)).resize(size);
    target.resize(size);
  },

  update(state, dt) {
    const {
      camera,
      directionalLights,
      directionalLightSubjects,
      pointLights,
      pointLightSubjects,
      setup,
      time,
    } = state;

    // Update light positions
    for (let i = 0; i < directionalLights.length; ++i) {
      const { direction, mover } = directionalLights[i];
      const subjects = directionalLightSubjects[i];

      direction.set(mover(Vector3.zero, -time * 0.0005));
      direction.normalize();
      direction.scale(10);

      for (const { transform } of subjects) {
        transform.set(Matrix4.identity);
        transform.translate(direction);
      }
    }

    for (let i = 0; i < pointLights.length; ++i) {
      const { mover, position } = pointLights[i];
      const subjects = pointLightSubjects[i];

      position.set(mover(Vector3.zero, time * 0.0005));

      for (const { transform } of subjects) {
        transform.set(Matrix4.identity);
        transform.translate(position);
      }
    }

    // Move camera
    camera.update(dt);

    state.time += setup.move ? dt : 0;
  },
};

const process = declare(
  "Forward Phong lighting",
  WebGLScreen,
  configuration,
  application
);

export { process };
