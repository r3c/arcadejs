import "./style/style.css";
import { run } from "./engine/application";
import { application as blank } from "./scene/blank/main";
import { application as software } from "./scene/software/main";
import { application as hardware } from "./scene/hardware/main";
import { application as forwardPhong } from "./scene/forward-phong/main";
import { application as forwardPbr } from "./scene/forward-pbr/main";
import { application as directionalShadow } from "./scene/directional-shadow/main";
import { application as deferredLighting } from "./scene/deferred-lighting/main";
import { application as deferredShading } from "./scene/deferred-shading/main";
import { application as voxel } from "./scene/voxel/main";

run([
  blank,
  software,
  hardware,
  forwardPhong,
  forwardPbr,
  directionalShadow,
  deferredLighting,
  deferredShading,
  voxel,
]);
