// Agente de salud financiera — mismo espíritu que parametrosTurba.js: reglas
// determinísticas, nunca inventa un dato que no está, siempre señala el
// registro puntual y quién puede corregirlo. Solo lee, nunca escribe nada.
//
// Cada hallazgo tiene { severidad, responsable, titulo, mensaje, objetivo }:
// `titulo` es la etiqueta corta que se ve colapsada, `mensaje` es el detalle
// completo que aparece al desplegarla.
//
// Módulo autocontenido a propósito (no importa nada de App.jsx) para evitar
// un import circular, ya que App.jsx es quien llama a evaluarFinanzas. Por
// eso duplica un puñado de helpers chicos que también existen en App.jsx
// (parseFechaDP, montosPorCuenta) — son la misma lógica, con la fuente de
// verdad real en App.jsx.
//
// Un hallazgo de posible duplicado trae además `descartar` (clave de duplicados_descartados):
// con eso la pantalla ofrece "No es duplicado" y, una vez marcado, no vuelve a aparecer.

import { gastosParecidos, ventasParecidas, capitalParecidos, devolucionPareceGasto, claveDuplicado } from './duplicados.js'

function parseFechaDP(str) {
  if (!str) return null
  const p = String(str).split('/')
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
  const [y, m, dd] = corteISO.split('-').map(Number)
  return d >= new Date(y, m - 1, dd)
}

function esLegado(fechaStr, corteMinimo) {
  const d = parseFechaDP(fechaStr)
  if (!d) return true
  return !esDesdeCorte(fechaStr, corteMinimo)
}

function gastoSinAsignacion(g) {
  return !g.cuenta && (!Array.isArray(g.divisiones) || g.divisiones.length === 0)
}

function gastoConDivisionesInvalidas(g) {
  if (g.cuenta) return false
  if (!Array.isArray(g.divisiones) || g.divisiones.length === 0) return false
  const todasConCuenta = g.divisiones.every(d => d && d.cuenta)
  const suma = g.divisiones.reduce((s, d) => s + (parseFloat(d?.monto) || 0), 0)
  return !todasConCuenta || Math.abs(suma - (g.monto || 0)) >= 0.5
}

function responsablePago(pago) {
  return pago.creado_por || 'Sin autor registrado'
}
function responsableGasto(gasto) {
  return gasto.miembro || 'Sin autor registrado'
}

// El nombre de cada cuenta personal ya trae el dueño incorporado ("Lemon -
// Checho" → Checho). Las dos que no lo tienen se resuelven aparte: la cuenta
// de la organización (sin dueño individual) y la caja de efectivo (usa quién
// validó el saldo por última vez).
function resolverResponsableCuenta(nombreCuenta, cuentaInfo, { cuentaEfectivo, cuentaHormiguero }) {
  if (nombreCuenta === cuentaHormiguero) return 'Nacho y Nico'
  if (nombreCuenta === cuentaEfectivo) return cuentaInfo?.actualizado_por || 'Sin autor registrado'
  const partes = nombreCuenta.split(' - ')
  if (partes.length > 1) return partes[partes.length - 1]
  return cuentaInfo?.actualizado_por || 'Sin autor registrado'
}

// Exportadas para que App.jsx arme el mismo "objetivo" de navegación desde el libro mayor
// unificado por cuenta (DisclosureMovimientosCuenta) — mismo targeting que ya usan las alertas
// de "Registros a revisar", sin duplicar esta lógica en dos lugares.
export function objetivoPago(tipoRegistro, pg, registro) {
  const fk = tipoRegistro === 'cosecha' ? 'pedido_id' : tipoRegistro === 'esquejes' ? 'esqueje_id' : 'insumo_id'
  return { tab: 'pedidos', tipoRegistro, mes: registro?.mes, id: pg[fk] }
}
export function objetivoGasto(g) {
  return { tab: 'gastos', locacion: g.locacion, mes: g.mes, id: g.id }
}

