---
shaping: true
---

# Las locuras del emperador — bomba · Frame

## Source

> quiero crear algo con Portal

> quiero que sea algo highly visual y que se pueda compartir por redes sociales y que
> no sea tan largo de desarrollar

> quiero poder conectarme en una sesion con un amigo y decir frases de pelicula y que
> salga abajo la pelicula a la cual hace referncia y si se puede una imagen o algo asi.
> es es posible com portal

> quiero que cada uno en su turno diga uan frase de la pelicula. al inciio una persona
> elige de un dropdown el listado de pelicula que quieren jugar. y comienzan a decir en
> su turno frases de esa pelicula. y le cuentan un punto si dice la frase correcta.
> ademas hay una bomba arriba que es el timer. si demora mucho tiempo en decir uan frase
> es que esta mas cerca que la bomba le explote en su turno y pierde. gana a quien no le
> explota la bomba

> solo una pelicula tiene el dropdown. seran frases de las locuras del emperador y
> pasare al menos 100 frases

> en el dorpdown ira solo una pelicula de momento

---

## Problem

Portal es infraestructura realtime, pero nada de lo que se construye con ella se **ve**
realtime. Un chat, un contador de presencia o un badge de no leídos son indistinguibles
de una app normal en una captura o en un video: no hay forma de mostrar que la latencia
importa. Eso hace que sea difícil demostrar Portal —y difícil que cualquier demo hecha
con Portal circule por redes.

El problema de fondo: **el realtime sólo se percibe cuando se ven causa y efecto al mismo
tiempo**, y una sola pantalla nunca muestra las dos.

## Outcome

Dos personas en una llamada juegan a citar frases de una película por voz, por turnos,
contra una bomba compartida cuya mecha corre igual en las dos pantallas. Se entiende
mirando el video sin audio. La partida deja un registro propio —marcador, vidas, frases
dichas— sin que nadie tenga que filmar ni editar nada.

Éxito es: alguien que nunca oyó hablar de Portal ve el clip, entiende el juego en tres
segundos, y quiere jugarlo.
