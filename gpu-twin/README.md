# GPU Lab — RTX 3060

Laboratório térmico 3D interativo em TypeScript, Three.js e Bun. Uma GPU configurável com simulação calculada no navegador, materiais pré-instanciados e heatmap espacial. Modelo procedural autoral inspirado visualmente na MSI GeForce RTX 3060 Ventus 2X 12G OC; arquitetura MASA.

## Executar

Requisito: Bun 1.3 ou superior e navegador moderno com WebGL/aceleração gráfica.

```sh
bun install
bun run dev
```

Abra o endereço impresso pelo Vite, normalmente http://127.0.0.1:5173.

```sh
bun run check
bun test
bun run build
bun run preview
```

O build estático fica em `dist/`. Fontes Google são opcionais; sem rede, a interface usa as fontes do sistema. A geometria não depende de modelos, imagens ou texturas externas.

## Interações

- Arraste para orbitar, role para aproximar e use o botão direito para deslocar a câmera.
- Selecione peças diretamente no 3D ou na lista de componentes.
- Separe a montagem, oculte/restaure componentes, isole uma peça e escolha vistas de câmera.
- Anime os ventiladores ou ative o giro automático. São animações visuais, não cálculos de vazão.
- Salve um PNG transparente do modelo; os painéis não fazem parte da captura.
- Escolha base/dissipador em cobre, alumínio ou híbrido; compare temperatura e massa metálica.
- Ajuste potência térmica (0–300 W), ambiente (10–45 °C), convecção h (5–150 W/m²K) e 2/4/6 heat pipes de cobre.
- Explore 300 s de aquecimento, pause, volte ao início ou avance a 1×/10×/60×. A temperatura de equilíbrio é calculada separadamente.
- Ative o heatmap: campos espaciais nas bases e perfil analítico nas aletas, com escala fixa de 20–120 °C entre ensaios. Valores fora da escala saturam a cor, não a leitura numérica.

## Como o ensaio funciona

Cada alteração confirmada inicia **outro ensaio, a partir do ambiente**. Não há troca instantânea de material durante o mesmo aquecimento. O solver roda em um Web Worker, transfere os campos sem copiar seus buffers e cancela cálculos substituídos por configurações mais recentes. A reprodução interpola amostras calculadas a cada 2 s; não depende do relógio do computador para resolver a física.

O modelo combina volumes finitos 2D em duas bases condutivas, convecção, aletas retas analíticas e um nó equivalente por heat pipe. Fonte e tubos têm temperatura uniforme no modelo; o inspetor mostra médias. PCB, memórias, carcaça e demais peças não recebem temperaturas inventadas: ficam translúcidas no modo térmico e sem leitura no inspetor.

Rotação das ventoinhas, câmera, isolamento, visibilidade e vista explodida **não alteram a física**. A ventilação é controlada exclusivamente por h, sem uma conversão fictícia de RPM.

### Exemplo reproduzível

170 W, ambiente a 25 °C, h = 80 W/(m²·K), quatro tubos; resultados do modelo reduzido, não medições da placa:

| Conjunto | Fonte no equilíbrio | Massa metálica modelada |
| --- | ---: | ---: |
| Base Cu + dissipador Al | 79,4 °C | 0,642 kg |
| Base e dissipador Cu | 77,5 °C | 1,847 kg |
| Base e dissipador Al | 83,9 °C | 0,591 kg |

O cobre melhora o espalhamento neste cenário, mas sua maior densidade aumenta a massa. A meta de 85 °C é uma escolha didática, **não o limite oficial da GPU**.

Cada heat pipe usa R = 0,18 K/W, mais contatos de 0,02 K/W em cada lado. Acima da capacidade ilustrativa de 40 W por tubo aparece um aviso: o solver continua linear e **não modela secagem ou limites reais**. Veja [método, parâmetros e limitações](solver.md).

## Arquitetura MASA