// ── 1) Cuenta estimada sin confirmar ──
function chequearCuentaEstimada({ pedidoPagos, esquejePagos, insumoPagos, gastos, pedidos, esquejes, insumos }, fmt) {
  const hallazgos = []
  const revisar = (pagos, fk, registros, tipoRegistro, etiqueta) => {
    pagos.filter(pg => pg.cuenta_estimada).forEach(pg => {
      const registro = registros.find(r => r.id === pg[fk])
      hallazgos.push({
        severidad: 'atencion', responsable: responsablePago(pg), titulo: 'Cuenta estimada sin confirmar',
        mensaje: `Pago de ${fmt.pesos(pg.monto)} a ${registro?.socio || `(${etiqueta} no encontrado)`} del ${fmt.fechaISO(pg.fecha)} tiene una cuenta estimada, no confirmada.`,
        objetivo: objetivoPago(tipoRegistro, pg, registro),
      })
    })
  }
  revisar(pedidoPagos, 'pedido_id', pedidos, 'cosecha', 'pedido')
  revisar(esquejePagos, 'esqueje_id', esquejes, 'esquejes', 'esqueje')
  revisar(insumoPagos, 'insumo_id', insumos, 'insumos', 'insumo')
  gastos.filter(g => g.cuenta_estimada).forEach(g => {
    hallazgos.push({
      severidad: 'atencion', responsable: responsableGasto(g), titulo: 'Cuenta estimada sin confirmar',
      mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} tiene una cuenta estimada, no confirmada.`,
      objetivo: objetivoGasto(g),
    })
  })
  return hallazgos
}

// ── 2) Sin cuenta asignada (y sin ser legado de antes del corte) ──
function chequearSinCuenta({ pedidoPagos, esquejePagos, insumoPagos, gastos, pedidos, esquejes, insumos, corteMinimo }, fmt) {
  const hallazgos = []
  const esLegadoISO = fechaISO => !fechaISO || fechaISO < corteMinimo
  const revisar = (pagos, fk, registros, tipoRegistro, etiqueta) => {
    pagos.filter(pg => !pg.cuenta && !esLegadoISO(pg.fecha)).forEach(pg => {
      const registro = registros.find(r => r.id === pg[fk])
      hallazgos.push({
        severidad: 'error', responsable: responsablePago(pg), titulo: 'Sin cuenta asignada',
        mensaje: `Pago de ${fmt.pesos(pg.monto)} a ${registro?.socio || `(${etiqueta} no encontrado)`} del ${fmt.fechaISO(pg.fecha)} no tiene cuenta asignada — no está sumado en ningún total.`,
        objetivo: objetivoPago(tipoRegistro, pg, registro),
      })
    })
  }
  revisar(pedidoPagos, 'pedido_id', pedidos, 'cosecha', 'pedido')
  revisar(esquejePagos, 'esqueje_id', esquejes, 'esquejes', 'esqueje')
  revisar(insumoPagos, 'insumo_id', insumos, 'insumos', 'insumo')
  gastos.filter(g => gastoSinAsignacion(g) && !esLegado(g.fecha, corteMinimo)).forEach(g => {
    hallazgos.push({
      severidad: 'error', responsable: responsableGasto(g), titulo: 'Sin cuenta asignada',
      mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} no tiene cuenta asignada — no está sumado en ningún total.`,
      objetivo: objetivoGasto(g),
    })
  })
  return hallazgos
}

// ── 3) Divisiones de un gasto que no suman el total ──
function chequearDivisiones({ gastos }, fmt) {
  return gastos.filter(gastoConDivisionesInvalidas).map(g => {
    const suma = g.divisiones.reduce((s, d) => s + (parseFloat(d?.monto) || 0), 0)
    const diff = (g.monto || 0) - suma
    const detalle = g.divisiones.some(d => !d?.cuenta)
      ? 'una de las divisiones no tiene cuenta asignada'
      : `las divisiones suman ${fmt.pesos(suma)} y el total es ${fmt.pesos(g.monto)} (${diff > 0 ? 'faltan' : 'sobran'} ${fmt.pesos(Math.abs(diff))})`
    return {
      severidad: 'error', responsable: responsableGasto(g), titulo: 'Divisiones que no suman el total',
      mensaje: `Gasto "${g.descripcion}" dividido entre cuentas: ${detalle}.`,
      objetivo: objetivoGasto(g),
    }
  })
}

