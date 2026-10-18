"""Execute with FreeCAD's Python: export actual saved BRep geometry for rendering."""
import json
from pathlib import Path
import FreeCAD as App

ROOT = Path(__file__).resolve().parents[1]
doc = App.openDocument(str(ROOT / "cad" / "heatsink.FCStd"))
meshes = []
for name in ["AluminiumHeatsink", "CopperSpreader"]:
    obj = doc.getObject(name)
    vertices, triangles = obj.Shape.tessellate(0.08)
    meshes.append({"name": name, "vertices_mm": [[v.x, v.y, v.z] for v in vertices], "triangles": [list(t) for t in triangles]})
(ROOT / "cad" / "render_mesh.json").write_text(json.dumps(meshes), encoding="utf-8")
print("Exported actual FreeCAD model triangles:", {mesh["name"]: len(mesh["triangles"]) for mesh in meshes})
App.closeDocument(doc.Name)
