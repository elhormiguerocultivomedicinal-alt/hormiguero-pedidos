// Backfill de pedido_pagos/esqueje_pagos a partir de pagado/cuenta/divisiones
// existentes. Idempotente: borra e inserta de nuevo cada vez que se corre.
// Verifica que el ingreso por cuenta (misma cuenta que ve TabFinanzas hoy) no
// cambie ni un peso antes/después de la migración.
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://mofhnwxexplprszjoydd.supabase.co"
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno"); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const CUENTA_EFECTIVO = "Efectivo - Caja Hormi"
const CUENTAS_BANCARIAS = ["NaranjaX - Nacho", "NaranjaX - Nico", "NaranjaX - Bruno", "Lemon - Checho"]
const CUENTAS = [...CUENTAS_BANCARIAS, CUENTA_EFECTIVO]
const FECHA_CORTE_DEFAULT = "2026-05-31"

// ── Réplica exacta de la lógica hoy vigente en src/App.jsx (no tocar sin
// tocar también el original) ──────────────────────────────────────────
function parseFechaDP(str) {
  if (!str) return null
  const p = str.split("/")
  if (p.length === 3) {
    const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}
function esDesdeCorte(fechaStr, corteISO) {
  if (!fechaStr) return true
  const d = parseFechaDP(fechaStr)
  if (!d) return true
  const [y, m, dd] = (corteISO || FECHA_CORTE_DEFAULT).split("-").map(Number)
  const corte = new Date(y, m - 1, dd)
  return d >= corte
}
function esLegado(fechaStr, corteMinimo) {
  const d = parseFechaDP(fechaStr)
  if (!d) return true
  return !esDesdeCorte(fechaStr, corteMinimo)
}
function fechaEfectiva(fecha, fechaCobro) {
  return parseFechaDP(fechaCobro) ? fechaCobro : fecha
}
function montosPorCuenta(registro, campoMonto) {
  if (Array.isArray(registro.divisiones) && registro.divisiones.length > 0) {
    return registro.divisiones.filter(d => d && d.cuenta).map(d => ({ cuenta: d.cuenta, monto: parseFloat(d.monto) || 0 }))
  }
  return registro.cuenta ? [{ cuenta: registro.cuenta, monto: registro[campoMonto] || 0 }] : []
}
function tieneAsignacionValida(registro, campoMonto) {
  if (registro.cuenta) return true
  if (!Array.isArray(registro.divisiones) || registro.divisiones.length === 0) return false
  if (!registro.divisiones.every(d => d && d.cuenta)) return false
  const suma = registro.divisiones.reduce((s, d) => s + (parseFloat(d?.monto) || 0), 0)
  return Math.abs(suma - (registro[campoMonto] || 0)) < 0.5
}
function toISO(fechaStr) {
  const d = parseFechaDP(fechaStr)
  if (!d) return null
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
function esDesdeCorteISO(fechaISO, corteISO) {
  if (!fechaISO) return true
  return fechaISO >= (corteISO || FECHA_CORTE_DEFAULT)
}
function esLegadoISO(fechaISO, corteMinimo) {
  return !fechaISO || fechaISO < corteMinimo
}

async function fetchAll(tabla) {
  const { data, error } = await supabase.from(tabla).select("*")
  if (error) { console.error(`Error leyendo ${tabla}:`, error.message); process.exit(1) }
  return data
}

function corteMinimoDe(cuentas) {
  return cuentas.length > 0
    ? cuentas.reduce((min, c) => (c.fecha_corte && c.fecha_corte < min ? c.fecha_corte : min), cuentas[0].fecha_corte || FECHA_CORTE_DEFAULT)
    : FECHA_CORTE_DEFAULT
}

// ── Números ANTES (lógica vieja, registro por registro) ────────────────
function calcularAntes(pedidos, esquejes, gastos, cuentas) {
  const resumen = CUENTAS.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { fecha_corte: FECHA_CORTE_DEFAULT }
    const ingresosPedidos = pedidos.filter(p => p.pagado && esDesdeCorte(fechaEfectiva(p.fecha, p.fecha_cobro), info.fecha_corte))
      .flatMap(p => montosPorCuenta(p, "total")).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    const ingresosEsquejes = esquejes.filter(e => e.pagado && esDesdeCorte(fechaEfectiva(e.fecha, e.fecha_cobro), info.fecha_corte))
      .flatMap(e => montosPorCuenta(e, "total")).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    return { nombre, ingresos: ingresosPedidos + ingresosEsquejes }
  })
  const corteMinimo = corteMinimoDe(cuentas)
  const pedidosSinCuenta = pedidos.filter(p => p.pagado && !tieneAsignacionValida(p, "total") && !esLegado(p.fecha, corteMinimo))
  const esquejesSinCuenta = esquejes.filter(e => e.pagado && !tieneAsignacionValida(e, "total") && !esLegado(e.fecha, corteMinimo))
  const ingresosSinCuenta = pedidosSinCuenta.reduce((s, p) => s + (p.total || 0), 0) + esquejesSinCuenta.reduce((s, e) => s + (e.total || 0), 0)
  return { resumen, ingresosSinCuenta, cantidadSinCuenta: pedidosSinCuenta.length + esquejesSinCuenta.length }
}

