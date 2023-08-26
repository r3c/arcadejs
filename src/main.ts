import "./style/style.css";
import { run } from "./engine/application";
import { process as blank } from "./scene/blank/main";
import { process as software } from "./scene/software/main";
import { process as forwardPhong } from "./scene/forward-phong/main";
import { process as forwardPbr } from "./scene/forward-pbr/main";
import { process as deferredLighting } from "./scene/deferred-lighting/main";
import { process as deferredShading } from "./scene/deferred-shading/main";
import { process as venus } from "./scene/venus/main";
import { process as voxel } from "./scene/voxel/main";

run([
  blank,
  software,
  forwardPhong,
  forwardPbr,
  deferredLighting,
  deferredShading,
  venus,
  voxel,
]);
