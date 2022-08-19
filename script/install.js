#!/usr/bin/env node

"use strict";

const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadFiles(files) {

  for (const { destination, url } of files) {
    try {
      fs.accessSync(destination);

      continue;
    }
    catch {
      // Destination doesn't exist and should be downloaded
    }

    const directory = path.dirname(destination);

    try {
      fs.accessSync(directory);
    }
    catch {
      fs.mkdirSync(directory, { recursive: true });
    }

    const file = fs.createWriteStream(destination);

    https.get(url, function (response) {
      response.pipe(file);

      file.on("finish", () => {
        file.close();

        console.log(`Downloaded ${destination}`);
      });
    });
  }
}

downloadFiles([
  {
    destination: "public/model/cube/mybricks1_AO.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_AO.png"
  },
  {
    destination: "public/model/cube/mybricks1_basecolor.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_basecolor.png"
  },
  {
    destination: "public/model/cube/mybricks1_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_gloss.png"
  },
  {
    destination: "public/model/cube/mybricks1_height.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_height.png"
  },
  {
    destination: "public/model/cube/mybricks1_metallic.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_metallic.png"
  },
  {
    destination: "public/model/cube/mybricks1_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_normal.png"
  },
  {
    destination: "public/model/cube/mybricks1_roughness.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_roughness.png"
  },
  {
    destination: "public/model/damaged-helmet/DamagedHelmet.bin",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/DamagedHelmet.bin"
  },
  {
    destination: "public/model/damaged-helmet/DamagedHelmet.gltf",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf"
  },
  {
    destination: "public/model/damaged-helmet/Default_albedo.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/Default_albedo.jpg"
  },
  {
    destination: "public/model/damaged-helmet/Default_AO.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/Default_AO.jpg"
  },
  {
    destination: "public/model/damaged-helmet/Default_emissive.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/Default_emissive.jpg"
  },
  {
    destination: "public/model/damaged-helmet/Default_metalRoughness.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/Default_metalRoughness.jpg"
  },
  {
    destination: "public/model/damaged-helmet/Default_normal.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/fb85803eaeb9208d1b6f04e3f3769ebc8aa706f6/2.0/DamagedHelmet/glTF/Default_normal.jpg"
  },
  {
	destination: "public/model/ibl/ibl_brdf_lut.webp",
	url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/ibl/ibl_brdf_lut.webp"
  },
  {
    destination: "public/model/papermill/diffuse_right_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/diffuse/diffuse_right_0.jpg"
  },
  {
    destination: "public/model/papermill/diffuse_left_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/diffuse/diffuse_left_0.jpg"
  },
  {
    destination: "public/model/papermill/diffuse_top_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/diffuse/diffuse_top_0.jpg"
  },
  {
    destination: "public/model/papermill/diffuse_bottom_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/diffuse/diffuse_bottom_0.jpg"
  },
  {
    destination: "public/model/papermill/diffuse_front_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/diffuse/diffuse_front_0.jpg"
  },
  {
    destination: "public/model/papermill/diffuse_back_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/diffuse/diffuse_back_0.jpg"
  },
  {
    destination: "public/model/papermill/specular_right_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/specular/specular_right_0.jpg"
  },
  {
    destination: "public/model/papermill/specular_left_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/specular/specular_left_0.jpg"
  },
  {
    destination: "public/model/papermill/specular_top_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/specular/specular_top_0.jpg"
  },
  {
    destination: "public/model/papermill/specular_bottom_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/specular/specular_bottom_0.jpg"
  },
  {
    destination: "public/model/papermill/specular_front_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/specular/specular_front_0.jpg"
  },
  {
    destination: "public/model/papermill/specular_back_0.jpg",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/4eace30f795fa77f6e059e3b31aa640c08a82133/papermill/specular/specular_back_0.jpg"
  },
  {
    destination: "public/model/select/select.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/select/select.png"
  },
  {
    destination: "public/model/voxel/level_0_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_0_albedo.png"
  },
  {
    destination: "public/model/voxel/level_0_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_0_gloss.png"
  },
  {
    destination: "public/model/voxel/level_0_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_0_normal.png"
  },
  {
    destination: "public/model/voxel/level_1_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_1_albedo.png"
  },
  {
    destination: "public/model/voxel/level_1_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_1_gloss.png"
  },
  {
    destination: "public/model/voxel/level_1_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_1_normal.png"
  },
  {
    destination: "public/model/voxel/level_2_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_2_albedo.png"
  },
  {
    destination: "public/model/voxel/level_2_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_2_gloss.png"
  },
  {
    destination: "public/model/voxel/level_2_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_2_normal.png"
  },
  {
    destination: "public/model/voxel/level_3_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_3_albedo.png"
  },
  {
    destination: "public/model/voxel/level_3_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_3_gloss.png"
  },
  {
    destination: "public/model/voxel/level_3_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_3_normal.png"
  },
  {
    destination: "public/model/voxel/level_4_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_4_albedo.png"
  },
  {
    destination: "public/model/voxel/level_4_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_4_gloss.png"
  },
  {
    destination: "public/model/voxel/level_4_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_4_normal.png"
  },
  {
    destination: "public/model/voxel/level_5_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_5_albedo.png"
  },
  {
    destination: "public/model/voxel/level_5_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_5_gloss.png"
  },
  {
    destination: "public/model/voxel/level_5_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_5_normal.png"
  },
  {
    destination: "public/model/voxel/level_6_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_6_albedo.png"
  },
  {
    destination: "public/model/voxel/level_6_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_6_gloss.png"
  },
  {
    destination: "public/model/voxel/level_6_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_6_normal.png"
  },
  {
    destination: "public/model/voxel/level_7_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_7_albedo.png"
  },
  {
    destination: "public/model/voxel/level_7_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_7_gloss.png"
  },
  {
    destination: "public/model/voxel/level_7_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_7_normal.png"
  },
  {
    destination: "public/model/voxel/level_8_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_8_albedo.png"
  },
  {
    destination: "public/model/voxel/level_8_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_8_gloss.png"
  },
  {
    destination: "public/model/voxel/level_8_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_8_normal.png"
  },
  {
    destination: "public/model/voxel/level_9_albedo.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_9_albedo.png"
  },
  {
    destination: "public/model/voxel/level_9_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_9_gloss.png"
  },
  {
    destination: "public/model/voxel/level_9_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/voxel/level_9_normal.png"
  }
]);
