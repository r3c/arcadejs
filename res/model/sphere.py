#! python

import json
import math
import sys

try:
	if len(sys.argv) >= 4:
		radius = int(sys.argv[3])
	else:
		radius = 1

	slices = int(sys.argv[1])
	stacks = int(sys.argv[2])
except:
	sys.stderr.write("usage: " + sys.argv[0] + " <slices> <stacks> [<radius>]\n")
	sys.exit(0)

if slices < 2 or stacks < 2:
	sys.stderr.write("error: slices and stacks must be >= 2\n")
	sys.exit(1)

mesh = {
	"coords": [],
	"materialName": "default",
	"normals": [],
	"points": [],
	"triangles": []
}

# Write vertices - Top
mesh["coords"].append({"u": 0.5, "v": 0})
mesh["normals"].append({"x": 0, "y": 1, "z": 0})
mesh["points"].append({"x": 0, "y": radius, "z": 0})

# Write vertices - Middle
for i in range(0, stacks - 1):
	a = (i + 1) * math.pi / stacks

	for j in range(0, slices + 1):
		b = j * math.pi * 2 / slices

		x = math.cos(b) * math.sin(a)
		y = math.cos(a)
		z = math.sin(b) * math.sin(a)

		mesh["coords"].append({"u": float(j) / slices, "v": float(i + 1) / stacks})
		mesh["normals"].append({"x": x, "y": y, "z": z})
		mesh["points"].append({"x": x * radius, "y": y * radius, "z": z * radius})

# Write vertices - Bottom
mesh["coords"].append({"u": 0.5, "v": 1})
mesh["normals"].append({"x": 0, "y": -1, "z": 0})
mesh["points"].append({"x": 0, "y": -radius, "z": 0})

# Write faces - Top triangles
fixed = 0
shift = 1

for i in range(0, slices):
	mesh["triangles"].append([shift + i + 1, shift + i, fixed])

# Write faces - Quad strips
for i in range(0, stacks - 2):
	for j in range(0, slices):
		shift = 1 + i * (slices + 1)

		mesh["triangles"].append([shift + j, shift + j + 1, shift + j + slices + 1])
		mesh["triangles"].append([shift + j + slices + 1, shift + j + 1, shift + j + slices + 2])

# Write faces - Bottom triangles
fixed = 1 + (stacks - 1) * (slices + 1)
shift = 1 + (stacks - 2) * (slices + 1)

for i in range(0, slices):
	mesh["triangles"].append([fixed, shift + i, shift + i + 1])

# Write as JSON
json.dump({
	"materials": {
		"default": {
			"ambientMap": "sphere-ambient.png",
			"heightMap": "sphere-height.png",
			"normalMap": "sphere-normal.png",
			"reflectionMap": "sphere-reflection.png",
			"shininess": 100
		}
	},
	"meshes": [
		mesh
	]
}, sys.stdout, indent = True, sort_keys = True)
