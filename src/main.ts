import "./style/style.css";
import { initialize } from "./engine/application";
import { process as blank } from "./scene/blank";
import { process as software } from "./scene/software";
import { process as webgl } from "./scene/webgl";
import { process as forwardPhong } from "./scene/forward-phong";
import { process as forwardPbr } from "./scene/forward-pbr";
import { process as directionalShadow } from "./scene/directional-shadow";
import { process as deferredLighting } from "./scene/deferred-lighting";
import { process as deferredShading } from "./scene/deferred-shading";

initialize([
  blank,
  software,
  webgl,
  forwardPhong,
  forwardPbr,
  directionalShadow,
  deferredLighting,
  deferredShading,
]);
