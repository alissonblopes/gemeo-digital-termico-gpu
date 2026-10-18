"""Vector A3 drawing from the same geometry parameters as the native FreeCAD model.
First-angle orthographic layout. This is not a TechDraw-generated drawing page.
"""
import json
import math
from pathlib import Path
import pymupdf as fitz
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
g = json.loads((ROOT / "parameters.json").read_text(encoding="utf-8"))["geometry_mm"]
metrics = json.loads((ROOT / "cad" / "cad_metrics.json").read_text(encoding="utf-8"))
assert all(abs(a - b) < 1e-6 for a, b in zip(metrics["bounds_mm"], [g["base_length"], g["base_width"], 29]))
pdfmetrics.registerFont(TTFont("Drawing", str(ROOT / "assets" / "fonts" / "LiberationSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("DrawingBold", str(ROOT / "assets" / "fonts" / "LiberationSans-Bold.ttf")))
output = ROOT / "drawings" / "heatsink_drawing.pdf"
c = canvas.Canvas(str(output), pagesize=(420*mm,297*mm))
c.setTitle("Dissipador de GPU — desenho técnico cotado")
c.setAuthor("Nicolas Melo")
c.scale(mm,mm)


def text(x,y,value,size=3,bold=False):
    c.setFont("DrawingBold" if bold else "Drawing",size)
    c.drawString(x,y,str(value))


def line(x1,y1,x2,y2,width=.18,dashed=False):
    c.setLineWidth(width);c.setDash(2,1) if dashed else c.setDash()
    c.line(x1,y1,x2,y2);c.setDash()


def rect(x,y,w,h,width=.35,dashed=False):
    c.setLineWidth(width);c.setDash(2,1) if dashed else c.setDash()
    c.rect(x,y,w,h,stroke=1,fill=0);c.setDash()


def arrow(x,y,angle):
    a=math.radians(angle);length=2.2;half=.45
    ux,uy=math.cos(a),math.sin(a);vx,vy=-uy,ux
    p=c.beginPath();p.moveTo(x,y);p.lineTo(x+length*ux+half*vx,y+length*uy+half*vy);p.lineTo(x+length*ux-half*vx,y+length*uy-half*vy);p.close()
    c.drawPath(p,stroke=0,fill=1)


def dim_h(x1,x2,obj_y,dim_y,label):
    line(x1,obj_y,x1,dim_y+(-1 if dim_y<obj_y else 1));line(x2,obj_y,x2,dim_y+(-1 if dim_y<obj_y else 1))
    line(x1,dim_y,x2,dim_y);arrow(x1,dim_y,0);arrow(x2,dim_y,180)
    c.setFont("Drawing",3);c.drawCentredString((x1+x2)/2,dim_y+1.2,label)


def dim_v(y1,y2,obj_x,dim_x,label):
    line(obj_x,y1,dim_x+1,y1);line(obj_x,y2,dim_x+1,y2);line(dim_x,y1,dim_x,y2)
    arrow(dim_x,y1,90);arrow(dim_x,y2,270)
    c.saveState();c.translate(dim_x-1.2,(y1+y2)/2);c.rotate(90);c.setFont("Drawing",3);c.drawCentredString(0,0,label);c.restoreState()


rect(20,10,390,277,.5)
text(25,279,"DISSIPADOR TÉRMICO PARA GPU — ESTUDO DIDÁTICO",4.8,True)
text(25,272,"Geometria autoral: alumínio6063-T6 + base de contato em cobreC11000. Não é uma réplica da placa MSI.",3)
L,W,B,H,F,P,N=[g[k] for k in ["base_length","base_width","base_thickness","fin_height","fin_thickness","fin_pitch","fin_count"]]
margin=(W-((N-1)*P+F))/2
# Front view above the plan; right-side view is LEFT of front: first-angle.
fx,fy=155,205
rect(fx,fy+3,L,B);rect(fx,fy+3+B,L,H);rect(fx+(L-40)/2,fy,40,3)
text(fx,fy+34,"VISTA FRONTAL",3,True)
dim_h(fx,fx+L,fy+29,fy+44,"180")
dim_v(fy,fy+29,fx+L,fx+L+13,"29")
dim_v(fy+3,fy+3+B,fx,fx-9,"6")
line(fx+90,fy+1.5,fx+116,fy-7);text(fx+117,fy-8,"Cu: esp.3",2.8)
sx,sy=30,205
rect(sx,sy+3,W,B)
for i in range(int(N)):rect(sx+margin+i*P,sy+3+B,F,H)
rect(sx+25,sy,40,3)
text(sx,sy+34,"VISTA LATERAL DIREITA",3,True)
dim_h(sx,sx+W,sy+29,sy+44,"90")
dim_v(sy+3+B,sy+29,sx+W,sx+W+8,"20")
# Plan view below front, same X datum.
tx,ty=155,100
rect(tx,ty,L,W)
for i in range(int(N)):
    line(tx,ty+margin+i*P,tx+L,ty+margin+i*P,.25)
    line(tx,ty+margin+i*P+F,tx+L,ty+margin+i*P+F,.25)
rect(tx+70,ty+25,40,40,.18,True)
for x,y in g["mounting_hole_centres"]:
    c.setLineWidth(.35);c.circle(tx+x,ty+y,g["mounting_hole_diameter"]/2,stroke=1,fill=0)
    line(tx+x-2.5,ty+y,tx+x+2.5,ty+y,.15);line(tx+x,ty+y-2.5,tx+x,ty+y+2.5,.15)
text(tx,ty+95,"VISTA SUPERIOR",3,True)
# Hole ordinate dimensions at the exposed lower mounting strip.
dim_h(tx,tx+10,ty+5,ty-20,"10")
dim_h(tx+10,tx+170,ty+5,ty-20,"160 (entre centros)")
line(tx+10,ty+5,tx+25,ty-5);text(tx+26,ty-4,"4×Ø3,2 passante na base",2.8)
text(355,183,"FURAÇÃO",3,True)
text(355,177,"Origem: canto inferior",2.6);text(355,172,"esquerdo da vista superior.",2.6)
for j,(x,y) in enumerate(g["mounting_hole_centres"]):text(355,164-j*5,f"{j+1}: X{x:g}; Y{y:g}",2.8)
text(355,138,"Cu40×40×3",3,True);text(355,132,"centrado na face inferior",2.6)
text(355,126,"Origem do Cu: X70; Y25",2.6)
# Detail A: upper4mm of three neighbouring fins at5:1; break marks at bottom.
text(30,195,"DETALHE A — ALETAS (5:1)",3,True)
dx,dy=43,150
for i in range(3):
    x=dx+i*P*5
    line(x,dy,x,dy+20,.35);line(x+F*5,dy,x+F*5,dy+20,.35);line(x,dy+20,x+F*5,dy+20,.35)
    line(x-1,dy,x+1,dy+1,.25);line(x+1,dy+1,x+3,dy-1,.25);line(x+3,dy-1,x+6,dy+1,.25)
dim_h(dx,dx+5,dy+20,dy+27,"1")
dim_h(dx,dx+17.5,dy,dy-9,"3,5 (passo)")
dim_h(dx+5,dx+17.5,dy+20,dy+35,"2,5 (vão)")
text(30,132,"20aletas iguais; comprimento180; altura20.",2.8)
text(30,126,"Largura do feixe67,5; margens11,25.",2.8)
# Genuine FreeCAD model view, explicitly not a scaled technical projection.
c.drawImage(str(ROOT/"figures/cad_isometric.png"),26,35,width=112,height=78,preserveAspectRatio=True,anchor="c",mask="auto")
text(30,29,"Perspectiva do modelo FreeCAD — sem escala",2.8)
# Manufacturing / model notes, not an unearned certification.
text(155,70,"NOTAS",3,True)
text(155,64,"1. Dimensões em mm. Escala1:1 nas vistas ortográficas; detalhe A em5:1.",2.8)
text(155,59,"2. Furos a5mm das bordas longitudinais; centrosX10/170 eY5/85, sem cotas ao desenho em perspectiva.",2.8)
text(155,54,"3. Não inclui TIM, chip, ventoinhas nem heat pipes. Fixação e tolerâncias não liberadas para fabricação.",2.8)
text(155,49,"4. Convenções: ABNT NBR16752/16861/17006/17068 e projeção no1ºdiedro; consultar relatório.",2.8)
# Title block.
rect(150,12,258,31,.35);line(150,29,408,29);line(150,21,408,21)
line(310,12,310,43);line(360,12,360,43)
text(153,36,"DISSIPADOR DE GPU",3.6,True);text(153,31.5,"Al6063-T6 / CuC11000 — conjunto metálico",2.7)
text(153,24,"Autor: Nicolas Melo | CEUB | Fundamentos de Engenharia",2.8)
text(153,15,"Desenho acadêmico derivado dos parâmetros do modelo FreeCAD",2.6)
text(313,36,"ESCALA1:1",3,True);text(313,32,"Detalhe5:1; isoS/E",2.6)
text(313,24,"UNIDADE:mm",2.8);text(313,15,"MÉTODO:1ºDIEDRO",2.7)
text(363,36,"DT-GPU-001",3,True);text(363,32,"Revisão00",2.7)
text(363,24,"18/10/2026",2.8);text(363,15,"FOLHA1/1 | A3",2.8)
c.showPage();c.save()
with fitz.open(output) as doc:
    (ROOT/"drawings/heatsink_drawing.svg").write_text(doc[0].get_svg_image(text_as_path=True),encoding="utf-8")
    doc[0].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(ROOT/"figures/drawing_preview.png")
print(f"Drawing generated: {output}, A3 landscape, first angle, orthographic1:1.")
