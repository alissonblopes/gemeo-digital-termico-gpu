"""Package the actual solver/config and execute the resulting self-contained notebook."""
import ast
import json
import os
from pathlib import Path

import nbformat
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / "simulation" / "thermal_solver.py"
source = source_path.read_text(encoding="utf-8")
tree = ast.parse(source)
main_guard = next(node for node in tree.body if isinstance(node, ast.If) and isinstance(node.test, ast.Compare) and isinstance(node.test.left, ast.Name) and node.test.left.id == "__name__")
embedded = "\n".join(source.splitlines()[:main_guard.lineno - 1])
config = (ROOT / "parameters.json").read_text(encoding="utf-8")
nb = nbformat.v4.new_notebook()
nb.metadata.update({"kernelspec": {"display_name": "Python3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3.12"}, "colab": {"name": "gpu_thermal_study.ipynb", "provenance": []}, "study_execution": {"environment": "Local Python3.12; not authenticated Google runtime", "author": "Nicolas Melo", "AI_assistance": "Elaboracao assistida por IA, incluindo codigo, calculos e texto; exige revisao do autor."}})
nb.cells = [
    nbformat.v4.new_markdown_cell("# Gêmeo digital térmico — dissipador de GPU\n\n**Autor:** Nicolas Melo · CEUB · Fundamentos de Engenharia.\n\nGeometria autoral180×90×29mm,20aletas, alumínio6063-T6 e cobreC11000. Fonte equivalente170W; **não representa medição nem validação de uma RTX3060**. A ficha MSI informa170W da placa inteira. O limite85°C é uma meta adotada.\n\n**Execução:** os resultados gravados foram produzidos localmente em Python3.12. O notebook é autocontido e compatível com Google Colab; abrir no Colab não comprova execução no runtime Google. Para essa evidência, entre na sua conta e use Ambiente de execução → Executar tudo.\n\n**Declaração de IA:** elaboração assistida por inteligência artificial para organizar texto, programar e conferir cálculos; o autor deve revisar e compreender os resultados antes da entrega."),
    nbformat.v4.new_markdown_cell("## 1. Dependências\nInstala somente bibliotecas ausentes. No Colab, CoolProp pode precisar de instalação. Não exige Drive, repositório ou arquivos externos. A reprodução local de referência usa requirements.txt com versões fixadas."),
    nbformat.v4.new_code_cell("import importlib.util, subprocess, sys\npackages = {'numpy':'numpy', 'scipy':'scipy', 'matplotlib':'matplotlib', 'CoolProp':'CoolProp'}\nmissing = [distribution for module, distribution in packages.items() if importlib.util.find_spec(module) is None]\nif missing:\n    subprocess.check_call([sys.executable, '-m', 'pip', 'install', *missing])\nprint('Python:', sys.version.split()[0])"),
    nbformat.v4.new_markdown_cell("## 2. Parâmetros e hipóteses\nValores SI no cálculo; dimensões do CAD em mm convertidas explicitamente. h80W/(m²K), resistência interna0,1K/W, contato e capacidade da fonte são **hipóteses não calibradas**. Fundo da base adiabático; convecção prescrita no topo livre, bordas e aletas. Sem radiação, heat pipes, memória/VRM ou CFD. Furos do CAD omitidos na malha. Aletas com eficiência analítica; massa integral concentrada na base local no transiente, uma aproximação de armazenamento. Cobre isotérmico, sem resolver espalhamento interno em3D."),
    nbformat.v4.new_code_cell("import json\nparameters = json.loads(" + repr(config) + ")\nprint(json.dumps(parameters['thermal'], ensure_ascii=False, indent=2))"),
    nbformat.v4.new_markdown_cell("## 3. Método\nBalanço conservativo por volumes finitos no plano da base. Cada ligação conduz G(Ti−Tj); cada fronteira perde hAef(T−T∞). Para cada aleta, η=tanh(mLc)/(mLc), m²≈2h/(kt), Lc=H+t/2. Área de contato de cobre obtida por sobreposição exata de células. Kθ=b no equilíbrio; (C/Δt+K)θⁿ⁺¹=b+Cθⁿ/Δt no transiente.\n\nA média exportada do alumínio inclui perfil analítico nas aletas; o mapa espacial representa somente a base. Estabilidade do método implícito não equivale a precisão; comparam-se malhas e passos."),
    nbformat.v4.new_code_cell(embedded),
    nbformat.v4.new_markdown_cell("## 4. Executar estudo e verificar balanço\nExecuta3malhas,3passos de tempo,40cenários e consulta propriedades do ar com CoolProp. A velocidade2m/s é somente contexto para Reynolds; **não calcula nem valida h80**."),
    nbformat.v4.new_code_cell("output_root = Path('gpu_thermal_outputs')\nsummary = run_study(parameters, output_root)\nfor key in ['equilibrium','transient','mesh_selected_vs_finest_source_difference_K','meets_adopted_85C_goal','air_CoolProp']:\n    print(key, json.dumps(summary[key], ensure_ascii=False, indent=2))"),
    nbformat.v4.new_markdown_cell("## 5. Resultados gráficos\nDistribuição espacial, evolução temporal e sensibilidade às hipóteses. Uma pequena margem abaixo85°C não é garantia de segurança diante de h/contatos não medidos."),
    nbformat.v4.new_code_cell("from IPython.display import display, Image\nfor name in ['temperature_map.png','transient.png','sensitivity.png','grid_convergence.png']:\n    display(Image(filename=str(output_root/'figures'/name)))"),
    nbformat.v4.new_markdown_cell("## 6. Exportação\nOs resultados são gravados em gpu_thermal_outputs/results. JSON de reprodução para o visualizador existente, CSV de cenários e transiente e resumo com unidades. A geometria didática deste estudo difere da GPU visual atual; importar as médias **não valida** aquela geometria nem habilita trocas físicas de peças."),
    nbformat.v4.new_code_cell("import shutil\narchive_path = shutil.make_archive(str(output_root), 'zip', output_root)\nprint('Arquivo de resultados:', archive_path)\ntry:\n    from google.colab import files\nexcept ImportError:\n    print('Execução local: arquivos disponíveis na pasta acima.')\nelse:\n    files.download(archive_path)"),
    nbformat.v4.new_markdown_cell("## Fontes\n- MSI: https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-3060-VENTUS-2X-12G-OC.pdf\n- Hydro6063: https://www.hydro.com/globalassets/01-products--services/extruded-profiles/americas/ena-resources/alloy-data-sheets/hydro_2026_data_sheet_6063-rev-062026.pdf\n- CDA C11000: https://alloys.copper.org/alloy/C11000\n- MIT, aletas: https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node128.html\n- CoolProp: https://coolprop.org/coolprop/HighLevelAPI.html\n\nConsulta:18out.2026. Condutividade da pasta, h, parâmetros do encapsulamento e contatos são hipóteses identificadas, não dados dessas fichas.")
]
path = ROOT / "simulation" / "gpu_thermal_study.ipynb"
client = NotebookClient(nb, timeout=240, kernel_name="python3", resources={"metadata": {"path": "/tmp/faculdade-notebook-execution"}})
Path("/tmp/faculdade-notebook-execution").mkdir(exist_ok=True)
client.execute()
nbformat.write(nb, path)
errors = [output for cell in nb.cells if cell.cell_type == "code" for output in cell.outputs if output.output_type == "error"]
assert not errors
print(f"Executed notebook: {path}; code cells={sum(c.cell_type == 'code' for c in nb.cells)}; errors={len(errors)}")