// ── 4) Posible pago duplicado: mismo registro + monto + fecha + cuenta ──
function chequearDuplicados({ pedidoPagos, esquejePagos, insumoPagos, pedidos, esquejes, insumos, duplicadosDescartados }, fmt) {
  const hallazgos = []
  const buscar = (pagos, fk, registros, tipoRegistro, etiqueta, tabla) => {
    const grupos = new Map()
    pagos.forEach(pg => {
      if (!pg.cuenta || !pg.fecha) return // sin cuenta/fecha ya lo cubre otro chequeo, no hay base sólida para comparar
      const key = `${pg[fk]}|${pg.monto}|${pg.fecha}|${pg.cuenta}`
      grupos.set(key, (grupos.get(key) || []).concat(pg))
    })
    grupos.forEach(grupo => {
      if (grupo.length < 2) return
      const descartar = claveDuplicado(tabla, grupo.map(pg => pg.id))
      if (duplicadosDescartados?.has(descartar)) return
      const registro = registros.find(r => r.id === grupo[0][fk])
      hallazgos.push({
        severidad: 'error', responsable: responsablePago(grupo[0]), titulo: 'Posible pago duplicado',
        mensaje: `${grupo.length} pagos idénticos de ${fmt.pesos(grupo[0].monto)} el ${fmt.fechaISO(grupo[0].fecha)} a la misma cuenta en el ${etiqueta} de ${registro?.socio || '(no encontrado)'} — confirmá si fueron transferencias reales separadas o se cargó dos veces por error.`,
        objetivo: objetivoPago(tipoRegistro, grupo[0], registro),
        descartar,
      })
    })
  }
  buscar(pedidoPagos, 'pedido_id', pedidos, 'cosecha', 'pedido', 'pedido_pagos')
  buscar(esquejePagos, 'esqueje_id', esquejes, 'esquejes', 'esqueje', 'esqueje_pagos')
  buscar(insumoPagos, 'insumo_id', insumos, 'insumos', 'insumo', 'insumo_pagos')
  return hallazgos
}

// ── 4b) Posibles duplicados "parecidos" (no idénticos): gastos, ventas y capital ──
// Mismo criterio que el aviso al cargar (src/duplicados.js). Solo se reclaman pares donde al
// menos uno es posterior al corte — lo de antes es historial migrado que ya nadie va a revisar.
// Se compara solo dentro de grupos del mismo monto, para no hacer N² sobre toda la base.
function porMonto(lista, campo) {
  const grupos = new Map()
  lista.forEach(x => {
    const k = Math.round(Number(x[campo]) || 0)
    if (k > 0) grupos.set(k, (grupos.get(k) || []).concat(x))
  })
  return grupos
}
function paresDe(grupos, parecidos) {
  const pares = []
  grupos.forEach(items => {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (parecidos(items[i], items[j])) pares.push([items[i], items[j]])
    }
  })
  return pares
}
// Más viejo primero: así el mensaje cuenta la historia en orden y "Revisar" lleva al último cargado.
const ordenarPar = ([a, b]) => (new Date(a.created_at || 0) <= new Date(b.created_at || 0) ? [a, b] : [b, a])
const fechaCorta = fechaDMA => String(fechaDMA || '').split('/').slice(0, 2).join('/') || 'sin fecha'
const cargadoPor = quien => (quien ? ` (lo cargó ${quien})` : '')

