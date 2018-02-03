import * as application from "./engine/application";
import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_colorize";
import * as s04 from "./scene/s04_texturize";
import * as s05 from "./scene/s05_webgl";
import * as s06 from "./scene/s06_lightning";

application.initialize([
	application.prepare("s01: perspective", s01.scenario),
	application.prepare("s02: transform", s02.scenario),
	application.prepare("s03: colorize", s03.scenario),
	application.prepare("s04: texturize", s04.scenario),
	application.prepare("s05: webgl", s05.scenario),
	application.prepare("s06: lightning", s06.scenario)
]);
