import * as application from "./engine/application";
import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_rasterize";
import * as s04 from "./scene/s04_webgl";
import * as s05 from "./scene/s05_lightning";

application.initialize([
	application.prepare("s01: perspective", s01.scenario),
	application.prepare("s02: transform", s02.scenario),
	application.prepare("s03: rasterize", s03.scenario),
	application.prepare("s04: webgl", s04.scenario),
	application.prepare("s05: lightning", s05.scenario)
]);
