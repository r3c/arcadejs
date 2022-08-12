import "./style/style.css";
import * as application from "./engine/application";
import * as s00 from "./scene/s00-blank";
import * as s01 from "./scene/s01-software";
import * as s02 from "./scene/s02-webgl";
import * as s03 from "./scene/s03-forward-phong";
import * as s04 from "./scene/s04-forward-pbr";
import * as s05 from "./scene/s05-directional-shadow";
import * as s06 from "./scene/s06-deferred-shading";
import * as s07 from "./scene/s07-deferred-lighting";

application.initialize({
  "Blank screen": s00.process,
  "Software rendering": s01.process,
  "Basic WebGL rendering": s02.process,
  "Forward Phong lighting": s03.process,
  "Forward PBR lighting": s04.process,
  "Directional shadow": s05.process,
  "Deferred shading": s06.process,
  "Deferred lighting": s07.process,
});