function chequearDuplicadosParecidos({ gastos, pedidos, esquejes, insumos, capitalMovimientos, corteMinimo, duplicadosDescartados }, fmt) {
  const hallazgos = []
  const descartado = clave => duplicadosDescartados?.has(clave)
  const recienteDMA = f => !esLegado(f, corteMinimo)
  const recienteISO = f => !!f && String(f).slice(0, 10) >= corteMinimo

  paresDe(porMonto(gastos, 'monto'), gastosParecidos).map(ordenarPar)
    .filter(([a, b]) => recienteDMA(a.fecha) || recienteDMA(b.fecha))
    .forEach(([a, b]) => {
      const clave = claveDuplicado('gastos', [a.id, b.id])
      if (descartado(clave)) return
      hallazgos.push({
        severidad: 'atencion', responsable: responsableGasto(b), titulo: 'Posible gasto duplicado',
        mensaje: `"${b.descripcion}" de ${fmt.pesos(b.monto)} parece cargado dos veces: el ${fechaCorta(a.fecha)} en ${a.locacion}${cargadoPor(a.miembro)} y el ${fechaCorta(b.fecha)} en ${b.locacion}${cargadoPor(b.miembro)}. Si son dos gastos distintos, marcá "No es duplicado"; si es el mismo, borrá uno.`,
        objetivo: objetivoGasto(b), descartar: clave,
      })
    })

  const ventas = (registros, tabla, tipoRegistro, titulo, queEs) => {
    paresDe(porMonto(registros.filter(r => r.socio), 'total'), ventasParecidas).map(ordenarPar)
      .filter(([a, b]) => recienteDMA(a.fecha) || recienteDMA(b.fecha))
      .forEach(([a, b]) => {
        const clave = claveDuplicado(tabla, [a.id, b.id])
        if (descartado(clave)) return
        hallazgos.push({
          severidad: 'atencion', responsable: b.miembro || 'Sin autor registrado', titulo,
          mensaje: `${queEs} a ${a.socio} por ${fmt.pesos(b.total)}, con los mismos ítems, parece cargado dos veces: el ${fechaCorta(a.fecha)}${cargadoPor(a.miembro)} y el ${fechaCorta(b.fecha)}${cargadoPor(b.miembro)}. Si son dos compras distintas, marcá "No es duplicado"; si es la misma, borrá una.`,
          objetivo: { tab: 'pedidos', tipoRegistro, mes: b.mes, id: b.id }, descartar: clave,
        })
      })
  }
  ventas(pedidos, 'pedidos', 'cosecha', 'Posible pedido duplicado', 'El pedido')
  ventas(esquejes, 'esquejes', 'esquejes', 'Posible venta de esquejes duplicada', 'La venta de esquejes')
  ventas(insumos, 'insumos', 'insumos', 'Posible venta de insumos duplicada', 'La venta de insumos')

  const capital = capitalMovimientos || []
  paresDe(porMonto(capital, 'monto'), capitalParecidos).map(ordenarPar)
    .filter(([a, b]) => recienteISO(a.fecha) || recienteISO(b.fecha))
    .forEach(([a, b]) => {
      const clave = claveDuplicado('capital_movimientos', [a.id, b.id])
      if (descartado(clave)) return
      const formatear = b.moneda === 'USD' ? fmt.dolares : fmt.pesos
      const que = b.tipo === 'aporte' ? `El aporte de ${b.inversor}` : `La devolución a ${b.inversor}`
      hallazgos.push({
        severidad: 'atencion', responsable: b.creado_por || 'Sin autor registrado', titulo: 'Posible capital duplicado',
        mensaje: `${que} de ${formatear(b.monto)} parece cargado dos veces: el ${fmt.fechaISO(a.fecha)}${cargadoPor(a.creado_por)} y el ${fmt.fechaISO(b.fecha)}${cargadoPor(b.creado_por)}. Si son dos movimientos distintos, marcá "No es duplicado"; si es el mismo, borrá uno desde Finanzas → Capital.`,
        objetivo: null, descartar: clave,
      })
    })

  // Devolución cargada en Capital y además como gasto: resta dos veces de las cuentas.
  const gastosPorMonto = porMonto(gastos, 'monto')
  capital.filter(c => c.tipo === 'devolucion' && recienteISO(c.fecha)).forEach(c => {
    ;(gastosPorMonto.get(Math.round(Number(c.monto) || 0)) || []).filter(g => devolucionPareceGasto(c, g)).forEach(g => {
      const clave = `gasto-capital:${g.id},${c.id}`
      if (descartado(clave)) return
      hallazgos.push({
        severidad: 'atencion', responsable: c.creado_por || responsableGasto(g), titulo: 'Devolución cargada dos veces',
        mensaje: `La devolución a ${c.inversor} de ${fmt.pesos(c.monto)} (${fmt.fechaISO(c.fecha)}) parece estar también cargada como gasto: "${g.descripcion}" del ${fechaCorta(g.fecha)}${cargadoPor(g.miembro)}. Si es la misma plata, se está restando dos veces — borrá el gasto (desde ahora las devoluciones van solo en Capital).`,
        objetivo: objetivoGasto(g), descartar: clave,
      })
    })
  })
  return hallazgos
}

