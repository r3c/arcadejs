#! python

import itertools
import json
import math
import sys


def sphere(cx, cy, cz, slices, stacks, radius):
    polygon = {
        "coordinates": [],
        "indices": [],
        "materialName": "default",
        "normals": [],
        "positions": []
    }

    # Write vertices - Top
    polygon["coordinates"].append({"u": 0.5, "v": 0})
    polygon["normals"].append({"x": 0, "y": 1, "z": 0})
    polygon["positions"].append({"x": cx, "y": cy + radius, "z": cz})

    # Write vertices - Middle
    for i in range(0, stacks - 1):
        a = (i + 1) * math.pi / stacks

        for j in range(0, slices + 1):
            b = j * math.pi * 2 / slices

            x = math.cos(b) * math.sin(a)
            y = math.cos(a)
            z = math.sin(b) * math.sin(a)

            polygon["coordinates"].append({
                "u": float(j) / slices,
                "v": float(i + 1) / stacks
            })
            polygon["normals"].append({"x": x, "y": y, "z": z})
            polygon["positions"].append({
                "x": cx + x * radius,
                "y": cy + y * radius,
                "z": cz + z * radius
            })

    # Write vertices - Bottom
    polygon["coordinates"].append({"u": 0.5, "v": 1})
    polygon["normals"].append({"x": 0, "y": -1, "z": 0})
    polygon["positions"].append({"x": cx, "y": cy - radius, "z": cz})

    # Write indices - Top triangles
    fixed = 0
    shift = 1

    for i in range(0, slices):
        polygon["indices"].append({
            "x": shift + i + 1,
            "y": shift + i,
            "z": fixed
        })

    # Write indices - Quad strips
    for i in range(0, stacks - 2):
        for j in range(0, slices):
            shift = 1 + i * (slices + 1)

            polygon["indices"].append({
                "x": shift + j,
                "y": shift + j + 1,
                "z": shift + j + slices + 1
            })
            polygon["indices"].append({
                "x": shift + j + slices + 1,
                "y": shift + j + 1,
                "z": shift + j + slices + 2
            })

    # Write indices - Bottom triangles
    fixed = 1 + (stacks - 1) * (slices + 1)
    shift = 1 + (stacks - 2) * (slices + 1)

    for i in range(0, slices):
        polygon["indices"].append({
            "x": fixed,
            "y": shift + i,
            "z": shift + i + 1
        })

    return polygon


try:
    if len(sys.argv) >= 4:
        radius = int(sys.argv[3])
    else:
        radius = 1

    slices = int(sys.argv[1])
    stacks = int(sys.argv[2])
except:
    sys.stderr.write("usage: " + sys.argv[0] +
                     " <slices> <stacks> [<radius>]\n")
    sys.exit(0)

if slices < 2 or stacks < 2:
    sys.stderr.write("error: slices and stacks must be >= 2\n")
    sys.exit(1)

# Write as JSON
json.dump(
    {
        "materials": {
            "default": {
                "ambientMap": "sphere-ambient.png",
                "heightMap": "sphere-height.png",
                "normalMap": "sphere-normal.png",
                "reflectionMap": "sphere-reflection.png",
                "shininess": 100
            }
        },
        "polygons": [
            sphere(x, y, z, slices, stacks, radius)
            for x, y, z in itertools.product([0], [0], [0])
        ]
    },
    sys.stdout,
    indent=True,
    sort_keys=True)
