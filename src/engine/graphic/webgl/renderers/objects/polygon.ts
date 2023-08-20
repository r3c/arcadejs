import { GlShaderAttribute } from "../../shader";

type GlPolygon = {
  coordinate: GlShaderAttribute | undefined;
  normal: GlShaderAttribute | undefined;
  position: GlShaderAttribute;
  tangent: GlShaderAttribute | undefined;
  tint: GlShaderAttribute | undefined;
};

const polygonExtractor: (
  polygon: GlPolygon
) => Iterable<GlShaderAttribute | undefined> = (polygon) => [
  polygon.coordinate,
  polygon.normal,
  polygon.position,
  polygon.tangent,
  polygon.tint,
];

export { type GlPolygon, polygonExtractor };
