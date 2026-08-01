// Tabla técnica de cultivo — turba sin CO₂ (método El Hormiguero / ONG)
// Fuente: "Calendarios de Cultivos_Cosecha Flora 2024 - Parámetros TURBA SIN CO2.csv"
// Transcripción exacta semana 0-14. No modificar sin volver a validar contra el CSV original.
export const TABLA_TURBA = [
  { semana: 0, etapa: 'Germinación',      ec: [0.2, 0.4], ph: 5.8, temp: [24, 24],   hr: 70, vpd: 0.4, dli: [6, 10],   ppfd: [100, 100] },
  { semana: 1, etapa: 'Plántula',         ec: [0.4, 0.6], ph: 5.8, temp: [24, 25],   hr: 75, vpd: 0.5, dli: [13, 19],  ppfd: [200, 200] },
  { semana: 2, etapa: 'Vege temprano',    ec: [0.6, 0.8], ph: 5.8, temp: [24, 26],   hr: 65, vpd: 0.7, dli: [19, 26],  ppfd: [300, 400] },
  { semana: 3, etapa: 'Vege',             ec: [0.8, 1.0], ph: 5.8, temp: [24, 26],   hr: 60, vpd: 0.9, dli: [26, 32],  ppfd: [400, 500] },
  { semana: 4, etapa: 'Vege',             ec: [1.0, 1.2], ph: 6.0, temp: [24, 27],   hr: 60, vpd: 1.0, dli: [32, 39],  ppfd: [500, 600] },
  { semana: 5, etapa: 'Vege final',       ec: [1.1, 1.2], ph: 6.0, temp: [24, 27],   hr: 60, vpd: 1.1, dli: [39, 42],  ppfd: [600, 650] },
  { semana: 6, etapa: 'Flora 1 (stretch)',ec: [1.2, 1.3], ph: 6.0, temp: [24, 26],   hr: 60, vpd: 1.1, dli: [28, 32],  ppfd: [650, 750] },
  { semana: 7, etapa: 'Flora 2',          ec: [1.3, 1.4], ph: 6.0, temp: [24, 26],   hr: 60, vpd: 1.2, dli: [32, 35],  ppfd: [750, 800] },
  { semana: 8, etapa: 'Flora 3',          ec: [1.4, 1.5], ph: 6.2, temp: [24, 26],   hr: 55, vpd: 1.3, dli: [35, 37],  ppfd: [800, 850] },
  { semana: 9, etapa: 'Flora 4',          ec: [1.5, 1.8], ph: 6.2, temp: [24, 26],   hr: 50, vpd: 1.4, dli: [37, 39],  ppfd: [850, 900] },
  { semana: 10, etapa: 'Flora 5',         ec: [1.5, 1.8], ph: 6.2, temp: [24, 26],   hr: 45, vpd: 1.4, dli: [39, 41],  ppfd: [900, 950] },
  { semana: 11, etapa: 'Flora 6',         ec: [1.4, 1.5], ph: 6.4, temp: [23, 25],   hr: 45, vpd: 1.4, dli: [39, 41],  ppfd: [900, 950] },
  { semana: 12, etapa: 'Flora 7',         ec: [1.2, 1.3], ph: 6.4, temp: [23, 25],   hr: 45, vpd: 1.5, dli: [37, 39],  ppfd: [850, 900] },
  { semana: 13, etapa: 'Flora 8',         ec: [0.6, 0.8], ph: 6.4, temp: [22, 24],   hr: 40, vpd: 1.5, dli: [35, 37],  ppfd: [800, 850] },
  { semana: 14, etapa: 'Flush final',     ec: [0, 0],     ph: 6.4, temp: [22, 24],   hr: 40, vpd: 1.6, dli: [30, 32],  ppfd: [700, 750] },
]

// Mapeo semana app (etapa vegetativo/floración, contador propio arrancando en 1) → fila de TABLA_TURBA.
// Validado con el usuario: vegetativo 1-5 = tabla 1-5 · floración 1-9 = tabla 6-14.
// Germinación (semana 0 de la tabla) no se trackea en Riegos. Fuera de este rango no hay fila de referencia.
export function mapearSemana(etapa, semana) {
  if (etapa === 'vegetativo' && semana >= 1 && semana <= 5) return TABLA_TURBA[semana]
  if (etapa === 'floracion' && semana >= 1 && semana <= 9) return TABLA_TURBA[semana + 5]
  return null
}

// Tolerancia para parámetros de valor único (pH, HR, VPD): la tabla no da rango, da un objetivo puntual.
// Criterio propio (no viene del CSV), validado con el usuario: OK = mitad interna, Atención = mitad externa, Fuera = más allá.
const TOLERANCIA_UNICO = {
  ph:   { ok: 0.1, atencion: 0.2 },
  hr:   { ok: 3,   atencion: 5 },
  vpd:  { ok: 0.05, atencion: 0.1 },
}

