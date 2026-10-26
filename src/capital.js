// Finanzas → Capital: retorno prometido, devoluciones de cada aporte y estado — criterio único
// compartido entre la pantalla (App.jsx) y "Registros a revisar" (agenteFinanzas.js), para que
// los dos digan lo mismo. Módulo autocontenido, mismo motivo que duplicados.js.
// Fechas en ISO aaaa-mm-dd (columnas date de capital_movimientos), leídas en hora local.

import { normalizarTexto } from './duplicados.js'

// Plata: mismo margen que el resto de la app (diferencias de menos de medio peso/dólar no cuentan).
export const TOLERANCIA_CAPITAL = 0.5

function fechaLocal(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}
function sumarMeses(fecha, n) {
  const t = new Date(fecha.getFullYear(), fecha.getMonth() + n, 1)
  const ultimoDia = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return new Date(t.getFullYear(), t.getMonth(), Math.min(fecha.getDate(), ultimoDia))
}

// Meses de calendario entre dos fechas, con los días que sobran como fracción de 30:
// 19/9 → 19/3 = 6 · 19/9 → 4/3 = 5 + 13/30. Un 31 que cae en un mes de 30 días cuenta como fin de mes.
export function mesesEntre(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO || hastaISO <= desdeISO) return 0
  const desde = fechaLocal(desdeISO), hasta = fechaLocal(hastaISO)
  let n = (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth())
  let ancla = sumarMeses(desde, n)
  if (ancla > hasta) { n--; ancla = sumarMeses(desde, n) }
  return n + Math.round((hasta - ancla) / 86400000) / 30
}

export function diasEntre(desdeISO, hastaISO) {
  return Math.round((fechaLocal(hastaISO) - fechaLocal(desdeISO)) / 86400000)
}

// Interés simple, todo al vencimiento (decisión de Nacho, 22/10/2026): capital × % × tiempo, con
// el tiempo en meses de calendario desde la fecha del aporte hasta la fecha de devolución.
// Anual: 30% por 6 meses = 15%. Mensual: 5% por 6 meses = 30%.
export function interesPactado(aporte) {
  const tasa = Number(aporte.tasa_retorno) || 0
  if (!aporte.a_devolver || tasa <= 0 || !aporte.fecha_devolucion) return 0
  const meses = mesesEntre(aporte.fecha, aporte.fecha_devolucion)
  return (Number(aporte.monto) || 0) * (tasa / 100) * (aporte.periodo_tasa === 'mensual' ? meses : meses / 12)
}

// Cuánto descuenta una devolución de la deuda de su aporte, en la moneda del aporte. Si se pagó
// en otra moneda, con la cotización guardada en la devolución (la base la exige en ese caso).
export function equivalenteDevolucion(devolucion, aporte) {
  const monto = Number(devolucion.monto) || 0
  if ((devolucion.moneda || 'ARS') === (aporte.moneda || 'ARS')) return monto
  const cotizacion = Number(devolucion.cotizacion) || 0
  if (cotizacion <= 0) return 0
  return aporte.moneda === 'USD' ? monto / cotizacion : monto * cotizacion
}

// Estado de un aporte: 'no_se_devuelve' | 'activo' | 'vencido' | 'devuelto'.
// pendiente = lo pactado (capital + interés) menos lo devuelto; si se "dio por devuelto" a mano,
// queda en 0 y quedabanAlSaldar guarda lo que faltaba en ese momento.
export function resumenAporte(aporte, movimientos, hoyISO) {
  const devoluciones = (movimientos || []).filter(c => c.tipo === 'devolucion' && c.aporte_id != null && Number(c.aporte_id) === Number(aporte.id))
  const capital = Number(aporte.monto) || 0
  if (!aporte.a_devolver) {
    return { aporte, devoluciones, capital, interes: 0, pactado: 0, devuelto: 0, pendiente: 0, quedabanAlSaldar: 0, estado: 'no_se_devuelve', diasParaVencer: null }
  }
  const interes = interesPactado(aporte)
  const pactado = capital + interes
  const devuelto = devoluciones.reduce((s, d) => s + equivalenteDevolucion(d, aporte), 0)
  const falta = pactado - devuelto
  const saldado = !!aporte.saldado_en
  const diasParaVencer = aporte.fecha_devolucion ? diasEntre(hoyISO, aporte.fecha_devolucion) : null
  const estado = saldado || falta <= TOLERANCIA_CAPITAL ? 'devuelto'
    : diasParaVencer !== null && diasParaVencer < 0 ? 'vencido'
    : 'activo'
  return {
    aporte, devoluciones, capital, interes, pactado, devuelto,
    pendiente: saldado ? 0 : Math.max(0, falta),
    quedabanAlSaldar: saldado ? Math.max(0, falta) : 0,
    estado, diasParaVencer,
  }
}

