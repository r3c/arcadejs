import * as application from "./engine/application";
import * as s00 from "./scene/s00_blank";
import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_rasterize";
import * as s04 from "./scene/s04_webgl";
import * as s05 from "./scene/s05_lightning";

application.initialize([
	application.declare("s00: blank", s00.scenario),
	application.declare("s01: perspective", s01.scenario),
	application.declare("s02: transform", s02.scenario),
	application.declare("s03: rasterize", s03.scenario),
	application.declare("s04: webgl", s04.scenario),
	application.declare("s05: lightning", s05.scenario)
]);
