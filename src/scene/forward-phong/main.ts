import {
  type Application,
  ApplicationConfigurator,
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
import { GlRuntime, GlTarget, createRuntime } from "../../engine/graphic/webgl";
import { Mover, createCircleMover, createOrbitMover } from "../move";
import { createModel, GlModel } from "../../engine/graphic/webgl/model";
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
  debugMode: boolean;
  debugRenderer: Renderer<GlTexture>;
  directionalLights: { mover: Mover; direction: MutableVector3 }[];
  directionalLightSubjects: RendererSubject[];
  models: {
    cube: GlModel;
    ground: GlModel;
    light: GlModel;
  };
  move: boolean;
  pointLights: { mover: Mover; position: MutableVector3 }[];
  pointLightSubjects: RendererSubject[];
  projectionMatrix: Matrix4;
  renderer: ForwardLightingRenderer | undefined;
  runtime: GlRuntime;
  target: GlTarget;
  time: number;
};

const application: Application<
  WebGLScreen,
  ApplicationState,
  typeof configuration extends ApplicationConfigurator<infer T> ? T : never
> = {
  async create(screen) {
    const gl = screen.context;
    const input = new Input(screen.canvas);
    const runtime = createRuntime(screen.context);
    const target = new GlTarget(gl, screen.getSize());

    // Load models
    const cubeMesh = await loadMeshFromJson("model/cube/mesh.json");
    const groundMesh = await loadMeshFromJson("model/ground/mesh.json");
    const lightMesh = await loadMeshFromJson("model/sphere/mesh.json", {
      transform: Matrix4.fromSource(Matrix4.identity, [
        "scale",
        { x: 0.2, y: 0.2, z: 0.2 },
      ]),
    });

    const directionalLights = range(3).map((i) => ({
      direction: Vector3.fromZero(),
      mover: createCircleMover(i),
    }));

    const pointLights = range(3).map((i) => ({
      mover: createOrbitMover(i, 2, 2, 1),
      position: Vector3.fromZero(),
    }));

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
      debugMode: false,
      debugRenderer: new DebugTextureRenderer(runtime, target, {
        encoding: DebugTextureEncoding.Monochrome,
        channel: DebugTextureChannel.Red,
        zNear: 0.1,
        zFar: 100,
      }),
      directionalLights,
      directionalLightSubjects: [],
      models: {
        cube: createModel(gl, cubeMesh),
        ground: createModel(gl, groundMesh),
        light: createModel(gl, lightMesh),
      },
      move: false,
      pointLights,
      pointLightSubjects: [],
      projectionMatrix: Matrix4.identity,
      renderer: undefined,
      runtime,
      target,
      time: 0,
    };
  },

  async change(state, configuration) {
    const { models, runtime, target } = state;

    state.renderer?.dispose();

    const renderer = createForwardLightingRenderer(runtime, target, {
      maxDirectionalLights: 3,
      maxPointLights: 3,
      lightModel: ForwardLightingLightModel.Phong,
      lightModelPhongNoAmbient: !configuration.lightAmbient,
      lightModelPhongNoDiffuse: !configuration.lightDiffuse,
      lightModelPhongNoSpecular: !configuration.lightSpecular,
      noHeightMap: !configuration.useHeightMap,
      noNormalMap: !configuration.useNormalMap,
    });

    renderer.register({ model: models.cube });

    const groundSubject = renderer.register({ model: models.ground });

    groundSubject.transform.translate({ x: 0, y: -1.5, z: 0 });

    const directionalLightSubjects = range(
      configuration.nbDirectionalLights
    ).map(() => renderer.register({ model: models.light, noShadow: true }));
    const pointLightSubjects = range(configuration.nbPointLights).map(() =>
      renderer.register({ model: models.light, noShadow: true })
    );

    state.debugMode = configuration.debugMode !== 0;
    state.directionalLightSubjects = directionalLightSubjects;
    state.move = configuration.move;
    state.pointLightSubjects = pointLightSubjects;
    state.renderer = renderer;
  },

  render(state) {
    const {
      camera,
      debugMode,
      debugRenderer,
      directionalLights,
      directionalLightSubjects,
      pointLights,
      pointLightSubjects,
      projectionMatrix,
      renderer,
      target,
    } = state;

    // Clear screen
    target.clear(0);

    // Forward pass
    const scene: ForwardLightingScene = {
      ambientLightColor: { x: 0.2, y: 0.2, z: 0.2 },
      directionalLights: directionalLights
        .slice(0, directionalLightSubjects.length)
        .map(({ direction }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          direction,
          shadow: true,
        })),
      pointLights: pointLights
        .slice(0, pointLightSubjects.length)
        .map(({ position }) => ({
          color: { x: 0.8, y: 0.8, z: 0.8 },
          position,
          radius: 5,
        })),
      projectionMatrix,
      viewMatrix: camera.viewMatrix,
    };

    renderer?.render(scene);

    // Draw texture debug
    if (debugMode && renderer !== undefined) {
      debugRenderer.render(renderer.directionalShadowBuffers[0]);
    }
  },

  resize(state, size) {
    const { renderer, target } = state;

    state.projectionMatrix = Matrix4.fromIdentity([
      "setFromPerspective",
      Math.PI / 4,
      size.x / size.y,
      0.1,
      100,
    ]);

    renderer?.resize(size);
    target.resize(size);
  },

  update(state, dt) {
    const {
      camera,
      directionalLights,
      directionalLightSubjects,
      move,
      pointLights,
      pointLightSubjects,
      time,
    } = state;

    // Update light positions
    for (let i = 0; i < directionalLightSubjects.length; ++i) {
      const { direction, mover } = directionalLights[i];
      const subject = directionalLightSubjects[i];

      direction.set(mover(Vector3.zero, -time * 0.0005));
      direction.normalize();
      direction.scale(10);

      subject.transform.set(Matrix4.identity);
      subject.transform.translate(direction);
    }

    for (let i = 0; i < pointLightSubjects.length; ++i) {
      const { mover, position } = pointLights[i];
      const subject = pointLightSubjects[i];

      position.set(mover(Vector3.zero, time * 0.0005));

      subject.transform.set(Matrix4.identity);
      subject.transform.translate(position);
    }

    // Move camera
    camera.update(dt);

    state.time += move ? dt : 0;
  },
};

const process = declare(
  "Forward Phong lighting",
  WebGLScreen,
  configuration,
  application
);

export { process };