// Cambios a pesos de un aporte en dólares (tabla capital_cambios), el más viejo primero: cuánto
// se cambió, a qué cotización promedio y cuánto queda sin cambiar. La base no deja que la suma
// pase lo aportado (trigger capital_cambios_validar); esto es lo que muestra la pantalla.
export function resumenCambios(aporte, cambios) {
  const propios = (cambios || []).filter(c => Number(c.aporte_id) === Number(aporte.id))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || new Date(a.created_at) - new Date(b.created_at))
  const usd = propios.reduce((s, c) => s + (Number(c.monto_usd) || 0), 0)
  const ars = propios.reduce((s, c) => s + (Number(c.monto_ars) || 0), 0)
  return { cambios: propios, usd, ars, cotizacion: usd > 0 ? ars / usd : null, sinCambiar: Math.max(0, (Number(aporte.monto) || 0) - usd) }
}

// Una cotización a más de 15% del blue de ese día casi seguro es un error de tipeo (un cero de
// más o de menos). Solo avisa: puede haber cambios reales a otro precio.
// En "Registros a revisar" se reclama solo lo rarísimo (más de 50%): lo que queda entre 15% y 50%
// ya se avisó al cargarlo y puede ser un cambio real a otro precio.
export const DESVIO_COTIZACION = 0.15
export const DESVIO_COTIZACION_RARISIMA = 0.5
export function cotizacionLejosDelBlue(cotizacion, blue, desvio = DESVIO_COTIZACION) {
  return Number(blue) > 0 && Number(cotizacion) > 0 && Math.abs(cotizacion - blue) / blue > desvio
}

// Por inversor y moneda del aporte (nunca se mezclan pesos con dólares). Una devolución sin
// aporte (cargada antes de que existiera el vínculo) se descuenta del inversor por nombre y
// moneda, como se hacía antes.
export function resumenCapitalPorInversor(movimientos, hoyISO) {
  const porClave = new Map()
  const fila = (inversor, moneda) => {
    const nombre = String(inversor || '').trim()
    const k = `${normalizarTexto(nombre)}|${moneda || 'ARS'}`
    if (!porClave.has(k)) porClave.set(k, { inversor: nombre, moneda: moneda || 'ARS', aportado: 0, pactado: 0, devuelto: 0, pendiente: 0 })
    return porClave.get(k)
  }
  ;(movimientos || []).filter(c => c.tipo === 'aporte').forEach(a => {
    const r = resumenAporte(a, movimientos, hoyISO)
    const f = fila(a.inversor, a.moneda)
    f.aportado += r.capital
    f.pactado += r.pactado
    f.devuelto += r.devuelto
    f.pendiente += r.pendiente
  })
  ;(movimientos || []).filter(c => c.tipo === 'devolucion' && c.aporte_id == null).forEach(d => {
    const f = fila(d.inversor, d.moneda)
    const monto = Number(d.monto) || 0
    f.devuelto += monto
    f.pendiente = Math.max(0, f.pendiente - monto)
  })
  return [...porClave.values()]
    .sort((a, b) => (a.moneda === b.moneda ? b.aportado - a.aportado : a.moneda === 'ARS' ? -1 : 1))
}

// Número con decimales tipeado a mano (cotización, % de retorno). Coma decimal argentina; sin
// coma, un punto seguido de exactamente 3 dígitos es separador de miles ("1.555" = 1555) y si no,
// decimal ("2.5" = 2,5). Devuelve NaN si no es un número.
export function parseDecimal(texto) {
  let s = String(texto ?? '').replace(/\s/g, '')
  if (!s) return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  return /^(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN
}

// Cotización del dólar blue para una fecha ISO: la de ese día o la anterior más cercana; si la
// fecha es anterior a todas, la más vieja (la tabla arranca el 28/9/2026). `cotizaciones` viene
// ordenada de la más nueva a la más vieja, igual que en App.jsx.
export function cotizacionParaFechaISO(fechaISO, cotizaciones) {
  if (!cotizaciones || cotizaciones.length === 0) return null
  if (!fechaISO) return cotizaciones[0]
  return cotizaciones.find(c => c.fecha === fechaISO) || cotizaciones.find(c => c.fecha < fechaISO) || cotizaciones[cotizaciones.length - 1]
}
