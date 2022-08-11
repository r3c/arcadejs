import "./style/style.css";
import { run } from "./engine/application";
import { process as blank } from "./scene/blank/main";
import { process as software } from "./scene/software/main";
import { process as hardware } from "./scene/hardware/main";
import { process as forwardPhong } from "./scene/forward-phong/main";
import { process as forwardPbr } from "./scene/forward-pbr/main";
import { process as directionalShadow } from "./scene/directional-shadow/main";
import { process as deferredLighting } from "./scene/deferred-lighting/main";
import { process as deferredShading } from "./scene/deferred-shading/main";
import { process as mpm } from "./scene/mpm/main";

run([
  blank,
  software,
  hardware,
  forwardPhong,
  forwardPbr,
  directionalShadow,
  deferredLighting,
  deferredShading,
  mpm,
]);