// Texto corto para la lista de "descartados" (los que alguien marcó "No es duplicado"),
// armado desde los registros que hay en pantalla — la clave guardada solo tiene ids.
export function describirDescartado(clave, { gastos, pedidos, esquejes, insumos, pedidoPagos, esquejePagos, insumoPagos, capitalMovimientos }, fmt) {
  const [tabla, idsStr] = String(clave).split(':')
  const ids = (idsStr || '').split(',').map(Number)
  const buscar = lista => ids.map(id => (lista || []).find(x => Number(x.id) === id)).filter(Boolean)
  const ningunoYa = 'los registros ya no existen'
  if (tabla === 'gastos') {
    const gs = buscar(gastos)
    return gs.length ? `Gasto "${gs[0].descripcion}" de ${fmt.pesos(gs[0].monto)} (${gs.map(g => fechaCorta(g.fecha)).join(' y ')})` : `Gasto: ${ningunoYa}`
  }
  if (tabla === 'pedidos' || tabla === 'esquejes' || tabla === 'insumos') {
    const rs = buscar(tabla === 'pedidos' ? pedidos : tabla === 'esquejes' ? esquejes : insumos)
    return rs.length ? `Venta a ${rs[0].socio} por ${fmt.pesos(rs[0].total)} (${rs.map(r => fechaCorta(r.fecha)).join(' y ')})` : `Venta: ${ningunoYa}`
  }
  if (tabla === 'pedido_pagos' || tabla === 'esqueje_pagos' || tabla === 'insumo_pagos') {
    const ps = buscar(tabla === 'pedido_pagos' ? pedidoPagos : tabla === 'esqueje_pagos' ? esquejePagos : insumoPagos)
    return ps.length ? `Cobros de ${fmt.pesos(ps[0].monto)} del ${fmt.fechaISO(ps[0].fecha)} a ${ps[0].cuenta}` : `Cobros: ${ningunoYa}`
  }
  if (tabla === 'capital_movimientos') {
    const cs = buscar(capitalMovimientos)
    return cs.length ? `${cs[0].tipo === 'aporte' ? 'Aporte de' : 'Devolución a'} ${cs[0].inversor} de ${(cs[0].moneda === 'USD' ? fmt.dolares : fmt.pesos)(cs[0].monto)}` : `Capital: ${ningunoYa}`
  }
  if (tabla === 'gasto-capital') {
    const g = (gastos || []).find(x => Number(x.id) === ids[0])
    const c = (capitalMovimientos || []).find(x => Number(x.id) === ids[1])
    return g && c ? `Gasto "${g.descripcion}" y devolución a ${c.inversor} de ${fmt.pesos(c.monto)}` : `Devolución: ${ningunoYa}`
  }
  return clave
}

// ── 5/6) Gasto con fecha no legible: reciente (completar dato) vs. viejo
// con cuenta real (posible duplicado contra el saldo inicial validado) ──
function chequearFechas({ gastos, corteMinimo }, fmt) {
  const hallazgos = []
  gastos.forEach(g => {
    if (parseFechaDP(g.fecha)) return // fecha válida, no aplica
    const tieneCuentaReal = g.cuenta || (Array.isArray(g.divisiones) && g.divisiones.some(x => x?.cuenta))
    if (!tieneCuentaReal) return // sin fecha Y sin cuenta ya lo cubre el chequeo de "sin cuenta"
    const creado = g.created_at ? String(g.created_at).slice(0, 10) : null
    const esViejo = creado ? creado < corteMinimo : true // sin dato de creación: tratar como el caso más cauto
    if (esViejo) {
      hallazgos.push({
        severidad: 'error', responsable: responsableGasto(g), titulo: 'Fecha vieja con cuenta asignada',
        mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} no tiene fecha legible pero sí cuenta asignada — si es de antes de ${fmt.fechaISO(corteMinimo)} puede estar duplicando plata ya contada en el saldo inicial validado.`,
        objetivo: objetivoGasto(g),
      })
    } else {
      hallazgos.push({
        severidad: 'atencion', responsable: responsableGasto(g), titulo: 'Falta la fecha',
        mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} quedó sin fecha cargada. Completala.`,
        objetivo: objetivoGasto(g),
      })
    }
  })
  return hallazgos
}

// ── 7) Cuenta sin validar hace mucho tiempo (o nunca validada) — recomendación, no urgente ──
// Solo avisa si la cuenta tiene movimiento real Y el saldo pesa lo suficiente (los dos a la
// vez) — una cuenta nunca usada o con poca plata no vale la pena que alguien pare a validarla.
// Umbrales asimétricos: se pide menos plata en rojo para llamar la atención que en verde.
const UMBRAL_DIAS_SIN_VALIDAR = 45
const UMBRAL_SALDO_ARS_POSITIVO = 500000
const UMBRAL_SALDO_ARS_NEGATIVO = -200000
const UMBRAL_SALDO_USD_POSITIVO = 500
const UMBRAL_SALDO_USD_NEGATIVO = -200
function chequearCuentasDesactualizadas({ resumen, resumenDolares, cuentaEfectivo, cuentaHormiguero }, fmt) {
  const hoy = Date.now()
  const tieneMovimiento = r => r.ingresos > 0 || r.egresos > 0
  const pesaLoSuficiente = (r, positivo, negativo) => r.saldo >= positivo || r.saldo <= negativo
  const candidatos = [
    ...resumen.filter(r => tieneMovimiento(r) && pesaLoSuficiente(r, UMBRAL_SALDO_ARS_POSITIVO, UMBRAL_SALDO_ARS_NEGATIVO)).map(r => ({ r, formatear: fmt.pesos })),
    ...resumenDolares.filter(r => tieneMovimiento(r) && pesaLoSuficiente(r, UMBRAL_SALDO_USD_POSITIVO, UMBRAL_SALDO_USD_NEGATIVO)).map(r => ({ r, formatear: fmt.dolares })),
  ]
  return candidatos
    // Una cuenta sin fila en `cuentas` (validado=false por default) es el caso más grave, no el
    // más leve — antes se escapaba de este chequeo entero porque el filtro exigía validado=true.
    .filter(({ r }) => !r.info.validado || !r.info.actualizado_en || (hoy - new Date(r.info.actualizado_en).getTime()) / 86400000 > UMBRAL_DIAS_SIN_VALIDAR)
    .map(({ r, formatear }) => {
      const responsable = resolverResponsableCuenta(r.nombre, r.info, { cuentaEfectivo, cuentaHormiguero })
      if (!r.info.validado || !r.info.actualizado_en) {
        return {
          severidad: 'atencion', responsable, titulo: 'Cuenta nunca validada',
          mensaje: `La cuenta "${r.nombre}" nunca fue validada y ya acumula ${formatear(r.saldo)} — conviene confirmarla contra el banco real cuando puedas.`,
          objetivo: null,
        }
      }
      const dias = Math.round((hoy - new Date(r.info.actualizado_en).getTime()) / 86400000)
      return {
        severidad: 'atencion', responsable, titulo: 'Cuenta sin validar hace tiempo',
        mensaje: `La cuenta "${r.nombre}" no se valida hace ${dias} días y tiene ${formatear(r.saldo)} — conviene confirmarla contra el banco real cuando puedas.`,
        objetivo: null,
      }
    })
}

