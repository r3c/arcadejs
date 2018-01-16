import * as application from "./engine/application";
import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_colorize";
import * as s04 from "./scene/s04_texturize";
import * as s05 from "./scene/s05_webgl";
import * as s06 from "./scene/s06_lightning";

application.setup([
	s01.scene,
	s02.scene,
	s03.scene,
	s04.scene,
	s05.scene,
	s06.scene
]);
