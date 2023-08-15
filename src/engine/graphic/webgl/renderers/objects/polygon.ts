import { GlAttribute } from "../../resource";

type GlPolygon = {
  coordinate: GlAttribute | undefined;
  normal: GlAttribute | undefined;
  position: GlAttribute;
  tangent: GlAttribute | undefined;
  tint: GlAttribute | undefined;
};

const polygonExtractor: (
  polygon: GlPolygon
) => Iterable<GlAttribute | undefined> = (polygon) => [
  polygon.coordinate,
  polygon.normal,
  polygon.position,
  polygon.tangent,
  polygon.tint,
];

export { type GlPolygon, polygonExtractor };
