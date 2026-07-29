import type { Movie } from "@/lib/engine/types";

/**
 * SEMILLA — no es el dataset definitivo.
 *
 * Estas frases existen para que el juego corra y los tests tengan material. El
 * dataset real lo aporta la dueña del proyecto en el ticket de dropdown y dataset
 * completo, y hay que verificar cada línea contra el doblaje latino antes de
 * confiar en ella: lo que importa es cómo se dice, no cómo se tradujo.
 *
 * Tres reglas que el dataset tiene que cumplir, y que los tests verifican:
 *   1. Mínimo cuatro palabras. Las frases cortas matchean con cualquier cosa.
 *   2. Ninguna puede ser subcadena de otra, o la corta se lleva siempre el punto.
 *   3. Escritas como se dicen, no como se escriben.
 */
export const emperador: Movie = {
  id: "emperador",
  title: "Las locuras del emperador",
  quotes: [
    { id: "e01", text: "jala la palanca Kronk" },
    { id: "e02", text: "jalaste la palanca equivocada" },
    { id: "e03", text: "por qué tenemos esa palanca" },
    { id: "e04", text: "no existe tal cosa" },
    { id: "e05", text: "soy el emperador del mundo" },
    { id: "e06", text: "llamas por qué tenían que ser llamas" },
    { id: "e07", text: "esto no me lo esperaba" },
    { id: "e08", text: "convertirlo en pulga es demasiado" },
    { id: "e09", text: "me convertiste en una llama" },
    { id: "e10", text: "perdón por lo de la ventana" },
    { id: "e11", text: "nadie me dijo que iba a doler" },
    { id: "e12", text: "eso no estaba en el plan" },
    { id: "e13", text: "creo que me equivoqué de frasco" },
    { id: "e14", text: "regresa aquí ahora mismo" },
    { id: "e15", text: "ya no soy el mismo de antes" },
  ],
};