// Margen de "Atención" para parámetros que ya vienen en rango en la tabla (EC, PPFD, Temp).
const MARGEN_RANGO = {
  ec: 0.1,
  ppfd: 30,
  temp: 1,
}

// intensidad: 0 = justo en el centro/límite más "tranquilo" de la zona, 1 = en el límite más
// alejado de esa zona (o más allá, en el caso de "fuera", donde se satura en 1).
function evaluarRango(valor, [min, max], margen) {
  const centro = (min + max) / 2
  const mitad = (max - min) / 2
  const d = Math.abs(valor - centro)
  if (d <= mitad) return { estado: 'ok', intensidad: mitad > 0 ? d / mitad : 0 }
  if (d <= mitad + margen) return { estado: 'atencion', intensidad: margen > 0 ? (d - mitad) / margen : 1 }
  const t = margen > 0 ? (d - mitad - margen) / margen : 1
  return { estado: 'fuera', intensidad: Math.min(1, Math.max(0, t)) }
}

function evaluarUnico(valor, objetivo, { ok, atencion }) {
  const d = Math.abs(valor - objetivo)
  const anchoAtencion = atencion - ok
  if (d <= ok) return { estado: 'ok', intensidad: ok > 0 ? d / ok : 0 }
  if (d <= atencion) return { estado: 'atencion', intensidad: anchoAtencion > 0 ? (d - ok) / anchoAtencion : 1 }
  const t = anchoAtencion > 0 ? (d - atencion) / anchoAtencion : 1
  return { estado: 'fuera', intensidad: Math.min(1, Math.max(0, t)) }
}

// Evalúa un único parámetro contra la fila de referencia. Nunca inventa un valor: si no hay
// dato registrado o no hay fila de referencia para la semana, devuelve 'sin_dato'.
export function evaluarParametro(tipo, valorCrudo, filaRef) {
  if (!filaRef) return { estado: 'sin_dato', objetivoTexto: null, intensidad: 0 }
  const valor = parseFloat(String(valorCrudo ?? '').replace(',', '.'))
  if (valorCrudo === undefined || valorCrudo === null || valorCrudo === '' || isNaN(valor)) {
    return { estado: 'sin_dato', objetivoTexto: null, intensidad: 0 }
  }

  if (tipo === 'ec' || tipo === 'ppfd' || tipo === 'temp') {
    const rango = filaRef[tipo]
    const objetivoTexto = rango[0] === rango[1] ? `${rango[0]}` : `${rango[0]}–${rango[1]}`
    const { estado, intensidad } = evaluarRango(valor, rango, MARGEN_RANGO[tipo])
    return { estado, objetivoTexto, intensidad }
  }

  if (tipo === 'ph' || tipo === 'hr' || tipo === 'vpd') {
    const objetivo = filaRef[tipo]
    const { estado, intensidad } = evaluarUnico(valor, objetivo, TOLERANCIA_UNICO[tipo])
    return { estado, objetivoTexto: `${objetivo}`, intensidad }
  }

  return { estado: 'sin_dato', objetivoTexto: null, intensidad: 0 }
}

// Rampa de color por estado: bgBase = borde "tranquilo" de la zona (intensidad 0),
// bgIntenso = borde "alejado" del objetivo (intensidad 1). El texto queda fijo por legibilidad.
const RAMPA_COLOR = {
  ok:       { bgBase: '#E1F5EE', bgIntenso: '#8FDBBC', texto: '#0F6E56' },
  atencion: { bgBase: '#FAEEDA', bgIntenso: '#F0BE72', texto: '#854F0B' },
  fuera:    { bgBase: '#FCEBEB', bgIntenso: '#E8A0A0', texto: '#791F1F' },
  sin_dato: { bgBase: '#EEEEEE', bgIntenso: '#EEEEEE', texto: '#767676' },
}

function lerpHex(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16)
  const canal = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t)
  return `#${[16, 8, 0].map(s => canal(s).toString(16).padStart(2, '0')).join('')}`
}

// Devuelve { background, color } interpolando dentro de la rampa del estado según la intensidad (0-1).
export function colorPorIntensidad(estado, intensidad) {
  const r = RAMPA_COLOR[estado] || RAMPA_COLOR.sin_dato
  if (estado === 'sin_dato') return { background: r.bgBase, color: r.texto }
  const t = Math.min(1, Math.max(0, intensidad || 0))
  return { background: lerpHex(r.bgBase, r.bgIntenso, t), color: r.texto }
}

// Evalúa los 6 parámetros evaluables de un registro (riego individual o promedio semanal).
// DLI queda fuera: no hay campo en `riegos` que lo registre (ni fotoperíodo para calcularlo).
export function evaluarRegistro(etapa, semana, valores) {
  const filaRef = mapearSemana(etapa, parseInt(semana, 10))
  const tipos = ['ec', 'ph', 'ppfd', 'vpd', 'hr', 'temp']
  const resultado = {}
  tipos.forEach(tipo => { resultado[tipo] = evaluarParametro(tipo, valores[tipo], filaRef) })
  return { filaRef, parametros: resultado }
}