// ── 8) Saldo de cuenta negativo, explicado en criollo (no solo el número) ──
function chequearSaldosNegativos({ resumen, resumenDolares, cuentaEfectivo, cuentaHormiguero }, fmt) {
  const hallazgos = []
  resumen.filter(r => r.saldo < 0).forEach(r => {
    hallazgos.push({
      severidad: 'error', responsable: resolverResponsableCuenta(r.nombre, r.info, { cuentaEfectivo, cuentaHormiguero }), titulo: 'Saldo en rojo',
      mensaje: `La cuenta "${r.nombre}" quedó en rojo: le faltan ${fmt.pesos(Math.abs(r.saldo))}. Desde el ${fmt.fechaISO(r.info.fecha_corte)} entraron ${fmt.pesos(r.ingresos)} y salieron ${fmt.pesos(r.egresos)}, arrancando con ${fmt.pesos(r.info.saldo_inicial || 0)} — no alcanza. Puede faltar cargar un cobro o un aporte de capital (Finanzas → Capital), o hay un gasto que en realidad se pagó de otra cuenta.`,
      objetivo: null,
    })
  })
  resumenDolares.filter(r => r.saldo < 0).forEach(r => {
    hallazgos.push({
      severidad: 'error', responsable: resolverResponsableCuenta(r.nombre, r.info, { cuentaEfectivo, cuentaHormiguero }), titulo: 'Saldo en dólares en rojo',
      mensaje: `La cuenta en dólares "${r.nombre}" quedó en rojo: ${fmt.dolares(r.saldo)}. Puede faltar cargar un movimiento, o hay un retiro que en realidad fue de otra cuenta.`,
      objetivo: null,
    })
  })
  return hallazgos
}

// ── 9) Diferencia grande entre lo calculado y lo validado al confirmar un saldo ──
// Umbrales combinados (fijo Y porcentaje deben superarse los dos) para no generar
// ruido ni en cuentas chicas ni en diferencias insignificantes de cuentas grandes.
// Elegidos por mí, no validados a fondo — ajustar si generan ruido o quedan cortos.
const UMBRAL_DIFERENCIA_ARS_FIJO = 10000
const UMBRAL_DIFERENCIA_ARS_PCT = 0.10
const UMBRAL_DIFERENCIA_USD_FIJO = 15
const UMBRAL_DIFERENCIA_USD_PCT = 0.10
function chequearDiferenciaValidacion({ cuentasValidaciones, cuentaEfectivo, cuentaHormiguero, resumen, resumenDolares }, fmt) {
  const ultimaPorCuenta = new Map()
  ;[...cuentasValidaciones].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(v => ultimaPorCuenta.set(v.cuenta, v))
  const infoPorCuenta = new Map([...resumen, ...resumenDolares].map(r => [r.nombre, r.info]))
  return [...ultimaPorCuenta.values()].filter(v => {
    const fijo = v.moneda === 'USD' ? UMBRAL_DIFERENCIA_USD_FIJO : UMBRAL_DIFERENCIA_ARS_FIJO
    const pct = v.moneda === 'USD' ? UMBRAL_DIFERENCIA_USD_PCT : UMBRAL_DIFERENCIA_ARS_PCT
    const diff = Math.abs(v.diferencia)
    return diff >= fijo && diff / Math.max(Math.abs(v.saldo_calculado), 1) >= pct
  }).map(v => {
    const formatear = v.moneda === 'USD' ? fmt.dolares : fmt.pesos
    return {
      severidad: 'error', responsable: resolverResponsableCuenta(v.cuenta, infoPorCuenta.get(v.cuenta), { cuentaEfectivo, cuentaHormiguero }), titulo: 'Diferencia grande al validar',
      mensaje: `Al validar "${v.cuenta}" el ${fmt.fechaISO(v.fecha_corte_nueva)}, lo que calculaba el sistema (${formatear(v.saldo_calculado)}) no coincidió con lo que ${v.validado_por || 'alguien'} cargó como real (${formatear(v.saldo_validado)}) — diferencia de ${formatear(v.diferencia)}. Repasá los movimientos de esa cuenta desde la validación anterior para encontrar dónde está la diferencia.`,
      objetivo: null,
    }
  })
}

