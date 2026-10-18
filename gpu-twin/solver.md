# Solver térmico do GPU Lab

O solver já é executado no navegador por um Web Worker. A implementação pura está em `src/engines/thermal-simulation.ts`; materiais, geometria, configurações e resultados são definidos em `src/domain_models/gpu-study.ts`. Não há importação de JSON nem dependência de um servidor de cálculo.

## Escopo físico

O estudo resolve condução espacial em duas placas acopladas, convecção para ar a temperatura fixa, perfis analíticos de aletas e tubos de calor equivalentes. É um modelo reduzido educacional, **não CFD, análise 3D completa ou previsão calibrada da RTX 3060 comercial**.

Os 170 W da [ficha MSI](https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-3060-VENTUS-2X-12G-OC.pdf) são a potência nominal da placa inteira. Aqui a potência escolhida é concentrada em uma fonte equivalente de 20 × 20 mm. Não representa uma medição da potência do chip, nem garante temperaturas seguras para memórias, VRM e PCB, que não são simulados.

Cada mudança de material, potência, ambiente, h ou quantidade de tubos inicia um novo ensaio com todos os nós na temperatura ambiente. Não há continuidade física entre configurações diferentes. A linha do tempo reproduz a solução desse novo ensaio, e não dados de sensores.

## Entradas e dimensões

As dimensões físicas e os trajetos dos tubos vêm de `COOLING_GEOMETRY`, também usado pela montagem Three.js. Conversão no engine: mm × 10⁻³ → m; mm² × 10⁻⁶ → m²; mm³ × 10⁻⁹ → m³.

| Entrada | Valor / intervalo |
| --- | --- |
| Potência térmica | 0–300 W; constante durante um ensaio |
| Ambiente | 10–45 °C; reservatório de ar fixo |
| Convecção h | 5–150 W/(m²·K); uniforme e prescrita |
| Base de contato | 45 × 45 × 4 mm; centro x = −42 mm, z = 0 |
| Espalhador sob as aletas | 211 × 100 × 2 mm |
| Aletas | 49; comprimento 211 mm, altura 21 mm, espessura 0,7 mm, passo 2 mm |
| Fonte equivalente | Área 20 × 20 mm; C = 3,5 J/K; resistência interna 0,10 K/W |
| Pasta térmica | Espessura 0,1 mm; k = 3 W/(m·K); contato total 0,02 K/W |
| Contato entre as duas bases | Resistência por área r″ = 2 × 10⁻⁵ m²·K/W |
| Tubos de cobre | 2, 4 ou 6; diâmetro 6 mm; parede 0,35 mm |
| Resistência equivalente de cada tubo | 0,18 K/W, mais 0,02 K/W em cada ligação |
| Capacidade ilustrativa por tubo | 40 W; apenas sinalização de validade, sem modelo de secagem |
| Meta de temperatura | 85 °C; escolha de projeto, não especificação oficial da GPU |

A fonte, contatos, pasta e parâmetros dos tubos são **hipóteses não calibradas**. Geometria interna e espessuras são autorais. A massa exibida soma somente as partes metálicas modeladas: bases, aletas e paredes dos tubos. Exclui fluido, mecha dos tubos, PCB, carcaça, fixações e demais peças; não é a massa da placa comercial.

### Materiais

| Material | k [W/(m·K)] | ρ [kg/m³] | cₚ [J/(kg·K)] |
| --- | ---: | ---: | ---: |
| Alumínio 6063-T6 | 201 | 2700 | 900 |
| Cobre C11000 | 391 | 8910 | 385 |

