"""Render tessellation exported by FreeCAD, not a fabricated application screenshot."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

ROOT = Path(__file__).resolve().parents[1]
meshes = json.loads((ROOT / "cad" / "render_mesh.json").read_text(encoding="utf-8"))
fig = plt.figure(figsize=(12,6), dpi=160)
for panel, exploded in [(1,False),(2,True)]:
    ax=fig.add_subplot(1,2,panel,projection="3d")
    for mesh in meshes:
        points=np.array(mesh["vertices_mm"])
        if exploded and mesh["name"]=="CopperSpreader":points[:,2]-=18
        triangles=points[np.array(mesh["triangles"])]
        color="#9daab7" if mesh["name"]=="AluminiumHeatsink" else "#bb713c"
        collection=Poly3DCollection(triangles,facecolors=color,edgecolors="#45505b",linewidths=.22,shade=True,lightsource=matplotlib.colors.LightSource(azdeg=315,altdeg=45))
        ax.add_collection3d(collection)
    ax.set(xlim=(-5,185),ylim=(-5,95),zlim=(-22,31))
    ax.set_box_aspect((190,100,53));ax.view_init(elev=27,azim=-54);ax.set_axis_off()
    ax.set_title("Vista explodida ilustrativa\n(cobre afastado18mm)" if exploded else "Conjunto montado\n180×90×29mm",fontsize=11,y=.88)
fig.suptitle("Dissipador autoral — malha exportada do arquivo FreeCAD",fontsize=13,y=.92)
fig.text(.5,.10,"Alumínio6063-T6:20aletas e base perfurada | CobreC11000:40×40×3mm\nProporções geométricas preservadas; perspectiva sem escala de desenho técnico.",ha="center",fontsize=10)
fig.subplots_adjust(left=0,right=1,bottom=.12,top=.85,wspace=-.13)
fig.savefig(ROOT/"figures/cad_isometric.png",bbox_inches="tight",facecolor="white")
plt.close(fig)
print("Rendered real FreeCAD tessellation: figures/cad_isometric.png (assembled and labelled exploded view).")
