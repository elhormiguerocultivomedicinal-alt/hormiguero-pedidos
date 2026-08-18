// Agente de salud financiera — mismo espíritu que parametrosTurba.js: reglas
// determinísticas, nunca inventa un dato que no está, siempre señala el
// registro puntual y quién puede corregirlo. Solo lee, nunca escribe nada.
//
// Módulo autocontenido a propósito (no importa nada de App.jsx) para evitar
// un import circular, ya que App.jsx es quien llama a evaluarFinanzas. Por
// eso duplica un puñado de helpers chicos que también existen en App.jsx
// (parseFechaDP, montosPorCuenta, tieneAsignacionValida) — son la misma
// lógica, con la fuente de verdad real en App.jsx.

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

function objetivoPago(tipoRegistro, pg, registro) {
  const fk = tipoRegistro === 'cosecha' ? 'pedido_id' : tipoRegistro === 'esquejes' ? 'esqueje_id' : 'insumo_id'
  return { tab: 'pedidos', tipoRegistro, mes: registro?.mes, id: pg[fk] }
}
function objetivoGasto(g) {
  return { tab: 'gastos', locacion: g.locacion, mes: g.mes, id: g.id }
}

// ── 1) Cuenta estimada sin confirmar ──
function chequearCuentaEstimada({ pedidoPagos, esquejePagos, insumoPagos, gastos, pedidos, esquejes, insumos }, fmt) {
  const hallazgos = []
  const revisar = (pagos, fk, registros, tipoRegistro, etiqueta) => {
    pagos.filter(pg => pg.cuenta_estimada).forEach(pg => {
      const registro = registros.find(r => r.id === pg[fk])
      hallazgos.push({
        severidad: 'atencion', responsable: responsablePago(pg),
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
      severidad: 'atencion', responsable: responsableGasto(g),
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
        severidad: 'error', responsable: responsablePago(pg),
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
      severidad: 'error', responsable: responsableGasto(g),
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
      severidad: 'error', responsable: responsableGasto(g),
      mensaje: `Gasto "${g.descripcion}" dividido entre cuentas: ${detalle}.`,
      objetivo: objetivoGasto(g),
    }
  })
}

// ── 4) Posible pago duplicado: mismo registro + monto + fecha + cuenta ──
function chequearDuplicados({ pedidoPagos, esquejePagos, insumoPagos, pedidos, esquejes, insumos }, fmt) {
  const hallazgos = []
  const buscar = (pagos, fk, registros, tipoRegistro, etiqueta) => {
    const grupos = new Map()
    pagos.forEach(pg => {
      if (!pg.cuenta || !pg.fecha) return // sin cuenta/fecha ya lo cubre otro chequeo, no hay base sólida para comparar
      const key = `${pg[fk]}|${pg.monto}|${pg.fecha}|${pg.cuenta}`
      grupos.set(key, (grupos.get(key) || []).concat(pg))
    })
    grupos.forEach(grupo => {
      if (grupo.length < 2) return
      const registro = registros.find(r => r.id === grupo[0][fk])
      const ids = grupo.map(p => p.id).join(', ')
      hallazgos.push({
        severidad: 'error', responsable: responsablePago(grupo[0]),
        mensaje: `${grupo.length} pagos idénticos de ${fmt.pesos(grupo[0].monto)} el ${fmt.fechaISO(grupo[0].fecha)} a la misma cuenta en el ${etiqueta} de ${registro?.socio || '(no encontrado)'} — confirmá si son transferencias reales separadas o una carga duplicada (pagos ${ids}).`,
        objetivo: objetivoPago(tipoRegistro, grupo[0], registro),
      })
    })
  }
  buscar(pedidoPagos, 'pedido_id', pedidos, 'cosecha', 'pedido')
  buscar(esquejePagos, 'esqueje_id', esquejes, 'esquejes', 'esqueje')
  buscar(insumoPagos, 'insumo_id', insumos, 'insumos', 'insumo')
  return hallazgos
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
        severidad: 'error', responsable: responsableGasto(g),
        mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} no tiene fecha legible pero sí cuenta asignada — si es de antes de ${fmt.fechaISO(corteMinimo)} puede estar duplicando plata ya contada en el saldo inicial validado.`,
        objetivo: objetivoGasto(g),
      })
    } else {
      hallazgos.push({
        severidad: 'atencion', responsable: responsableGasto(g),
        mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} quedó sin fecha cargada. Completala.`,
        objetivo: objetivoGasto(g),
      })
    }
  })
  return hallazgos
}

// ── 7) Cuenta sin validar hace mucho tiempo ──
const UMBRAL_DIAS_SIN_VALIDAR = 45
function chequearCuentasDesactualizadas({ resumen, resumenDolares, cuentaEfectivo, cuentaHormiguero }, fmt) {
  const hoy = Date.now()
  return [...resumen, ...resumenDolares]
    .filter(r => r.info.validado && r.info.actualizado_en)
    .filter(r => (hoy - new Date(r.info.actualizado_en).getTime()) / 86400000 > UMBRAL_DIAS_SIN_VALIDAR)
    .map(r => {
      const dias = Math.round((hoy - new Date(r.info.actualizado_en).getTime()) / 86400000)
      return {
        severidad: 'atencion', responsable: resolverResponsableCuenta(r.nombre, r.info, { cuentaEfectivo, cuentaHormiguero }),
        mensaje: `La cuenta "${r.nombre}" no se valida hace ${dias} días — el saldo puede estar desincronizado del banco real.`,
        objetivo: null,
      }
    })
}

