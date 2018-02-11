import * as application from "./engine/application";
import * as s00 from "./scene/s00_blank";
import * as s01 from "./scene/s01_projection";
import * as s02 from "./scene/s02_rotation";
import * as s03 from "./scene/s03_composition";
import * as s04 from "./scene/s04_rasterization";
import * as s05 from "./scene/s05_webgl";
import * as s06 from "./scene/s06_lightning";
import * as s07 from "./scene/s07_shadow";

application.initialize([
	application.declare("s00: blank", s00.scenario),
	application.declare("s01: projection", s01.scenario),
	application.declare("s02: rotation", s02.scenario),
	application.declare("s03: composition", s03.scenario),
	application.declare("s04: rasterization", s04.scenario),
	application.declare("s05: webgl", s05.scenario),
	application.declare("s06: lightning", s06.scenario),
	application.declare("s07: shadow", s07.scenario)
]);