// ── 11) presupuesto_id de un gasto huérfano o de otra locación ──
function chequearPresupuestosGasto({ gastos, presupuestos }, fmt) {
  const porId = new Map(presupuestos.map(p => [p.id, p]))
  return gastos.filter(g => g.presupuesto_id != null).filter(g => {
    const p = porId.get(g.presupuesto_id)
    return !p || p.locacion !== g.locacion
  }).map(g => {
    const p = porId.get(g.presupuesto_id)
    const detalle = !p
      ? `apunta a un presupuesto (id ${g.presupuesto_id}) que ya no existe`
      : `apunta a "${p.nombre}", que es de ${p.locacion}, no de ${g.locacion}`
    return {
      severidad: 'error', responsable: responsableGasto(g), titulo: 'Presupuesto mal asignado',
      mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} ${detalle}.`,
      objetivo: objetivoGasto(g),
    }
  })
}

// ── 11) Cuenta usada que no está en ninguna lista conocida (typo, cuenta vieja, etc.) ──
function chequearCuentasHuerfanas({ pedidoPagos, esquejePagos, insumoPagos, gastos, dolaresMovimientos, capitalMovimientos, cuentasConocidas, cuentasDolaresConocidas, pedidos, esquejes, insumos }, fmt) {
  const hallazgos = []
  const revisarPagos = (pagos, fk, registros, tipoRegistro, etiqueta) => {
    pagos.filter(pg => pg.cuenta && !cuentasConocidas.includes(pg.cuenta)).forEach(pg => {
      const registro = registros.find(r => r.id === pg[fk])
      hallazgos.push({
        severidad: 'error', responsable: responsablePago(pg), titulo: 'Cuenta desconocida',
        mensaje: `Pago de ${fmt.pesos(pg.monto)} a ${registro?.socio || `(${etiqueta} no encontrado)`} está cargado a "${pg.cuenta}", que no es ninguna cuenta configurada.`,
        objetivo: objetivoPago(tipoRegistro, pg, registro),
      })
    })
  }
  revisarPagos(pedidoPagos, 'pedido_id', pedidos, 'cosecha', 'pedido')
  revisarPagos(esquejePagos, 'esqueje_id', esquejes, 'esquejes', 'esqueje')
  revisarPagos(insumoPagos, 'insumo_id', insumos, 'insumos', 'insumo')
  gastos.forEach(g => {
    const nombres = g.cuenta ? [g.cuenta] : (Array.isArray(g.divisiones) ? g.divisiones.filter(d => d?.cuenta).map(d => d.cuenta) : [])
    nombres.filter(n => !cuentasConocidas.includes(n)).forEach(n => {
      hallazgos.push({
        severidad: 'error', responsable: responsableGasto(g), titulo: 'Cuenta desconocida',
        mensaje: `Gasto "${g.descripcion}" está cargado a "${n}", que no es ninguna cuenta configurada.`,
        objetivo: objetivoGasto(g),
      })
    })
  })
  dolaresMovimientos.filter(m => m.cuenta && !cuentasDolaresConocidas.includes(m.cuenta)).forEach(m => {
    hallazgos.push({
      severidad: 'error', responsable: m.creado_por || 'Sin autor registrado', titulo: 'Cuenta desconocida',
      mensaje: `Movimiento en dólares de ${fmt.dolares(m.monto)} está cargado a "${m.cuenta}", que no es ninguna cuenta en dólares configurada.`,
      objetivo: null,
    })
  })
  // Un movimiento de capital en pesos tiene que ir a una cuenta en pesos y uno en dólares a una
  // en dólares — si no, no suma en ningún saldo.
  ;(capitalMovimientos || []).filter(c => c.cuenta && !(c.moneda === 'USD' ? cuentasDolaresConocidas : cuentasConocidas).includes(c.cuenta)).forEach(c => {
    hallazgos.push({
      severidad: 'error', responsable: c.creado_por || 'Sin autor registrado', titulo: 'Cuenta desconocida',
      mensaje: `${c.tipo === 'aporte' ? 'El aporte de' : 'La devolución a'} ${c.inversor} de ${(c.moneda === 'USD' ? fmt.dolares : fmt.pesos)(c.monto)} está cargado a "${c.cuenta}", que no es una cuenta en ${c.moneda === 'USD' ? 'dólares' : 'pesos'} configurada — no suma en ningún saldo. Corregilo desde Finanzas → Capital.`,
      objetivo: null,
    })
  })
  return hallazgos
}

// ── 12) Aporte de capital a un presupuesto que ya no existe ──
function chequearAportesHuerfanos({ aportes, presupuestos }, fmt) {
  const ids = new Set(presupuestos.map(p => p.id))
  return aportes.filter(a => !ids.has(a.presupuesto_id)).map(a => ({
    severidad: 'error', responsable: a.creado_por || 'Sin autor registrado', titulo: 'Ampliación de un presupuesto inexistente',
    mensaje: `Ampliación de presupuesto de ${fmt.pesos(a.monto)} (${fmt.fechaISO(a.fecha)}) apunta a un presupuesto que ya no existe (id ${a.presupuesto_id}).`,
    objetivo: null,
  }))
}

// ── 13) Cotización del dólar blue desactualizada (afecta los presupuestos en USD) ──
const UMBRAL_DIAS_COTIZACION = 2
function chequearCotizacionDolar({ cotizacionesDolar }, fmt) {
  if (!cotizacionesDolar || cotizacionesDolar.length === 0) return []
  const ultima = cotizacionesDolar[0] // viene ordenada desc por fecha desde App.jsx
  const dias = Math.round((Date.now() - new Date(ultima.fecha).getTime()) / 86400000)
  const esFallback = (ultima.fuente || '').startsWith('fallback')
  if (!esFallback && dias <= UMBRAL_DIAS_COTIZACION) return []
  return [{
    severidad: 'atencion', responsable: 'Nacho y Nico', titulo: 'Cotización del dólar desactualizada',
    mensaje: esFallback
      ? `Hoy no se pudo traer la cotización real del dólar blue — se repitió la del día anterior (${fmt.fechaISO(ultima.fecha)}). Revisá si el trigger diario sigue funcionando.`
      : `No se actualiza la cotización del dólar blue hace ${dias} días — los presupuestos en dólares pueden estar usando un valor viejo.`,
    objetivo: null,
  }]
}

// datos: { cuentas, dolaresMovimientos, gastos, presupuestos, aportes,
//   pedidoPagos, esquejePagos, insumoPagos, pedidos, esquejes, insumos,
//   resumen, resumenDolares, cuentasConocidas, cuentasDolaresConocidas,
//   cuentaEfectivo, cuentaHormiguero, corteMinimo, cuentasValidaciones,
//   cotizacionesDolar, capitalMovimientos, duplicadosDescartados (Set de claves) }
// fmt: { pesos, dolares, fechaISO } — formateadores ya existentes en App.jsx,
// se inyectan para no duplicar esa lógica acá (fechaISO se pasa sin año).
export function evaluarFinanzas(datos, fmt) {
  const hallazgos = [
    ...chequearCuentaEstimada(datos, fmt),
    ...chequearSinCuenta(datos, fmt),
    ...chequearDivisiones(datos, fmt),
    ...chequearDuplicados(datos, fmt),
    ...chequearDuplicadosParecidos(datos, fmt),
    ...chequearFechas(datos, fmt),
    ...chequearCuentasDesactualizadas(datos, fmt),
    ...chequearSaldosNegativos(datos, fmt),
    ...chequearDiferenciaValidacion(datos, fmt),
    ...chequearPresupuestosGasto(datos, fmt),
    ...chequearCuentasHuerfanas(datos, fmt),
    ...chequearAportesHuerfanos(datos, fmt),
    ...chequearCotizacionDolar(datos, fmt),
  ]
  const orden = { error: 0, atencion: 1 }
  return hallazgos.sort((a, b) => orden[a.severidad] - orden[b.severidad])
}