Fontes: [Hydro, liga 6063](https://www.hydro.com/globalassets/01-products--services/extruded-profiles/americas/ena-resources/alloy-data-sheets/hydro_2026_data_sheet_6063-rev-062026.pdf) e [Copper Development Association, C11000](https://alloys.copper.org/alloy/C11000). O cₚ = 900 J/(kg·K) do alumínio é uma aproximação típica separada, não um valor certificado por essa ficha Hydro. Propriedades constantes, sem dependência da temperatura.

Os presets mudam o material da base e do espalhador/aletas: cobre + alumínio, tudo cobre ou tudo alumínio. Os tubos permanecem de cobre. A resistência de contato entre as bases é mantida nos três casos; não se presume uma peça monolítica.

## Discretização conservativa

A base é discretizada em 15 × 15 volumes e o espalhador em 41 × 25 volumes. Cada célula representa a temperatura média em sua espessura. Não há malha de fluido nem discretização tridimensional do chip.

Para células vizinhas na direção x:

```text
Gx = k · espessura · Δz / Δx                 [W/K]
C = ρ · cₚ · volume                         [J/K]
```

A direção z usa a expressão correspondente. Cada ligação é simétrica: o calor que sai de um nó entra no outro. Interfaces entre malhas não coincidentes usam a área exata de sobreposição dos retângulos:

```text
G_interface = A_sobreposta / (r″ + t_base/(2·k_base) + t_espalhador/(2·k_espalhador))
```

A fonte se conecta às células sob sua área de contato. A resistência total inclui encapsulamento, pasta, contato e meia espessura da base; a condutância é repartida pela fração de área de cada célula. Não se aplica a potência inteira em cada célula.

A pasta não tem capacitância própria. Sua temperatura média é estimada pelo fluxo instantâneo da interface e pelas resistências entre a base e o meio da camada, excluindo a resistência interna do encapsulamento.

### Aletas e condições de contorno

A convecção atua no topo exposto do espalhador, em seu perímetro lateral e nas aletas. Faces inferiores são adiabáticas, exceto nas interfaces internas de transferência. Faces estreitas nas extremidades das aletas são desprezadas. Não há radiação.

Para aleta fina de seção retangular, com comprimento corrigido:

```text
Lc = H + t/2
m = sqrt(2·h / (k·t))
η = tanh(m·Lc) / (m·Lc)
Q_aletas = h · η · A_aletas · (T_raiz − T_ambiente)
T(y) = T_ambiente + (T_raiz − T_ambiente) · cosh(m·(Lc−y)) / cosh(m·Lc)
```

Referência: [MIT — Heat Transfer From a Fin](https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node128.html).

Cada faixa da malha recebe a parcela de aletas que cruza sua área. O perfil em altura é quase-estacionário e unidimensional: não resolve condução lateral dentro das aletas nem escoamento entre canais. A massa térmica integral das aletas é concentrada na raiz; isso aproxima a inércia e **não é uma solução exata do transiente das aletas**. A média do dissipador é uma estimativa volumétrica das duas contribuições, usando a eficiência para a parcela das aletas. O balanço de energia é o dessa rede reduzida.

h é uma hipótese ajustável, não uma vazão ou velocidade de ventilador calculada. Animar ventoinhas não modifica h.

### Heat pipes equivalentes

Cada tubo tem um nó quase isotérmico, não uma barra maciça conduzindo apenas pelo k do cobre. A capacitância usa o volume da parede de cobre e o comprimento aproximado pela polilinha dos pontos compartilhados com a montagem; o desenho suaviza essa polilinha por uma curva.

Metade da resistência de 0,18 K/W, somada ao contato de 0,02 K/W, liga o nó à região de evaporação na base. A outra metade e seu contato ligam o nó às faixas de condensação do espalhador fora da base. Condutâncias são distribuídas por área de contato. O transporte por mudança de fase está representado apenas por essa resistência equivalente.

O fluxo de cada tubo é calculado no regime permanente. Se |Q_tubo| > 40 W, a interface avisa que o resultado está fora da capacidade ilustrativa adotada. **O solver não limita artificialmente o fluxo nem reduz a potência para esconder o excesso.** Não resolve capilaridade, orientação, fluido, partida, secagem ou ruptura da hipótese linear; os resultados nessa região não são validados.

## Solução numérica

Usando elevação de temperatura θ = T − T_ambiente:

```text
C · dθ/dt + K · θ = Q
K_ii = soma das condutâncias internas + condutância para o ar
K_ij = −G_ij
```

Euler implícito, Δt = 0,5 s:

```text
(C/Δt + K) · θ_novo = C/Δt · θ_anterior + Q
```

O solver usa gradientes conjugados com pré-condicionamento diagonal, sem matriz densa ou inversão. Diagonais e buffers de trabalho são reutilizados. O critério é `||resíduo||² ≤ max(1, ||rhs||²) × 10⁻²⁰`, com limite de 1200 iterações por solução. Falha de convergência rejeita o ensaio.

O transiente tem 300 s, com armazenamento a cada 2 s. O equilíbrio é obtido por uma solução independente de `K · θ_eq = Q`: não se presume que 300 s sejam suficientes, sobretudo com h baixo. Sem potência, todas as temperaturas permanecem no ambiente e a resistência global ΔT/Q é indefinida (`null`), não zero.

Conservação verificada em cada passo:

```text
resíduo_energia = (E_novo − E_anterior)/Δt + Q_para_o_ar − potência
```

O ensaio é rejeitado se o maior resíduo temporal ou o resíduo estacionário exceder `10⁻⁵ × max(1 W, potência)`. Esse controle testa consistência numérica; não calibra resistências e condições de contorno.

## Dados e visualização

`ThermalDataset` contém configuração, instantes, temperaturas médias, campos da base e do espalhador em buffers `Float32Array`, temperaturas individuais dos tubos, fluxo para o ar, equilíbrio e diagnósticos. As operações do solver usam `Float64Array`; o worker transfere os buffers dos campos para a página sem cópia.

O adaptador gráfico interpola os campos entre amostras e os envia em texturas com temperatura codificada em 16 bits. O shader reconstrói °C, calcula o perfil das aletas e só então aplica a escala fixa 20–120 °C. Cores saturadas não limitam os dados físicos. Superfícies térmicas são não iluminadas para evitar que luz ou seleção alterem a leitura da paleta.

Coordenadas do heatmap permanecem presas à peça quando a montagem é explodida. Somente peças modeladas recebem cores térmicas; as outras são translúcidas e não interceptam a seleção no modo térmico. O inspetor continua permitindo selecionar peças não modeladas pela lista, sem inventar uma temperatura para elas.

Os eventos do worker passam pelo service. Se o usuário altera os parâmetros durante um cálculo, o worker antigo é terminado; resultados superados não substituem o ensaio mais recente. Erros são exibidos sem resultados de substituição fictícios.

## Reprodução e verificação

Dentro de `gpu-twin/`:

```sh
bun install
bun run check
bun test
bun run build
bun run preview
```

Para calcular sem abrir a interface:

```sh
bun -e 'import { simulateThermalStudy } from "./src/engines/thermal-simulation.ts"; import { DEFAULT_THERMAL_SETTINGS } from "./src/domain_models/gpu-study.ts"; console.log(simulateThermalStudy(DEFAULT_THERMAL_SETTINGS).equilibrium);'
```

Os testes verificam carga zero, conservação de energia, aquecimento passivo, linearidade de potência, efeito do ambiente, hotspot e simetria, materiais, convecção, tubos, validade da capacidade, convergência espacial/temporal, entradas inválidas e reprodução da linha do tempo. Consulte o README para um caso comparativo reproduzível.

A validação numérica foi complementada por execução real do build no navegador: alteração de materiais, potência e tubos, trocas rápidas de configuração, heatmap, isolamento de peças, ausência de dados para memória, captura e layout móvel. Isso demonstra funcionamento da aplicação, não equivalência com uma GPU medida. As entregas FreeCAD, Energy2D, Colab e relatório da disciplina continuam independentes deste aplicativo.
