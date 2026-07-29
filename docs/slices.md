---
shaping: true
---

# Las locuras del emperador — bomba · Slices

Deriva de `Detail D` en [`shaping.md`](./shaping.md). Cada slice termina en algo que se
puede mostrar en pantalla; ninguna es una capa horizontal.

## Resumen

| # | Slice | Partes | Demo |
|---|-------|--------|------|
| V1 | Motor jugable por texto | D1.1, D1.2, D1.4, D4.1, D4.2 | "Escribo frases en un input y el juego entero funciona en una sola pantalla: turno, aciertos, vidas, rondas" |
| V2 | Dos pantallas sincronizadas | D2.2, D1.3 | "Abro dos pestañas, escribo en una y la otra cambia sola" |
| V3 | Historial completo y reconexión | D2.1, D2.3 | "Recargo a mitad de partida y vuelve exactamente igual" |
| V4 | La bomba se ve | D5.1, D5.2 | "La mecha se consume igual en las dos pantallas y explota" |
| V5 | Voz | D3.1, D3.2 | "Hablo y el juego responde sin que toque el teclado" |
| V6 | Fin de partida | D1.4, D6.1 | "Tres explosiones y sale el tablero con todo lo que dijimos" |
| V7 | Dropdown y dataset completo | D4.1, D5.3 | "Elijo la película del dropdown y juego con las 100 frases" |

---

## V1 — Motor jugable por texto

El corazón. Sin red, sin micrófono, sin Portal: un array de mensajes en memoria con la
misma forma que tendrán los del canal, y un input de texto que agrega mensajes `say`.

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| N5 | engine | `deriveGameState(mensajes, ahora)` | call | → N7, → N9 | → S3 |
| N7 | engine | `matchPhrase()` | call | → N8 | → N5 |
| N8 | engine | `normalize()` | call | — | → N7 |
| N9 | engine | `fuseDuration()` | call | — | → N5 |
| N12 | mic | `submitPhrase(texto)` | call | → array en memoria | — |
| U6 | hud | turno activo | render | — | — |
| U7 | hud | vidas | render | — | — |
| U8 | hud | marcador | render | — | — |
| U9 | board | última frase acertada | render | — | — |
| U12 | board | frases usadas | render | — | — |
| S3 | engine | `gameState` | write | — | → U6, U7, U8, U9, U12 |
| S4 | engine | `quotes` (dataset semilla) | config | — | → N7 |

**Por qué va primero:** es donde vive todo el riesgo y es lo único cubrible al 100% por
tests automáticos. Si el motor está mal, nada de lo que venga después lo salva.

**Demo:** una pantalla, un input, y una partida completa jugada a mano.

---

## V2 — Dos pantallas sincronizadas

Se reemplaza el array en memoria por el canal de Portal. El motor no cambia: sigue
recibiendo una lista de mensajes.

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| N3 | portal | `useChannel()` | observe | → N4 | → S2 |
| N15 | portal | `send()` con la `pk_` | call | → S10 | — |
| N20 | channel | mensaje `start` | write | → S10 | — |
| N21 | channel | mensaje `say` | write | → S10 | — |
| N2 | lobby | `publishStart()` | call | → N15, → P2 | — |
| U3 | lobby | botón "Empezar partida" | click | → N2 | — |
| U4 | lobby | estado de conexión | render | — | — |
| U2 | lobby | roster conectado | render | — | — |
| S2 | portal | `messages` | write | — | → N5 |

**Demo:** dos pestañas, una partida, el turno pasa de una a la otra.

---

## V3 — Historial completo y reconexión

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| N4 | portal | `drainHistory()` | call | → S2 | — |

**Por qué es su propia slice:** el backfill por defecto de Portal son 50 mensajes y una
partida los supera. Sin drenar el historial, dos pantallas que entraron en momentos
distintos derivan estados distintos — que es exactamente lo que R5 prohíbe. Es el bug
más silencioso del proyecto: no rompe nada visible hasta que la partida se hace larga.

**Demo:** recargar el navegador a mitad de partida y ver la partida intacta.

---

## V4 — La bomba se ve

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| N6 | engine | `useTicker()` | observe | → N5 | — |
| N14 | engine | `detectExplosion()` | call | → N15 | — |
| N22 | channel | mensaje `boom` | write | → S10 | — |
| U5 | bomb | mecha consumiéndose | render | — | — |
| U13 | bomb | animación de explosión | render | — | — |

**Demo:** la mecha baja al mismo ritmo en las dos pantallas y explota en las dos a la vez.

---

## V5 — Voz

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| N10 | mic | `startRecognition()` / `stopRecognition()` | call | → N11 | — |
| N11 | mic | `recognition.onresult` | observe | → N12 | → U10 |
| N13 | mic | `recognition.onend` | observe | → N10 | — |
| U10 | mic | transcripción en vivo | render | — | — |
| U11 | mic | botón de micrófono | click | → N10 | — |

**Por qué va tarde:** es la única parte que ninguna máquina puede verificar. Va después
de que todo lo demás esté cubierto por tests, para que cuando falle se sepa que el
problema es el micrófono y no el juego.

**Demo:** hablar y ver el juego responder sin tocar el teclado.

---

## V6 — Fin de partida

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| N16 | engine | `isGameOver()` | call | → P3 | — |
| U14 | scoreboard | tablero final por jugador | render | — | — |
| U15 | scoreboard | ganador y perdedor | render | — | — |
| U16 | scoreboard | "Jugar otra vez" | click | → N2 | — |

**Demo:** perder tres vidas y ver el tablero con todas las frases de la partida.

---

## V7 — Dropdown y dataset completo

| # | Component | Affordance | Control | Wires Out | Returns To |
|---|-----------|------------|---------|-----------|------------|
| U1 | lobby | dropdown de película | select | → N1 | — |
| N1 | lobby | `setSelectedMovie()` | call | → S1 | — |
| S1 | lobby | `selectedMovieId` | write | — | → N2 |

Acá entran las 100 frases reales y el tematizado visual (D5.3).

**Demo:** elegir la película del dropdown y jugar la partida completa.

---

## Fuera de alcance

- Más de dos jugadores.
- Salas con link compartible: por ahora el canal es fijo.
- D6.2, exportar el tablero como imagen — sigue marcado ⚠️ en el shaping.
- Cualquier navegador que no sea Chrome desktop.