// ── Números DESPUÉS (lógica nueva, pago por pago) ───────────────────────
function calcularDespues(pedidoPagos, esquejePagos, cuentas) {
  const resumen = CUENTAS.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { fecha_corte: FECHA_CORTE_DEFAULT }
    const ingresosPedidos = pedidoPagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    const ingresosEsquejes = esquejePagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    return { nombre, ingresos: ingresosPedidos + ingresosEsquejes }
  })
  const corteMinimo = corteMinimoDe(cuentas)
  const pagosPedidosSinCuenta = pedidoPagos.filter(pg => !pg.cuenta && !esLegadoISO(pg.fecha, corteMinimo))
  const pagosEsquejesSinCuenta = esquejePagos.filter(pg => !pg.cuenta && !esLegadoISO(pg.fecha, corteMinimo))
  const ingresosSinCuenta = pagosPedidosSinCuenta.reduce((s, pg) => s + (pg.monto || 0), 0) + pagosEsquejesSinCuenta.reduce((s, pg) => s + (pg.monto || 0), 0)
  return { resumen, ingresosSinCuenta, cantidadSinCuenta: pagosPedidosSinCuenta.length + pagosEsquejesSinCuenta.length }
}

function sintetizarPagos(registros, fk) {
  const filas = []
  for (const r of registros) {
    if (!r.pagado) continue
    const fechaISO = toISO(fechaEfectiva(r.fecha, r.fecha_cobro))
    const base = { cuenta_estimada: !!r.cuenta_estimada, creado_por: null, fecha: fechaISO }
    if (Array.isArray(r.divisiones) && r.divisiones.length > 0) {
      for (const d of r.divisiones) {
        filas.push({ [fk]: r.id, monto: parseFloat(d.monto) || 0, metodo_pago: d.metodoPago || null, cuenta: d.cuenta || null, ...base })
      }
    } else {
      filas.push({ [fk]: r.id, monto: r.total || 0, metodo_pago: r.metodo_pago || null, cuenta: r.cuenta || null, ...base })
    }
  }
  return filas
}

async function borrarEInsertar(tabla, filas) {
  const { error: delError } = await supabase.from(tabla).delete().gte("id", 0)
  if (delError) { console.error(`Error limpiando ${tabla}:`, delError.message); process.exit(1) }
  let insertados = 0
  for (let i = 0; i < filas.length; i += 50) {
    const lote = filas.slice(i, i + 50)
    if (lote.length === 0) continue
    const { data, error } = await supabase.from(tabla).insert(lote).select()
    if (error) { console.error(`Error insertando en ${tabla} (lote ${i}):`, error.message); process.exit(1) }
    insertados += data.length
  }
  return insertados
}

function diffResumen(antes, despues) {
  let ok = true
  console.log("\nIngresos por cuenta (antes → después):")
  for (const cuenta of CUENTAS) {
    const a = antes.resumen.find(r => r.nombre === cuenta)?.ingresos || 0
    const d = despues.resumen.find(r => r.nombre === cuenta)?.ingresos || 0
    const cierra = Math.abs(a - d) < 0.5
    if (!cierra) ok = false
    console.log(`  ${cierra ? "✓" : "✗"} ${cuenta}: ${a} → ${d}`)
  }
  const sinCuentaCierra = Math.abs(antes.ingresosSinCuenta - despues.ingresosSinCuenta) < 0.5 && antes.cantidadSinCuenta === despues.cantidadSinCuenta
  if (!sinCuentaCierra) ok = false
  console.log(`  ${sinCuentaCierra ? "✓" : "✗"} Sin cuenta: ${antes.cantidadSinCuenta} reg. / $${antes.ingresosSinCuenta} → ${despues.cantidadSinCuenta} pagos / $${despues.ingresosSinCuenta}`)
  return ok
}

const [pedidos, esquejes, gastos, cuentas] = await Promise.all([
  fetchAll("pedidos"), fetchAll("esquejes"), fetchAll("gastos"), fetchAll("cuentas"),
])
console.log(`Leídos: ${pedidos.length} pedidos, ${esquejes.length} esquejes, ${gastos.length} gastos, ${cuentas.length} cuentas`)

const antes = calcularAntes(pedidos, esquejes, gastos, cuentas)

const pedidoPagosNuevos = sintetizarPagos(pedidos, "pedido_id")
const esquejePagosNuevos = sintetizarPagos(esquejes, "esqueje_id")
console.log(`\nSintetizados: ${pedidoPagosNuevos.length} pedido_pagos, ${esquejePagosNuevos.length} esqueje_pagos`)

const insPedidos = await borrarEInsertar("pedido_pagos", pedidoPagosNuevos)
const insEsquejes = await borrarEInsertar("esqueje_pagos", esquejePagosNuevos)
console.log(`Insertados: ${insPedidos} pedido_pagos, ${insEsquejes} esqueje_pagos`)

const [pedidoPagosDB, esquejePagosDB] = await Promise.all([fetchAll("pedido_pagos"), fetchAll("esqueje_pagos")])
const despues = calcularDespues(pedidoPagosDB, esquejePagosDB, cuentas)

const ok = diffResumen(antes, despues)
console.log(ok ? "\n✓ TODO CIERRA — migración verificada" : "\n✗ HAY DIFERENCIAS — no seguir con el deploy sin revisar")
process.exit(ok ? 0 : 1)
