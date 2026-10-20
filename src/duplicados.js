// Control de duplicados — criterio único compartido entre el aviso al cargar (App.jsx) y la
// alerta de "Registros a revisar" (agenteFinanzas.js), para que los dos digan lo mismo.
// Módulo autocontenido (no importa nada de App.jsx), mismo motivo que agenteFinanzas.js.
//
// Nunca decide solo: todo lo que marca es "posible" duplicado. Hay casos legítimos que
// matchean (ej. "Impuesto municipal Junio" y "Julio", mismo monto y mismo día), por eso
// en la carga solo avisa y en la alerta se puede marcar "No es duplicado".

export const DIAS_VENTANA_DUPLICADO = 3

// Acepta d/m/aaaa (gastos, ventas), aaaa-mm-dd (pagos, capital) o un timestamp ISO
// (created_at). Las dos primeras se leen en hora local, igual que en el resto de la app.
export function fechaAMs(valor) {
  const s = String(valor || '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime()
  const t = Date.parse(s)
  return isNaN(t) ? null : t
}

export function fechasCercanas(a, b, dias = DIAS_VENTANA_DUPLICADO) {
  const ta = fechaAMs(a), tb = fechaAMs(b)
  if (ta == null || tb == null) return false
  return Math.abs(ta - tb) <= dias * 86400000 + 3600000 // +1 h por los cambios de horario
}

export function mismoMonto(a, b) {
  const x = Number(a), y = Number(b)
  return isFinite(x) && isFinite(y) && x > 0 && Math.abs(x - y) < 0.5
}

export function normalizarTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function palabras(s) {
  return new Set(normalizarTexto(s).split(' ').filter(w => w.length >= 3))
}

// Parecidas = comparten al menos la mitad de las palabras (de 3+ letras, sin tildes ni
// mayúsculas), o una está contenida entera en la otra ("Yerba" ≈ "Yerba mate").
export function descripcionesParecidas(a, b) {
  const na = normalizarTexto(a), nb = normalizarTexto(b)
  if (!na || !nb) return false
  if (na === nb || ` ${nb} `.includes(` ${na} `) || ` ${na} `.includes(` ${nb} `)) return true
  const A = palabras(a), B = palabras(b)
  if (A.size === 0 || B.size === 0) return false
  let comunes = 0
  A.forEach(w => { if (B.has(w)) comunes++ })
  return comunes / (A.size + B.size - comunes) >= 0.5
}

export function gastosParecidos(a, b) {
  return mismoMonto(a.monto, b.monto) && fechasCercanas(a.fecha, b.fecha) && descripcionesParecidas(a.descripcion, b.descripcion)
}

// Dos cobros del MISMO registro con el mismo monto en pocos días (cualquier cuenta): entre
// registros distintos el mismo monto es lo normal (precios fijos de membresías).
export function pagosParecidos(a, b, fk) {
  return a[fk] != null && a[fk] === b[fk] && mismoMonto(a.monto, b.monto) && fechasCercanas(a.fecha, b.fecha)
}

function claveItems(geneticas) {
  return (Array.isArray(geneticas) ? geneticas : [])
    .filter(g => g && g.nombre)
    .map(g => `${normalizarTexto(g.nombre)}:${Number(g.cantidad) || 0}`)
    .sort().join('|')
}

// Venta repetida: mismo comprador, mismos ítems y cantidades, mismo total, cargada a pocos días.
export function ventasParecidas(a, b) {
  const sa = normalizarTexto(a.socio), sb = normalizarTexto(b.socio)
  return !!sa && sa === sb && mismoMonto(a.total, b.total)
    && claveItems(a.geneticas) === claveItems(b.geneticas)
    && fechasCercanas(a.created_at || a.fecha, b.created_at || b.fecha)
}

export function capitalParecidos(a, b) {
  return a.tipo === b.tipo && (a.moneda || 'ARS') === (b.moneda || 'ARS')
    && normalizarTexto(a.inversor) === normalizarTexto(b.inversor)
    && mismoMonto(a.monto, b.monto) && fechasCercanas(a.fecha, b.fecha)
}

// Una devolución de capital que ya se había cargado como gasto (así se hacía antes de existir
// la sección Capital): mismo monto, fecha cercana y un gasto que "huele" a devolución.
export function devolucionPareceGasto(capital, gasto) {
  if (capital.tipo !== 'devolucion' || (capital.moneda || 'ARS') !== 'ARS') return false
  if (!mismoMonto(capital.monto, gasto.monto) || !fechasCercanas(capital.fecha, gasto.fecha)) return false
  const desc = normalizarTexto(gasto.descripcion)
  const nombre = normalizarTexto(capital.inversor).split(' ')[0]
  return gasto.categoria === 'Inversiones' || /devol|invers|prest|deuda/.test(desc) || (nombre.length >= 3 && desc.includes(nombre))
}

// Clave estable de un par/grupo para `duplicados_descartados` (orden de ids indistinto).
export function claveDuplicado(tabla, ids) {
  return `${tabla}:${[...ids].map(Number).sort((x, y) => x - y).join(',')}`
}
