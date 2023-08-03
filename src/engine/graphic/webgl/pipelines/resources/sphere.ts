import { Matrix4 } from "../../../../math/matrix";

const mesh = {
  materials: new Map(),
  meshes: [
    {
      children: [],
      polygons: [
        {
          indices: new Uint32Array([
            2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 7, 6, 0, 8, 7, 0, 9, 8,
            0, 10, 9, 0, 11, 10, 0, 1, 2, 12, 12, 2, 13, 2, 3, 13, 13, 3, 14, 3,
            4, 14, 14, 4, 15, 4, 5, 15, 15, 5, 16, 5, 6, 16, 16, 6, 17, 6, 7,
            17, 17, 7, 18, 7, 8, 18, 18, 8, 19, 8, 9, 19, 19, 9, 20, 9, 10, 20,
            20, 10, 21, 10, 11, 21, 21, 11, 22, 12, 13, 23, 23, 13, 24, 13, 14,
            24, 24, 14, 25, 14, 15, 25, 25, 15, 26, 15, 16, 26, 26, 16, 27, 16,
            17, 27, 27, 17, 28, 17, 18, 28, 28, 18, 29, 18, 19, 29, 29, 19, 30,
            19, 20, 30, 30, 20, 31, 20, 21, 31, 31, 21, 32, 21, 22, 32, 32, 22,
            33, 23, 24, 34, 34, 24, 35, 24, 25, 35, 35, 25, 36, 25, 26, 36, 36,
            26, 37, 26, 27, 37, 37, 27, 38, 27, 28, 38, 38, 28, 39, 28, 29, 39,
            39, 29, 40, 29, 30, 40, 40, 30, 41, 30, 31, 41, 41, 31, 42, 31, 32,
            42, 42, 32, 43, 32, 33, 43, 43, 33, 44, 34, 35, 45, 45, 35, 46, 35,
            36, 46, 46, 36, 47, 36, 37, 47, 47, 37, 48, 37, 38, 48, 48, 38, 49,
            38, 39, 49, 49, 39, 50, 39, 40, 50, 50, 40, 51, 40, 41, 51, 51, 41,
            52, 41, 42, 52, 52, 42, 53, 42, 43, 53, 53, 43, 54, 43, 44, 54, 54,
            44, 55, 45, 46, 56, 56, 46, 57, 46, 47, 57, 57, 47, 58, 47, 48, 58,
            58, 48, 59, 48, 49, 59, 59, 49, 60, 49, 50, 60, 60, 50, 61, 50, 51,
            61, 61, 51, 62, 51, 52, 62, 62, 52, 63, 52, 53, 63, 63, 53, 64, 53,
            54, 64, 64, 54, 65, 54, 55, 65, 65, 55, 66, 56, 57, 67, 67, 57, 68,
            57, 58, 68, 68, 58, 69, 58, 59, 69, 69, 59, 70, 59, 60, 70, 70, 60,
            71, 60, 61, 71, 71, 61, 72, 61, 62, 72, 72, 62, 73, 62, 63, 73, 73,
            63, 74, 63, 64, 74, 74, 64, 75, 64, 65, 75, 75, 65, 76, 65, 66, 76,
            76, 66, 77, 67, 68, 78, 78, 68, 79, 68, 69, 79, 79, 69, 80, 69, 70,
            80, 80, 70, 81, 70, 71, 81, 81, 71, 82, 71, 72, 82, 82, 72, 83, 72,
            73, 83, 83, 73, 84, 73, 74, 84, 84, 74, 85, 74, 75, 85, 85, 75, 86,
            75, 76, 86, 86, 76, 87, 76, 77, 87, 87, 77, 88, 78, 79, 89, 89, 79,
            90, 79, 80, 90, 90, 80, 91, 80, 81, 91, 91, 81, 92, 81, 82, 92, 92,
            82, 93, 82, 83, 93, 93, 83, 94, 83, 84, 94, 94, 84, 95, 84, 85, 95,
            95, 85, 96, 85, 86, 96, 96, 86, 97, 86, 87, 97, 97, 87, 98, 87, 88,
            98, 98, 88, 99, 100, 89, 90, 100, 90, 91, 100, 91, 92, 100, 92, 93,
            100, 93, 94, 100, 94, 95, 100, 95, 96, 100, 96, 97, 100, 97, 98,
            100, 98, 99,
          ]),
          points: {
            buffer: new Float32Array([
              0, 1, 0, 0.3090169943749474, 0.9510565162951535, 0.0,
              0.24999999999999997, 0.9510565162951535, 0.1816356320013402,
              0.09549150281252629, 0.9510565162951535, 0.2938926261462365,
              -0.09549150281252625, 0.9510565162951535, 0.29389262614623657,
              -0.24999999999999994, 0.9510565162951535, 0.18163563200134025,
              -0.3090169943749474, 0.9510565162951535, 3.78436673043415e-17,
              -0.24999999999999997, 0.9510565162951535, -0.18163563200134017,
              -0.09549150281252632, 0.9510565162951535, -0.2938926261462365,
              0.09549150281252622, 0.9510565162951535, -0.29389262614623657,
              0.24999999999999994, 0.9510565162951535, -0.18163563200134028,
              0.3090169943749474, 0.9510565162951535, -7.5687334608683e-17,
              0.5877852522924731, 0.8090169943749475, 0.0, 0.4755282581475768,
              0.8090169943749475, 0.3454915028125263, 0.18163563200134025,
              0.8090169943749475, 0.5590169943749475, -0.18163563200134017,
              0.8090169943749475, 0.5590169943749475, -0.47552825814757677,
              0.8090169943749475, 0.3454915028125264, -0.5877852522924731,
              0.8090169943749475, 7.198293278059966e-17, -0.4755282581475768,
              0.8090169943749475, -0.3454915028125262, -0.1816356320013403,
              0.8090169943749475, -0.5590169943749475, 0.1816356320013401,
              0.8090169943749475, -0.5590169943749475, 0.47552825814757677,
              0.8090169943749475, -0.34549150281252644, 0.5877852522924731,
              0.8090169943749475, -1.4396586556119933e-16, 0.8090169943749475,
              0.5877852522924731, 0.0, 0.6545084971874737, 0.5877852522924731,
              0.4755282581475768, 0.25000000000000006, 0.5877852522924731,
              0.7694208842938134, -0.24999999999999994, 0.5877852522924731,
              0.7694208842938134, -0.6545084971874736, 0.5877852522924731,
              0.4755282581475769, -0.8090169943749475, 0.5877852522924731,
              9.907600726170916e-17, -0.6545084971874737, 0.5877852522924731,
              -0.4755282581475767, -0.2500000000000001, 0.5877852522924731,
              -0.7694208842938134, 0.24999999999999986, 0.5877852522924731,
              -0.7694208842938134, 0.6545084971874736, 0.5877852522924731,
              -0.475528258147577, 0.8090169943749475, 0.5877852522924731,
              -1.9815201452341832e-16, 0.9510565162951535, 0.30901699437494745,
              0.0, 0.7694208842938134, 0.30901699437494745, 0.5590169943749475,
              0.29389262614623657, 0.30901699437494745, 0.9045084971874736,
              -0.29389262614623646, 0.30901699437494745, 0.9045084971874737,
              -0.7694208842938133, 0.30901699437494745, 0.5590169943749476,
              -0.9510565162951535, 0.30901699437494745, 1.1647083184890923e-16,
              -0.7694208842938134, 0.30901699437494745, -0.5590169943749473,
              -0.2938926261462367, 0.30901699437494745, -0.9045084971874736,
              0.29389262614623635, 0.30901699437494745, -0.9045084971874737,
              0.7694208842938133, 0.30901699437494745, -0.5590169943749477,
              0.9510565162951535, 0.30901699437494745, -2.3294166369781847e-16,
              1.0, 6.123233995736766e-17, 0.0, 0.8090169943749475,
              6.123233995736766e-17, 0.5877852522924731, 0.30901699437494745,
              6.123233995736766e-17, 0.9510565162951535, -0.30901699437494734,
              6.123233995736766e-17, 0.9510565162951536, -0.8090169943749473,
              6.123233995736766e-17, 0.5877852522924732, -1.0,
              6.123233995736766e-17, 1.2246467991473532e-16,
              -0.8090169943749475, 6.123233995736766e-17, -0.587785252292473,
              -0.30901699437494756, 6.123233995736766e-17, -0.9510565162951535,
              0.30901699437494723, 6.123233995736766e-17, -0.9510565162951536,
              0.8090169943749473, 6.123233995736766e-17, -0.5877852522924734,
              1.0, 6.123233995736766e-17, -2.4492935982947064e-16,
              0.9510565162951536, -0.30901699437494734, 0.0, 0.7694208842938134,
              -0.30901699437494734, 0.5590169943749475, 0.2938926261462366,
              -0.30901699437494734, 0.9045084971874737, -0.2938926261462365,
              -0.30901699437494734, 0.9045084971874738, -0.7694208842938133,
              -0.30901699437494734, 0.5590169943749476, -0.9510565162951536,
              -0.30901699437494734, 1.1647083184890926e-16, -0.7694208842938134,
              -0.30901699437494734, -0.5590169943749473, -0.29389262614623674,
              -0.30901699437494734, -0.9045084971874737, 0.2938926261462364,
              -0.30901699437494734, -0.9045084971874738, 0.7694208842938133,
              -0.30901699437494734, -0.5590169943749477, 0.9510565162951536,
              -0.30901699437494734, -2.329416636978185e-16, 0.8090169943749475,
              -0.587785252292473, 0.0, 0.6545084971874737, -0.587785252292473,
              0.4755282581475768, 0.25000000000000006, -0.587785252292473,
              0.7694208842938134, -0.24999999999999994, -0.587785252292473,
              0.7694208842938134, -0.6545084971874736, -0.587785252292473,
              0.4755282581475769, -0.8090169943749475, -0.587785252292473,
              9.907600726170916e-17, -0.6545084971874737, -0.587785252292473,
              -0.4755282581475767, -0.2500000000000001, -0.587785252292473,
              -0.7694208842938134, 0.24999999999999986, -0.587785252292473,
              -0.7694208842938134, 0.6545084971874736, -0.587785252292473,
              -0.475528258147577, 0.8090169943749475, -0.587785252292473,
              -1.9815201452341832e-16, 0.5877852522924732, -0.8090169943749473,
              0.0, 0.4755282581475769, -0.8090169943749473, 0.3454915028125264,
              0.18163563200134028, -0.8090169943749473, 0.5590169943749476,
              -0.1816356320013402, -0.8090169943749473, 0.5590169943749476,
              -0.4755282581475768, -0.8090169943749473, 0.34549150281252644,
              -0.5877852522924732, -0.8090169943749473, 7.198293278059968e-17,
              -0.4755282581475769, -0.8090169943749473, -0.3454915028125263,
              -0.18163563200134034, -0.8090169943749473, -0.5590169943749476,
              0.18163563200134014, -0.8090169943749473, -0.5590169943749476,
              0.4755282581475768, -0.8090169943749473, -0.3454915028125265,
              0.5877852522924732, -0.8090169943749473, -1.4396586556119935e-16,
              0.3090169943749475, -0.9510565162951535, 0.0, 0.25000000000000006,
              -0.9510565162951535, 0.18163563200134028, 0.09549150281252632,
              -0.9510565162951535, 0.2938926261462366, -0.09549150281252629,
              -0.9510565162951535, 0.2938926261462367, -0.25000000000000006,
              -0.9510565162951535, 0.1816356320013403, -0.3090169943749475,
              -0.9510565162951535, 3.784366730434151e-17, -0.25000000000000006,
              -0.9510565162951535, -0.18163563200134022, -0.09549150281252636,
              -0.9510565162951535, -0.2938926261462366, 0.09549150281252625,
              -0.9510565162951535, -0.2938926261462367, 0.25000000000000006,
              -0.9510565162951535, -0.18163563200134034, 0.3090169943749475,
              -0.9510565162951535, -7.568733460868302e-17, 0, -1, 0,
            ]),
            stride: 3,
          },
        },
      ],
      transform: Matrix4.fromIdentity(),
    },
  ],
};

export { mesh };