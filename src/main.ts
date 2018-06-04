import "./style/style.css";
import { run } from "./engine/application";
import { process as blank } from "./scene/blank/main";
import { process as projection } from "./scene/projection/main";
import { process as rotation } from "./scene/rotation/main";
import { process as composition } from "./scene/composition/main";
import { process as software } from "./scene/software/main";
import { process as hardware } from "./scene/hardware/main";
import { process as forwardPhong } from "./scene/forward-phong/main";
import { process as forwardPbr } from "./scene/forward-pbr/main";
import { process as deferred } from "./scene/deferred/main";
import { process as venus } from "./scene/venus/main";
import { process as voxel } from "./scene/voxel/main";

run([
  blank,
  projection,
  rotation,
  composition,
  software,
  hardware,
  forwardPhong,
  forwardPbr,
  deferred,
  venus,
  voxel,
]);