```text
src/
├── domain_models/gpu-study.ts             # peças, geometria física, materiais e contratos
├── engines/
│   ├── thermal-simulation.ts              # volumes finitos, equilíbrio e transiente
│   └── thermal-playback.ts                # amostragem e reprodução puras
├── integrations/
│   ├── thermal-simulator.ts              # ciclo de vida e mensagens do Web Worker
│   └── graphics/
│       ├── gpu-assembly.ts                # geometria e materiais Three.js
│       ├── thermal-surfaces.ts            # campos, texturas e shaders do heatmap
│       └── gpu-viewport.ts                # câmera, seleção, render e captura
├── services/
│   ├── gpu-study.ts                       # orquestração, estado e ensaios
│   └── thermal-calculation.ts             # caso de uso executado no worker
├── delivery/
│   ├── gpu-study-page.ts                  # interface e eventos do navegador
│   ├── thermal-solver-worker.ts           # entrada/saída de mensagens do worker
│   └── gpu-study.css                      # apresentação responsiva
├── start-thermal-solver.ts                # composition root do worker
└── start-gpu-study.ts                     # composition root da página
```

`domain_models` não importa módulos. `engines` importa somente domínio e não faz I/O. `integrations` adapta o navegador e Three.js sem resolver física. `services` orquestra adapters e engines; `delivery` chama services sem acessar adapters/engines diretamente. Os dois composition roots montam as dependências. Solver e montagem usam `COOLING_GEOMETRY` como fonte comum de dimensões e trajetos. O antigo contrato de importação JSON foi removido.

## Referências e limites do modelo

- [MSI: ficha técnica oficial, fotografias e dimensões](https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-3060-VENTUS-2X-12G-OC.pdf).
- [ASUS Dual RTX 3060 V2: referência alternativa dual-fan](https://www.asus.com/us/motherboards-components/graphics-cards/dual/dual-rtx3060-12g-v2/techspec/).
- [Hydro: propriedades da liga 6063](https://www.hydro.com/globalassets/01-products--services/extruded-profiles/americas/ena-resources/alloy-data-sheets/hydro_2026_data_sheet_6063-rev-062026.pdf).
- [Copper Development Association: C11000](https://alloys.copper.org/alloy/C11000).
- [MIT: transferência de calor em aletas](https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node128.html).

A referência MSI informa 235 × 124 × 42 mm, dois ventiladores, 12 GB GDDR6, uma alimentação de 8 pinos e três DisplayPort + uma HDMI. **170 W são a potência nominal da placa inteira**, não uma potência medida somente no chip.

O envelope externo orienta as proporções; posições internas, trajetos e quantidade de heat pipes, aletas, materiais, encapsulamentos e detalhes do PCB são aproximações didáticas. A pasta térmica mede 0,1 mm no modelo. As propriedades são típicas e os contatos, a fonte equivalente e os tubos não foram calibrados. Não é CAD de fabricação, CFD, uma digitalização, uma previsão certificada da placa real nem análise de segurança de hardware.

Para a atividade acadêmica, o visualizador complementa, mas não substitui automaticamente, as ferramentas declaradas obrigatórias no enunciado: Energy2D, FreeCAD e Colab. Relatório, desenho cotado, análise química/mecânica/ambiental e vídeo são entregas separadas. Declare o uso de IA conforme as regras da disciplina.

## Verificação

`bun test` cobre ausência de carga, balanço energético, linearidade da potência, deslocamento do ambiente, hotspot espacial e simetria, materiais, ventilação, quantidade/capacidade dos tubos, convergência numérica e limites da linha do tempo. Na configuração padrão, o refinamento de 41 × 25 / 15 × 15 para 81 × 49 / 29 × 29 células alterou a temperatura estacionária da fonte em cerca de 0,286 °C; reduzir Δt de 0,5 para 0,25 s alterou a fonte aos 20 s em cerca de 0,033 °C. Isso verifica a implementação numérica, não valida o hardware comercial.