// ── 8) Saldo de cuenta negativo, con el desglose de por qué ──
function chequearSaldosNegativos({ resumen, resumenDolares, cuentaEfectivo, cuentaHormiguero }, fmt) {
  const hallazgos = []
  resumen.filter(r => r.saldo < 0).forEach(r => {
    hallazgos.push({
      severidad: 'error', responsable: resolverResponsableCuenta(r.nombre, r.info, { cuentaEfectivo, cuentaHormiguero }),
      mensaje: `La cuenta "${r.nombre}" está en ${fmt.pesos(r.saldo)}: ${fmt.pesos(r.info.saldo_inicial || 0)} de saldo inicial + ${fmt.pesos(r.ingresos)} de ingresos − ${fmt.pesos(r.egresos)} de gastos desde ${fmt.fechaISO(r.info.fecha_corte)}.`,
      objetivo: null,
    })
  })
  resumenDolares.filter(r => r.saldo < 0).forEach(r => {
    hallazgos.push({
      severidad: 'error', responsable: resolverResponsableCuenta(r.nombre, r.info, { cuentaEfectivo, cuentaHormiguero }),
      mensaje: `La cuenta en dólares "${r.nombre}" está en ${fmt.dolares(r.saldo)}.`,
      objetivo: null,
    })
  })
  return hallazgos
}

// ── 9) presupuesto_id de un gasto huérfano o de otra locación ──
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
      severidad: 'error', responsable: responsableGasto(g),
      mensaje: `Gasto "${g.descripcion}" de ${fmt.pesos(g.monto)} ${detalle}.`,
      objetivo: objetivoGasto(g),
    }
  })
}

// ── 10) Cuenta usada que no está en ninguna lista conocida (typo, cuenta vieja, etc.) ──
function chequearCuentasHuerfanas({ pedidoPagos, esquejePagos, insumoPagos, gastos, dolaresMovimientos, cuentasConocidas, cuentasDolaresConocidas, pedidos, esquejes, insumos }, fmt) {
  const hallazgos = []
  const revisarPagos = (pagos, fk, registros, tipoRegistro, etiqueta) => {
    pagos.filter(pg => pg.cuenta && !cuentasConocidas.includes(pg.cuenta)).forEach(pg => {
      const registro = registros.find(r => r.id === pg[fk])
      hallazgos.push({
        severidad: 'error', responsable: responsablePago(pg),
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
        severidad: 'error', responsable: responsableGasto(g),
        mensaje: `Gasto "${g.descripcion}" está cargado a "${n}", que no es ninguna cuenta configurada.`,
        objetivo: objetivoGasto(g),
      })
    })
  })
  dolaresMovimientos.filter(m => m.cuenta && !cuentasDolaresConocidas.includes(m.cuenta)).forEach(m => {
    hallazgos.push({
      severidad: 'error', responsable: m.creado_por || 'Sin autor registrado',
      mensaje: `Movimiento en dólares de ${fmt.dolares(m.monto)} está cargado a "${m.cuenta}", que no es ninguna cuenta en dólares configurada.`,
      objetivo: null,
    })
  })
  return hallazgos
}

// ── 11) Aporte de capital a un presupuesto que ya no existe ──
function chequearAportesHuerfanos({ aportes, presupuestos }, fmt) {
  const ids = new Set(presupuestos.map(p => p.id))
  return aportes.filter(a => !ids.has(a.presupuesto_id)).map(a => ({
    severidad: 'error', responsable: a.creado_por || 'Sin autor registrado',
    mensaje: `Aporte de capital de ${fmt.pesos(a.monto)} (${fmt.fechaISO(a.fecha)}) apunta a un presupuesto que ya no existe (id ${a.presupuesto_id}).`,
    objetivo: null,
  }))
}

// datos: { cuentas, dolaresMovimientos, gastos, presupuestos, aportes,
//   pedidoPagos, esquejePagos, insumoPagos, pedidos, esquejes, insumos,
//   resumen, resumenDolares, cuentasConocidas, cuentasDolaresConocidas,
//   cuentaEfectivo, cuentaHormiguero, corteMinimo }
// fmt: { pesos, dolares, fechaISO } — formateadores ya existentes en App.jsx,
// se inyectan para no duplicar esa lógica acá.
export function evaluarFinanzas(datos, fmt) {
  const hallazgos = [
    ...chequearCuentaEstimada(datos, fmt),
    ...chequearSinCuenta(datos, fmt),
    ...chequearDivisiones(datos, fmt),
    ...chequearDuplicados(datos, fmt),
    ...chequearFechas(datos, fmt),
    ...chequearCuentasDesactualizadas(datos, fmt),
    ...chequearSaldosNegativos(datos, fmt),
    ...chequearPresupuestosGasto(datos, fmt),
    ...chequearCuentasHuerfanas(datos, fmt),
    ...chequearAportesHuerfanos(datos, fmt),
  ]
  const orden = { error: 0, atencion: 1 }
  return hallazgos.sort((a, b) => orden[a.severidad] - orden[b.severidad])
}
