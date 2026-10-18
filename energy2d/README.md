# Energy2D — seção qualitativa do dissipador

`heatsink.e2d` é um arquivo nativo salvo pela ferramenta oficial **Energy2D2.9.3**, da Concord Consortium. O mesmo arquivo foi recarregado pelo decodificador original:23partes. `figures/energy2d_simulation.png` é uma captura renderizada pelo próprio `View2D`, não uma imagem térmica inventada nem uma renderização do solver Python.

## Abrir e reproduzir

Use Java21 (por exemplo, Eclipse Temurin) e o artefato oficial de grade padrão100×100:

```sh
curl -fL -o energy2d.jar https://energy.concord.org/energy2d/energy2d-applet.jar
java -cp energy2d.jar org.concord.energy2d.system.System2D
```

No Energy2D, abra `heatsink.e2d` pelo menu de arquivo e inicie a simulação. Para reproduzir exatamente o avanço e a captura deste estudo a partir da raiz da entrega:

```sh
javac -cp /caminho/energy2d.jar -d /tmp/energy2d-study energy2d/RunEnergy2D.java
java -cp /caminho/energy2d.jar:/tmp/energy2d-study RunEnergy2D "$PWD"
```

O programa requer uma sessão gráfica para o componente Swing e para a captura. Ele abre e fecha uma janela própria ao final. Usa reflexão somente para avançar um número determinado de passos no solver original e integrar o campo de potência; não altera as equações da ferramenta. O JAR não foi modificado. Para a versão500×500, a resolução, custo e resultados mudam; não confundir com a reprodução da grade100×100 entregue.

## Condições e unidades

- Seção transversal: base90×6mm;20aletas1×20mm, passo3,5mm; cobre40×3mm; fonte30×1mm. Domínio100×60mm.
- Ar inicialmente25°C; propriedades constantes indicadas em `RunEnergy2D.java`; gravidade9,8m/s²; convecção natural ligada; radiação e sol desligados; temperatura externa25°C.
- Passo0,0005s;20000passos; estado visual aos10s. **Não é equilíbrio.**
- Potência no Energy2D é volumétrica, em W/m³. O valor geométrico inicial é170/(0,18×0,03×0,001)=31.481.481,48W/m³. A integração na grade discreta gera uma correção para25.388.292W/m³; com espessura equivalente de0,18m, a soma corresponde a170,000003W. O arquivo nativo preserva essa fonte normalizada.
- `execution.json` contém resultados efetivamente observados; `transient_energy2d.csv` contém temperaturas pontuais, não médias de componentes nem medições físicas.

## Limitações essenciais

A grade padrão resolve inadequadamente a espessura de1mm das aletas; a rasterização e as aproximações da convecção podem produzir artefatos. A temperatura central da fonte não é a temperatura máxima do campo. A pequena redução abaixo25°C em algumas células é um artefato numérico, não refrigeração física. O Energy2D oficial recomenda interpretação qualitativa dos casos convectivos/radiativos.

Extrudar esta seção uniformemente por0,18m altera os volumes reais do cobre e da fonte em relação ao CAD3D. Corrigir a potência integrada **não corrige essa diferença geométrica**. Este estudo mostra qualitativamente a passagem de calor e não valida as temperaturas do Python ou de uma RTX3060. A convecção natural aqui também não equivale ao h forçado prescrito no estudo quantitativo.

Fonte da ferramenta e documentação: https://energy.concord.org/energy2d/ e https://energy.concord.org/energy2d/download.html . Assistência de IA declarada no relatório.
