import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import './App.css'
import { supabase } from './supabase'

const GENETICAS = ['OG24K', 'Choco OG', 'Z-Kiem', 'Fancy', 'Gorilla Rainbow']
const MIEMBROS = ['Bruno', 'Checho', 'Nacho', 'Nico']
const PRECIO_DEFAULT = 12500

// ─── Mapeo email → miembro (atribución automática) ────────────
const EMAIL_MIEMBRO = {
  'bruno.ricciardi@hotmail.com': 'Bruno',
  'checho.denis@gmail.com': 'Checho',
  'ignacio.agustinlopez97@gmail.com': 'Nacho',
  'nicolas.lop18@gmail.com': 'Nico',
}
function miembroDeSesion(sesion) {
  const email = sesion?.user?.email?.toLowerCase().trim()
  return EMAIL_MIEMBRO[email] || null
}

function formatPesos(n) {
  const v = Number(n)
  return '$' + Math.round(isFinite(v) ? v : 0).toLocaleString('es-AR')
}

function hoyCompleto() {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

const mesActual = () => {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getFullYear()}`
}

// ─── Hooks compartidos ────────────────────────────────────────
// Un solo toast reusable (antes copiado en ~6 componentes). Limpia el
// timer al desmontar, evitando setState sobre un componente ya ido.
function useToast() {
  const [toast, setToast] = useState({ show: false, msg: '' })
  const timer = useRef(null)
  const showToast = useCallback((msg, ms = 2500) => {
    setToast({ show: true, msg })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast({ show: false, msg: '' }), ms)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return [toast, showToast]
}

// Cierra un modal/popover con la tecla Escape.
function useEscape(onEscape) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])
}

const filaVacia = () => ({ id: Date.now() + Math.random(), nombre: '', cantidad: '', precio: PRECIO_DEFAULT })

const STOCK_INICIAL = {
  'OG24K': 286,
  'Choco OG': 384,
  'Z-Kiem': 546,
  'Fancy': 172,
  'Gorilla Rainbow': 557,
}

const CATEGORIAS_GASTOS = ['Servicios', 'Alquiler', 'Insumos cultivo', 'Marketing', 'Bonos comisión directiva', 'Gastos estructurales', 'Inversiones', 'Insumos varios', 'Comida']
const CATEGORIAS_GASTOS_MAP = {
  'Hormi 1.0': CATEGORIAS_GASTOS,
  'Hormi 2.0': CATEGORIAS_GASTOS,
}

// ─── Finanzas: cuentas ──────────────────────────────────────────
const CUENTA_EFECTIVO = 'Efectivo - Caja Hormi'
const CUENTAS_BANCARIAS = ['NaranjaX - Nacho', 'NaranjaX - Nico', 'NaranjaX - Bruno', 'Lemon - Checho']
const CUENTAS = [...CUENTAS_BANCARIAS, CUENTA_EFECTIVO]
const FECHA_CORTE_DEFAULT = '2026-05-31'

// ─── Esquejes: constantes y color de identidad ────────────────
const STOCK_ESQUEJES_INICIAL = {
  'OG24K': 200,
  'Choco OG': 200,
  'Z-Kiem': 200,
  'Fancy': 200,
  'Gorilla Rainbow': 200,
}
const COLOR_ESQUEJES = '#B7791F'
const COLOR_ESQUEJES_LIGHT = '#FBF0DC'
const COLOR_ESQUEJES_BORDER = '#E8C77E'
const filaEsquejeVacia = () => ({ id: Date.now() + Math.random(), nombre: '', cantidad: '', precio: '' })

// ─── Config por dominio (Cosecha vs Esquejes) ─────────────────
// Todo lo que difiere entre pedidos y esquejes vive acá; los componentes
// (FormRegistro, ModalEditarRegistro, ListaRegistros, PanelStock) son únicos.
const CFG_COSECHA = {
  unidad: 'g', stockInicial: STOCK_INICIAL, stockLow: 50,
  color: 'var(--green-dark)', colorBorde: null, btnBg: null,
  nuevaFila: filaVacia, precioDefaultFila: PRECIO_DEFAULT,
  singular: 'pedido', plural: 'pedidos', labelEntregado: 'Pedido entregado', txtEliminar: 'Eliminar pedido',
}
const CFG_ESQUEJES = {
  unidad: 'u', stockInicial: STOCK_ESQUEJES_INICIAL, stockLow: 20,
  color: COLOR_ESQUEJES, colorBorde: COLOR_ESQUEJES_BORDER, btnBg: COLOR_ESQUEJES,
  nuevaFila: filaEsquejeVacia, precioDefaultFila: '',
  singular: 'esqueje', plural: 'esquejes', labelEntregado: 'Entregado', txtEliminar: 'Eliminar',
}
const NOMBRES_MESES_CORTO = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ─── DatePicker ───────────────────────────────────────────────
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const NOMBRES_MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function parseFechaDP(str) {
  if (!str) return null
  const p = str.split('/')
  if (p.length === 3) {
    const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function formatFechaCompleta(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function DatePicker({ value, onChange, placeholder = 'Seleccionar fecha' }) {
  const [open, setOpen] = useState(false)
  const now = new Date()
  const parsed = parseFechaDP(value)
  const [viewYear, setViewYear] = useState(parsed ? parsed.getFullYear() : now.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth() : now.getMonth())

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function getDias() {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const totalDias = new Date(viewYear, viewMonth + 1, 0).getDate()
    const dias = []
    for (let i = 0; i < offset; i++) dias.push(null)
    for (let i = 1; i <= totalDias; i++) dias.push(i)
    return dias
  }

  function selectDia(dia) {
    if (!dia) return
    onChange(formatFechaCompleta(new Date(viewYear, viewMonth, dia)))
    setOpen(false)
  }

  const dias = getDias()
  const selectedDay = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth ? parsed.getDate() : null
  const todayDay = now.getFullYear() === viewYear && now.getMonth() === viewMonth ? now.getDate() : null

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="form-control"
        type="text"
        placeholder={placeholder}
        value={value || ''}
        readOnly
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', caretColor: 'transparent' }}
      />
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 300,
            background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)',
            borderRadius: 'var(--radius-lg)', padding: 12, width: 260,
            boxShadow: '0 4px 20px rgba(0,0,0,0.14)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', padding: '0 6px', lineHeight: 1 }}>‹</button>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {NOMBRES_MESES_LARGO[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', padding: '0 6px', lineHeight: 1 }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DIAS_SEMANA.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, padding: '2px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {dias.map((dia, i) => {
                const isSelected = dia === selectedDay
                const isHoy = dia === todayDay
                return (
                  <button key={i} onClick={() => selectDia(dia)} disabled={!dia} style={{
                    height: 32, width: '100%', border: 'none', borderRadius: 6,
                    cursor: dia ? 'pointer' : 'default',
                    background: isSelected ? 'var(--green-dark)' : isHoy ? 'var(--green-light)' : 'transparent',
                    color: isSelected ? 'white' : isHoy ? 'var(--green-dark)' : dia ? 'var(--text-primary)' : 'transparent',
                    fontSize: 13, fontWeight: isSelected || isHoy ? 600 : 400,
                  }}>
                    {dia || ''}
                  </button>
                )
              })}
            </div>
            <button onClick={() => { onChange(formatFechaCompleta(now)); setOpen(false) }} style={{
              width: '100%', marginTop: 8, padding: '7px',
              border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)',
              background: 'transparent', fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer'
            }}>
              Hoy
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Input de plata: $ + separador de miles mientras se escribe, sin centavos ───
function InputMonto({ value, onChange, placeholder, disabled, className = 'form-control', style, permiteNegativo }) {
  function formatDisplay(v) {
    const str = String(v ?? '')
    const neg = permiteNegativo && str.trim().startsWith('-')
    const digits = str.replace(/\D/g, '')
    if (!digits) return neg ? '-' : ''
    return (neg ? '-$' : '$') + Number(digits).toLocaleString('es-AR')
  }
  function handleChange(e) {
    const raw = e.target.value
    const neg = permiteNegativo && raw.trim().startsWith('-')
    const digits = raw.replace(/\D/g, '')
    onChange((neg ? '-' : '') + digits)
  }
  return (
    <input
      className={className}
      type="text"
      inputMode={permiteNegativo ? 'text' : 'numeric'}
      placeholder={placeholder}
      value={formatDisplay(value)}
      disabled={disabled}
      style={style}
      onChange={handleChange}
    />
  )
}

// ─── Divisiones de pago/gasto entre varias cuentas (compartido) ───
function validarDivisiones(divisiones, total) {
  const filas = divisiones.filter(d => d.cuenta && parseFloat(d.monto) > 0)
  if (filas.length < 2) return { ok: false, msg: 'Agregá al menos 2 cuentas, o cancelá la división.' }
  const suma = filas.reduce((s, d) => s + parseFloat(d.monto), 0)
  if (Math.abs(suma - total) >= 0.5) return { ok: false, msg: `La suma de las cuentas (${formatPesos(suma)}) no coincide con el total (${formatPesos(total)}).` }
  return { ok: true, filas }
}

function FilasDivision({ divisiones, onChange, total, conMetodo }) {
  function setDiv(id, key, val) {
    onChange(divisiones.map(d => {
      if (d.id !== id) return d
      if (key === 'metodoPago') return { ...d, metodoPago: val, cuenta: val === 'Efectivo' ? CUENTA_EFECTIVO : (d.cuenta === CUENTA_EFECTIVO ? '' : d.cuenta) }
      return { ...d, [key]: val }
    }))
  }
  function agregar() { onChange([...divisiones, { id: Math.random(), monto: '', metodoPago: 'Transferencia', cuenta: '' }]) }
  function eliminar(id) { if (divisiones.length > 1) onChange(divisiones.filter(d => d.id !== id)) }
  const asignado = divisiones.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0)
  const cierra = Math.abs(asignado - total) < 0.5

  return (
    <>
      <label className="form-label">Cuentas</label>
      <div className="filas-genetica">
        {divisiones.map(d => (
          <div key={d.id} className="fila-genetica">
            <InputMonto className="form-control fila-cantidad" placeholder="Monto" value={d.monto} onChange={v => setDiv(d.id, 'monto', v)} />
            {conMetodo && (
              <select className="form-control" value={d.metodoPago} onChange={e => setDiv(d.id, 'metodoPago', e.target.value)}>
                <option>Transferencia</option>
                <option>Efectivo</option>
              </select>
            )}
            <select className="form-control" value={d.cuenta} disabled={conMetodo && d.metodoPago === 'Efectivo'} onChange={e => setDiv(d.id, 'cuenta', e.target.value)}>
              <option value="">Seleccionar...</option>
              {(conMetodo ? (d.metodoPago === 'Efectivo' ? [CUENTA_EFECTIVO] : CUENTAS_BANCARIAS) : CUENTAS).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {divisiones.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminar(d.id)}>✕</button>}
          </div>
        ))}
      </div>
      <button className="btn-agregar-fila" onClick={agregar}>+ Agregar cuenta</button>
      <div className="total-row">
        <span className="total-label">Asignado</span>
        <span className="total-value" style={{ color: cierra ? undefined : '#791F1F' }}>{formatPesos(asignado)} de {formatPesos(total)}</span>
      </div>
    </>
  )
}

// ─── Modal edición completa (genérico: pedido o esqueje) ───────
function ModalEditarRegistro({ cfg, registro, onGuardar, onEliminar, onCerrar }) {
  useEscape(onCerrar)
  const tienePrecioPorFila = registro.geneticas.some(g => g.precio !== undefined && g.precio !== null)
  const [form, setForm] = useState({
    socio: registro.socio,
    miembro: registro.miembro,
    fecha: registro.fecha || '',
    mes: registro.mes || '',
    filas: registro.geneticas.map(g => ({ id: Math.random(), nombre: g.nombre, cantidad: g.cantidad, precio: g.precio ?? '' })),
    precio: registro.precio,
    propio: registro.propio,
    pagado: registro.pagado,
    metodoPago: registro.metodoPago || registro.metodo_pago || 'Transferencia',
    fechaCobro: registro.fechaCobro || registro.fecha_cobro || '',
    cuenta: registro.cuenta || '',
    dividido: Array.isArray(registro.divisiones) && registro.divisiones.length > 0,
    divisiones: (registro.divisiones || []).map((d, i) => ({ id: i, monto: String(d.monto), metodoPago: d.metodoPago || 'Transferencia', cuenta: d.cuenta || '' })),
    entregado: registro.entregado,
  })
  const [confirmando, setConfirmando] = useState(false)
  const [errorCuenta, setErrorCuenta] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const total = form.propio ? 0 : form.filas.reduce((s, f) => {
    const precioFila = tienePrecioPorFila ? (parseFloat(f.precio) || 0) : (parseFloat(form.precio) || 0)
    return s + (parseFloat(f.cantidad) || 0) * precioFila
  }, 0)

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() { set('filas', [...form.filas, { id: Math.random(), nombre: '', cantidad: '', precio: tienePrecioPorFila ? cfg.precioDefaultFila : '' }]) }
  function eliminarFila(id) { if (form.filas.length > 1) set('filas', form.filas.filter(f => f.id !== id)) }
  function handlePropio(val) { setForm(f => ({ ...f, propio: val, precio: val ? 0 : PRECIO_DEFAULT, pagado: false, fechaCobro: '', cuenta: '' })) }
  function handlePagado(val) { setForm(f => ({ ...f, pagado: val, fechaCobro: val ? (form.fechaCobro || hoyCompleto()) : '' })) }
  function handleMetodoPago(val) { setForm(f => ({ ...f, metodoPago: val, cuenta: val === 'Efectivo' ? CUENTA_EFECTIVO : (f.cuenta === CUENTA_EFECTIVO ? '' : f.cuenta) })) }
  function activarDivision() {
    setForm(f => ({ ...f, dividido: true, divisiones: f.divisiones.length ? f.divisiones : [{ id: Math.random(), monto: total ? String(total) : '', metodoPago: f.metodoPago, cuenta: f.cuenta }] }))
  }
  function cancelarDivision() { setForm(f => ({ ...f, dividido: false })); setErrorCuenta('') }

  function guardar() {
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if (!form.socio.trim() || filasValidas.length === 0 || sinCantidad) return
    let divisionesFinal = null
    if (form.pagado && form.dividido) {
      const v = validarDivisiones(form.divisiones, total)
      if (!v.ok) { setErrorCuenta(v.msg); return }
      divisionesFinal = v.filas.map(d => ({ monto: parseFloat(d.monto), metodoPago: d.metodoPago, cuenta: d.cuenta }))
    } else if (form.pagado && !form.cuenta) {
      setErrorCuenta('Elegí una cuenta: si no, este pago no se va a reflejar en Finanzas.')
      return
    }
    setErrorCuenta('')
    const geneticas = filasValidas.map(f => tienePrecioPorFila
      ? { nombre: f.nombre, cantidad: f.cantidad, precio: f.precio }
      : { nombre: f.nombre, cantidad: f.cantidad })
    let mes = form.mes
    const partes = form.fecha.split('/')
    if (partes.length === 3) mes = `${parseInt(partes[1])}/${partes[2]}`
    onGuardar({
      ...registro, ...form, mes, geneticas, total, precio: form.precio,
      metodo_pago: (form.pagado && form.dividido) ? 'Dividido' : form.metodoPago, fecha_cobro: form.fechaCobro,
      cuenta: (form.pagado && !form.dividido) ? (form.cuenta || null) : null,
      divisiones: divisionesFinal,
      cuentaEstimada: false,
    })
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-titulo">Editar {cfg.singular}</div>
          <button className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div className="miembro-row" style={{ marginBottom: 0 }}>
          {MIEMBROS.map(m => (
            <button key={m} className={`miembro-btn${form.miembro === m ? ' active' : ''}`} onClick={() => set('miembro', m)}>{m}</button>
          ))}
        </div>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Socio</label>
            <input className="form-control" type="text" value={form.socio} onChange={e => set('socio', e.target.value)} />
          </div>
          <div className="form-group full">
            <label className="form-label">Fecha</label>
            <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
          </div>
        </div>
        <div className="form-group full">
          <label className="form-label">Genética</label>
          <div className="filas-genetica">
            {form.filas.map(fila => (
              <div key={fila.id} className="fila-genetica">
                <select className="form-control" value={fila.nombre} onChange={e => setFila(fila.id, 'nombre', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {GENETICAS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input className="form-control fila-cantidad" type="number" placeholder={cfg.unidad} min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                {tienePrecioPorFila && (
                  <InputMonto className="form-control fila-cantidad" placeholder={`$/${cfg.unidad}`} value={fila.precio} disabled={form.propio} onChange={v => setFila(fila.id, 'precio', v)} />
                )}
                {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
              </div>
            ))}
          </div>
          <button className="btn-agregar-fila" onClick={agregarFila}>+ Agregar genética</button>
        </div>
        <div className="form-grid">
          {!tienePrecioPorFila && (
            <div className="form-group">
              <label className="form-label">Precio por {cfg.unidad} ($)</label>
              <InputMonto value={form.precio} onChange={v => set('precio', v)} disabled={form.propio} />
            </div>
          )}
          <div className="form-group">
            <div className="total-row">
              <span className="total-label">Total</span>
              <span className="total-value">{formatPesos(total)}</span>
            </div>
          </div>
        </div>
        <div className="toggle-group">
          <div className="toggle-row">
            <span className="toggle-label">Consumo propio</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.propio} onChange={e => handlePropio(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
          {!form.propio && (
            <>
              <div className="toggle-row">
                <span className="toggle-label">Pago recibido</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.pagado} onChange={e => handlePagado(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
              {form.pagado && (
                <div className="pago-extra">
                  {!form.dividido && (
                    <div className="form-group">
                      <label className="form-label">Método</label>
                      <select className="form-control" value={form.metodoPago} onChange={e => handleMetodoPago(e.target.value)}>
                        <option>Transferencia</option>
                        <option>Efectivo</option>
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Fecha cobro</label>
                    <DatePicker value={form.fechaCobro} onChange={v => set('fechaCobro', v)} />
                  </div>
                  {!form.dividido ? (
                    <div className="form-group full">
                      <label className="form-label">Cuenta</label>
                      <select className="form-control" value={form.cuenta} disabled={form.metodoPago === 'Efectivo'} onChange={e => { set('cuenta', e.target.value); setErrorCuenta('') }}>
                        <option value="">Seleccionar...</option>
                        {(form.metodoPago === 'Efectivo' ? [CUENTA_EFECTIVO] : CUENTAS_BANCARIAS).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {errorCuenta && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{errorCuenta}</div>}
                      <button className="btn-agregar-fila" onClick={activarDivision} style={{ marginTop: 8 }}>+ Dividir entre varias cuentas</button>
                    </div>
                  ) : (
                    <div className="form-group full">
                      <FilasDivision divisiones={form.divisiones} onChange={d => { set('divisiones', d); setErrorCuenta('') }} total={total} conMetodo />
                      {errorCuenta && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{errorCuenta}</div>}
                      <button onClick={cancelarDivision} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>Cancelar división (volver a una sola cuenta)</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="toggle-row">
            <span className="toggle-label">{cfg.labelEntregado}</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.entregado} onChange={e => set('entregado', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
        <button className="btn-submit" style={{ marginTop: 16, ...(cfg.btnBg ? { background: cfg.btnBg } : {}) }} onClick={guardar}>Guardar cambios</button>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} style={{ width: '100%', marginTop: 8, padding: '10px', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', background: 'transparent', color: '#791F1F', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            {cfg.txtEliminar}
          </button>
        ) : (
          <div style={{ marginTop: 8, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>¿Confirmás la eliminación?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onEliminar(registro)} style={{ flex: 1, padding: '9px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, eliminar</button>
              <button onClick={() => setConfirmando(false)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal editar gasto ───────────────────────────────────────
function ModalEditarGasto({ gasto, categorias, presupuestos, onGuardar, onEliminar, onCerrar }) {
  useEscape(onCerrar)
  const [form, setForm] = useState({
    descripcion: gasto.descripcion,
    categoria: gasto.categoria,
    monto: gasto.monto,
    fecha: gasto.fecha || '',
    miembro: gasto.miembro || '',
    cuenta: gasto.cuenta || '',
    presupuesto_id: gasto.presupuesto_id || '',
    dividido: Array.isArray(gasto.divisiones) && gasto.divisiones.length > 0,
    divisiones: (gasto.divisiones || []).map((d, i) => ({ id: i, monto: String(d.monto), cuenta: d.cuenta || '' })),
  })
  const [confirmando, setConfirmando] = useState(false)
  const [errorCuenta, setErrorCuenta] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const presupuestosDisponibles = (presupuestos || []).filter(p => p.locacion === gasto.locacion && (!p.cerrado || p.id === gasto.presupuesto_id))

  function activarDivision() {
    const montoTotal = parseFloat(form.monto)
    setForm(f => ({ ...f, dividido: true, divisiones: f.divisiones.length ? f.divisiones : [{ id: Math.random(), monto: montoTotal ? String(montoTotal) : '', cuenta: f.cuenta }] }))
  }
  function cancelarDivision() { setForm(f => ({ ...f, dividido: false })); setErrorCuenta('') }

  function guardar() {
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto)) return
    const montoTotal = parseFloat(form.monto)
    let divisionesFinal = null
    if (form.dividido) {
      const v = validarDivisiones(form.divisiones, montoTotal)
      if (!v.ok) { setErrorCuenta(v.msg); return }
      divisionesFinal = v.filas.map(d => ({ monto: parseFloat(d.monto), cuenta: d.cuenta }))
    } else if (!form.cuenta) {
      setErrorCuenta('Elegí una cuenta: si no, este gasto no se va a descontar en Finanzas.')
      return
    }
    setErrorCuenta('')
    const partes = form.fecha.split('/')
    const mes = partes.length === 3 ? `${parseInt(partes[1])}/${partes[2]}` : gasto.mes
    onGuardar({ ...gasto, ...form, monto: montoTotal, mes, cuenta: form.dividido ? null : (form.cuenta || null), divisiones: divisionesFinal, presupuesto_id: form.presupuesto_id ? Number(form.presupuesto_id) : null, cuentaEstimada: false })
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-titulo">Editar gasto</div>
          <button className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div className="miembro-row" style={{ marginBottom: 0 }}>
          {MIEMBROS.map(m => (
            <button key={m} className={`miembro-btn${form.miembro === m ? ' active' : ''}`} onClick={() => set('miembro', m)}>{m}</button>
          ))}
        </div>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Descripción</label>
            <input className="form-control" type="text" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
          <div className="form-group full">
            <label className="form-label">Categoría</label>
            <select className="form-control" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
              <option value="">Seleccionar...</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Monto ($)</label>
            <InputMonto value={form.monto} onChange={v => set('monto', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
          </div>
          {!form.dividido ? (
            <div className="form-group full">
              <label className="form-label">Cuenta de la que salió</label>
              <select className="form-control" value={form.cuenta} onChange={e => { set('cuenta', e.target.value); setErrorCuenta('') }}>
                <option value="">Seleccionar...</option>
                {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {errorCuenta && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{errorCuenta}</div>}
              <button className="btn-agregar-fila" onClick={activarDivision} style={{ marginTop: 8 }}>+ Dividir entre varias cuentas</button>
            </div>
          ) : (
            <div className="form-group full">
              <FilasDivision divisiones={form.divisiones} onChange={d => { set('divisiones', d); setErrorCuenta('') }} total={parseFloat(form.monto) || 0} />
              {errorCuenta && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{errorCuenta}</div>}
              <button onClick={cancelarDivision} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>Cancelar división (volver a una sola cuenta)</button>
            </div>
          )}
          <div className="form-group full">
            <label className="form-label">Presupuesto (opcional)</label>
            <select className="form-control" value={form.presupuesto_id} onChange={e => set('presupuesto_id', e.target.value)}>
              <option value="">Ninguno</option>
              {presupuestosDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
        <button className="btn-submit" style={{ marginTop: 16 }} onClick={guardar}>Guardar cambios</button>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} style={{ width: '100%', marginTop: 8, padding: '10px', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', background: 'transparent', color: '#791F1F', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Eliminar gasto
          </button>
        ) : (
          <div style={{ marginTop: 8, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>¿Confirmás la eliminación?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onEliminar(gasto)} style={{ flex: 1, padding: '9px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, eliminar</button>
              <button onClick={() => setConfirmando(false)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Formulario nuevo registro (genérico: pedido o esqueje) ───
function FormRegistro({ cfg, onGuardar, miembro }) {
  const initial = () => ({ socio: '', propio: false, pagado: false, metodoPago: 'Transferencia', fechaCobro: '', cuenta: '', dividido: false, divisiones: [], entregado: false, filas: [cfg.nuevaFila()] })
  const [form, setForm] = useState(initial)
  const [toast, showToast] = useToast()

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const total = form.propio ? 0 : form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0) * (parseFloat(f.precio) || 0), 0)

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() { set('filas', [...form.filas, cfg.nuevaFila()]) }
  function eliminarFila(id) { if (form.filas.length === 1) return; set('filas', form.filas.filter(f => f.id !== id)) }
  function handlePropio(val) { setForm(f => ({ ...f, propio: val, pagado: false, fechaCobro: '', cuenta: '' })) }
  function handlePagado(val) { setForm(f => ({ ...f, pagado: val, fechaCobro: val ? hoyCompleto() : '' })) }
  function handleMetodoPago(val) { setForm(f => ({ ...f, metodoPago: val, cuenta: val === 'Efectivo' ? CUENTA_EFECTIVO : (f.cuenta === CUENTA_EFECTIVO ? '' : f.cuenta) })) }
  function activarDivision() {
    setForm(f => ({ ...f, dividido: true, divisiones: f.divisiones.length ? f.divisiones : [{ id: Math.random(), monto: total ? String(total) : '', metodoPago: f.metodoPago, cuenta: f.cuenta }] }))
  }
  function cancelarDivision() { set('dividido', false) }

  async function guardar() {
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if (!form.socio.trim() || filasValidas.length === 0 || sinCantidad) {
      showToast('Completá socio, genética y cantidad')
      return
    }
    let divisionesFinal = null
    if (form.pagado && form.dividido) {
      const v = validarDivisiones(form.divisiones, total)
      if (!v.ok) { showToast(v.msg); return }
      divisionesFinal = v.filas.map(d => ({ monto: parseFloat(d.monto), metodoPago: d.metodoPago, cuenta: d.cuenta }))
    } else if (form.pagado && !form.cuenta) {
      showToast('Elegí una cuenta para el pago')
      return
    }
    const geneticas = filasValidas.map(f => ({ nombre: f.nombre, cantidad: f.cantidad, precio: f.precio }))
    const registro = {
      id: Date.now(),
      fecha: hoyCompleto(),
      miembro,
      socio: form.socio.trim(),
      geneticas,
      precio: cfg.precioDefaultFila,
      total,
      propio: form.propio,
      pagado: form.pagado,
      metodoPago: (form.pagado && form.dividido) ? 'Dividido' : form.metodoPago,
      fechaCobro: form.fechaCobro,
      cuenta: (form.pagado && !form.dividido) ? (form.cuenta || null) : null,
      divisiones: divisionesFinal,
      cuentaEstimada: false,
      entregado: form.entregado,
    }
    const res = await onGuardar(registro)
    if (!res?.ok) {
      showToast('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      return
    }
    setForm(initial())
    showToast(`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} guardado ✓`)
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
        Registrando como <strong style={{ color: 'var(--text-primary)' }}>{miembro || '—'}</strong>
      </div>
      <div className="card">
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Socio</label>
            <input className="form-control" type="text" placeholder="Nombre del socio..." value={form.socio} onChange={e => set('socio', e.target.value)} />
          </div>
          <div className="form-group full">
            <label className="form-label">Genética</label>
            <div className="filas-genetica">
              {form.filas.map(fila => (
                <div key={fila.id} className="fila-genetica">
                  <select className="form-control" value={fila.nombre} onChange={e => setFila(fila.id, 'nombre', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {GENETICAS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input className="form-control fila-cantidad" type="number" placeholder={cfg.unidad} min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                  <InputMonto className="form-control fila-cantidad" placeholder={`$/${cfg.unidad}`} value={fila.precio} disabled={form.propio} onChange={v => setFila(fila.id, 'precio', v)} />
                  {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
                </div>
              ))}
            </div>
            <button className="btn-agregar-fila" onClick={agregarFila}>+ Agregar genética al pedido</button>
          </div>
          <div className="form-group full">
            <div className="total-row">
              <span className="total-label">Total</span>
              <span className="total-value">{formatPesos(total)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="toggle-group">
          <div className="toggle-row">
            <span className="toggle-label">Consumo propio</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.propio} onChange={e => handlePropio(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
          {!form.propio && (
            <>
              <div className="toggle-row">
                <span className="toggle-label">Pago recibido</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.pagado} onChange={e => handlePagado(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
              {form.pagado && (
                <div className="pago-extra">
                  {!form.dividido && (
                    <div className="form-group">
                      <label className="form-label">Método</label>
                      <select className="form-control" value={form.metodoPago} onChange={e => handleMetodoPago(e.target.value)}>
                        <option>Transferencia</option>
                        <option>Efectivo</option>
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Fecha cobro</label>
                    <DatePicker value={form.fechaCobro} onChange={v => set('fechaCobro', v)} />
                  </div>
                  {!form.dividido ? (
                    <div className="form-group full">
                      <label className="form-label">Cuenta</label>
                      <select className="form-control" value={form.cuenta} disabled={form.metodoPago === 'Efectivo'} onChange={e => set('cuenta', e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {(form.metodoPago === 'Efectivo' ? [CUENTA_EFECTIVO] : CUENTAS_BANCARIAS).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button className="btn-agregar-fila" onClick={activarDivision} style={{ marginTop: 8 }}>+ Dividir entre varias cuentas</button>
                    </div>
                  ) : (
                    <div className="form-group full">
                      <FilasDivision divisiones={form.divisiones} onChange={d => set('divisiones', d)} total={total} conMetodo />
                      <button onClick={cancelarDivision} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>Cancelar división (volver a una sola cuenta)</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="toggle-row">
            <span className="toggle-label">{cfg.labelEntregado}</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.entregado} onChange={e => set('entregado', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
      <button className="btn-submit" style={cfg.btnBg ? { background: cfg.btnBg } : undefined} onClick={guardar}>Guardar {cfg.singular}</button>
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Lista de registros (genérico: pedidos o esquejes) ────────
function ListaRegistros({ cfg, registros, onActualizar, onEliminar }) {
  const [filtro, setFiltro] = useState('todos')
  const [mesActivo, setMesActivo] = useState(mesActual())
  const [editando, setEditando] = useState(null)

  const meses = [...new Set(registros.map(p => p.mes).filter(Boolean))].sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number)
    const [mb, yb] = b.split('/').map(Number)
    return yb !== ya ? yb - ya : mb - ma
  })

  const filtrados = registros.filter(p => {
    const mesOk = mesActivo === 'todos' || p.mes === mesActivo
    if (filtro === 'sin-entregar') return mesOk && !p.entregado
    if (filtro === 'sin-cobrar') return mesOk && !p.pagado && !p.propio
    return mesOk
  })

  const totalVendido = filtrados.filter(p => !p.propio).reduce((s, p) => s + (p.total || 0), 0)
  const sinEntregar = filtrados.filter(p => !p.entregado).length
  function formatMes(mes) {
    if (!mes) return mes
    const [m, y] = mes.split('/')
    return `${NOMBRES_MESES_CORTO[parseInt(m)]} ${y}`
  }

  return (
    <div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-num">{filtrados.length}</div><div className="stat-lbl">Pedidos</div></div>
        <div className="stat-card"><div className="stat-num" style={{ fontSize: 16 }}>{formatPesos(totalVendido)}</div><div className="stat-lbl">Vendido</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: sinEntregar > 0 ? '#854F0B' : undefined }}>{sinEntregar}</div><div className="stat-lbl">Sin entregar</div></div>
      </div>
      {meses.length > 0 && (
        <div className="filtros-row">
          {meses.map(m => (
            <button key={m} className={`filtro-btn${mesActivo === m ? ' active' : ''}`} onClick={() => setMesActivo(m)}>{formatMes(m)}</button>
          ))}
          <button className={`filtro-btn${mesActivo === 'todos' ? ' active' : ''}`} onClick={() => setMesActivo('todos')}>Todos</button>
        </div>
      )}
      <div className="filtros-row">
        {[['sin-entregar', 'Sin entregar'], ['sin-cobrar', 'Sin cobrar'], ['todos', 'Todos']].map(([key, label]) => (
          <button key={key} className={`filtro-btn${filtro === key ? ' active' : ''}`} onClick={() => setFiltro(key)}>{label}</button>
        ))}
      </div>
      <div className="pedidos-list">
        {filtrados.length === 0
          ? <div className="empty-state">No hay {cfg.plural} para mostrar.</div>
          : filtrados.map(p => (
            <div className="pedido-card" key={p.id} onClick={() => setEditando(p)}>
              <div>
                <div className="pedido-nombre">{p.socio}</div>
                <div className="pedido-sub">{p.geneticas.map(g => `${g.nombre} ${g.cantidad}${cfg.unidad}`).join(' · ')} · {p.fecha} · {p.miembro}</div>
                <div className="pedido-badges">
                  <span className={`badge ${p.entregado ? 'badge-entregado' : 'badge-no-entregado'}`}>{p.entregado ? 'Entregado' : 'No entregado'}</span>
                  {p.propio
                    ? <span className="badge badge-propio">Consumo propio</span>
                    : <span className={`badge ${p.pagado ? 'badge-pagado' : 'badge-sin-cobrar'}`}>{p.pagado ? 'Pagado' : 'Sin cobrar'}</span>
                  }
                </div>
              </div>
              <div className="pedido-right">
                <span className="pedido-total">{p.propio ? '—' : formatPesos(p.total)}</span>
                {p.pagado && (
                  <span
                    className="pedido-metodo"
                    title={Array.isArray(p.divisiones) && p.divisiones.length > 0 ? p.divisiones.map(d => `${d.cuenta}: ${formatPesos(d.monto)}`).join(' · ') : undefined}
                  >
                    {Array.isArray(p.divisiones) && p.divisiones.length > 0
                      ? `${p.divisiones.length} cuentas (${p.divisiones.map(d => formatPesos(d.monto)).join(' + ')})`
                      : `${p.metodoPago || p.metodo_pago}${p.cuenta ? ` · ${p.cuenta}` : ''}`}
                    {p.cuenta_estimada ? ' (estimada)' : ''}
                  </span>
                )}
                <span className="pedido-editar-hint">Tocar para editar</span>
              </div>
            </div>
          ))
        }
      </div>
      {editando && (
        <ModalEditarRegistro
          cfg={cfg}
          registro={editando}
          onGuardar={actualizado => { onActualizar(actualizado, editando); setEditando(null) }}
          onEliminar={p => { onEliminar(p, editando); setEditando(null) }}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

// ─── Panel de Stock (genérico: producción o esquejes) ─────────
function PanelStock({ stock, cfg }) {
  const totalActual = Object.values(stock).reduce((s, v) => s + v, 0)
  const totalInicial = Object.values(cfg.stockInicial).reduce((s, v) => s + v, 0)
  return (
    <div>
      <div className="card" style={{ marginBottom: 0, ...(cfg.colorBorde ? { borderColor: cfg.colorBorde } : {}) }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center', marginBottom: 14 }}>
          <span className="form-label">Genética</span>
          <span className="form-label">Inicial</span>
          <span className="form-label">Actual</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {GENETICAS.map(g => {
            const cant = stock[g] ?? 0
            const inicial = cfg.stockInicial[g] ?? 0
            const pct = inicial > 0 ? Math.max(0, Math.min(100, (cant / inicial) * 100)) : 0
            const color = cant === 0 ? '#791F1F' : cant < cfg.stockLow ? '#854F0B' : cfg.color
            return (
              <div key={g}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{g}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inicial}{cfg.unidad}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color }}>{cant}{cfg.unidad}</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: color, transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center' }}>
          <span className="form-label">Total</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{totalInicial}{cfg.unidad}</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{totalActual}{cfg.unidad}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Cosecha: agrupa Nuevo / Lista / Stock de materia vegetal ──
function TabCosecha({ pedidos, stock, miembro, onGuardarPedido, onActualizarPedido, onEliminarPedido }) {
  const [sub, setSub] = useState('nuevo')
  return (
    <div className="content">
      <div className="miembro-row">
        <button className={`miembro-btn${sub === 'nuevo' ? ' active' : ''}`} onClick={() => setSub('nuevo')}>Nuevo</button>
        <button className={`miembro-btn${sub === 'lista' ? ' active' : ''}`} onClick={() => setSub('lista')}>Lista</button>
        <button className={`miembro-btn${sub === 'stock' ? ' active' : ''}`} onClick={() => setSub('stock')}>Stock</button>
      </div>
      {sub === 'nuevo' && <FormRegistro cfg={CFG_COSECHA} onGuardar={async p => { const res = await onGuardarPedido(p); if (res?.ok) setSub('lista'); return res }} miembro={miembro} />}
      {sub === 'lista' && <ListaRegistros cfg={CFG_COSECHA} registros={pedidos} onActualizar={onActualizarPedido} onEliminar={onEliminarPedido} />}
      {sub === 'stock' && <PanelStock stock={stock} cfg={CFG_COSECHA} />}
    </div>
  )
}

// ─── Tab Gastos ───────────────────────────────────────────────
function PanelGastos({ locacion, gastos, miembro, presupuestos, onNuevoGasto, onActualizarGasto, onEliminarGasto }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ descripcion: '', categoria: '', monto: '', fecha: '', cuenta: '', presupuesto_id: '', dividido: false, divisiones: [] })
  const [toast, showToast] = useToast()
  const [filtroMes, setFiltroMes] = useState('todos')
  const [filtrocat, setFiltrocat] = useState('todas')
  const [editando, setEditando] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const categorias = CATEGORIAS_GASTOS_MAP[locacion] || CATEGORIAS_GASTOS
  const presupuestosActivos = (presupuestos || []).filter(p => p.locacion === locacion && !p.cerrado)

  function activarDivision() {
    const montoTotal = parseFloat(form.monto)
    setForm(f => ({ ...f, dividido: true, divisiones: f.divisiones.length ? f.divisiones : [{ id: Math.random(), monto: montoTotal ? String(montoTotal) : '', cuenta: f.cuenta }] }))
  }
  function cancelarDivision() { set('dividido', false) }

  async function guardarGasto() {
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto)) {
      showToast('Completá descripción, categoría y monto')
      return
    }
    const montoTotal = parseFloat(form.monto)
    let divisionesFinal = null
    if (form.dividido) {
      const v = validarDivisiones(form.divisiones, montoTotal)
      if (!v.ok) { showToast(v.msg); return }
      divisionesFinal = v.filas.map(d => ({ monto: parseFloat(d.monto), cuenta: d.cuenta }))
    } else if (!form.cuenta) {
      showToast('Elegí la cuenta de la que salió el gasto')
      return
    }
    const partes = (form.fecha || '').split('/')
    const mes = partes.length === 3 ? `${parseInt(partes[1])}/${partes[2]}` : mesActual()
    const nuevoGasto = { descripcion: form.descripcion.trim(), categoria: form.categoria, monto: montoTotal, fecha: form.fecha, mes, locacion, miembro: miembro || null, cuenta: form.dividido ? null : (form.cuenta || null), divisiones: divisionesFinal, presupuesto_id: form.presupuesto_id ? Number(form.presupuesto_id) : null, cuenta_estimada: false }
    const res = await onNuevoGasto(nuevoGasto)
    if (res?.ok) {
      setForm({ descripcion: '', categoria: '', monto: '', fecha: '', cuenta: '', presupuesto_id: '', dividido: false, divisiones: [] })
      setMostrarForm(false)
      showToast('Gasto registrado ✓')
    } else showToast('Error al guardar')
  }

  const filtrados = gastos.filter(g => {
    const mesOk = filtroMes === 'todos' || g.mes === filtroMes
    const catOk = filtrocat === 'todas' || g.categoria === filtrocat
    return mesOk && catOk
  })

  const totalFiltrado = filtrados.reduce((s, g) => s + g.monto, 0)
  const meses = [...new Set(gastos.map(g => g.mes).filter(Boolean))].sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number)
    const [mb, yb] = b.split('/').map(Number)
    return ya !== yb ? yb - ya : mb - ma
  })
  const porCategoria = categorias.map(cat => ({
    cat, total: filtrados.filter(g => g.categoria === cat).reduce((s, g) => s + g.monto, 0)
  })).filter(x => x.total > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {porCategoria.length > 0 && (
        <div className="card">
          <div style={{ marginBottom: 10 }}><span className="form-label">Resumen</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {porCategoria.map(({ cat, total }) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{cat}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{formatPesos(total)}</span>
              </div>
            ))}
            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{formatPesos(totalFiltrado)}</span>
            </div>
          </div>
        </div>
      )}
      {gastos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select className="form-control" style={{ flex: 1, height: 34 }} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="todos">Todos los meses</option>
            {meses.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="form-control" style={{ flex: 1, height: 34 }} value={filtrocat} onChange={e => setFiltrocat(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {mostrarForm && (
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Registrando como <strong style={{ color: 'var(--text-primary)' }}>{miembro || '—'}</strong>
          </div>
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Descripción</label>
              <input className="form-control" type="text" placeholder="Ej: Factura de luz mayo" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
            </div>
            <div className="form-group full">
              <label className="form-label">Categoría</label>
              <select className="form-control" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                <option value="">Seleccionar...</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Monto ($)</label>
              <InputMonto value={form.monto} onChange={v => set('monto', v)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
            </div>
            {!form.dividido ? (
              <div className="form-group full">
                <label className="form-label">Cuenta de la que sale</label>
                <select className="form-control" value={form.cuenta} onChange={e => set('cuenta', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn-agregar-fila" onClick={activarDivision} style={{ marginTop: 8 }}>+ Dividir entre varias cuentas</button>
              </div>
            ) : (
              <div className="form-group full">
                <FilasDivision divisiones={form.divisiones} onChange={d => set('divisiones', d)} total={parseFloat(form.monto) || 0} />
                <button onClick={cancelarDivision} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>Cancelar división (volver a una sola cuenta)</button>
              </div>
            )}
            <div className="form-group full">
              <label className="form-label">Presupuesto (opcional)</label>
              <select className="form-control" value={form.presupuesto_id} onChange={e => set('presupuesto_id', e.target.value)}>
                <option value="">Ninguno</option>
                {presupuestosActivos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={guardarGasto} style={{ flex: 1 }}>Guardar gasto</button>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}
      {!mostrarForm && (
        <button className="btn-agregar-fila" onClick={() => setMostrarForm(true)}>+ Registrar gasto en {locacion}</button>
      )}
      <div className="pedidos-list">
        {filtrados.length === 0
          ? <div className="empty-state">No hay gastos registrados en {locacion}.</div>
          : filtrados.map(g => (
            <div className="pedido-card" key={g.id} onClick={() => setEditando(g)} style={{ cursor: 'pointer' }}>
              <div>
                <div className="pedido-nombre">{g.descripcion}</div>
                <div
                  className="pedido-sub"
                  title={Array.isArray(g.divisiones) && g.divisiones.length > 0 ? g.divisiones.map(d => `${d.cuenta}: ${formatPesos(d.monto)}`).join(' · ') : undefined}
                >
                  {g.fecha} · {g.categoria}{g.miembro ? ` · ${g.miembro}` : ''}
                  {Array.isArray(g.divisiones) && g.divisiones.length > 0
                    ? ` · ${g.divisiones.length} cuentas (${g.divisiones.map(d => formatPesos(d.monto)).join(' + ')})`
                    : (g.cuenta ? ` · ${g.cuenta}` : '')}
                  {g.cuenta_estimada ? ' · estimada' : ''}
                </div>
              </div>
              <div className="pedido-right">
                <span className="pedido-total" style={{ color: '#791F1F' }}>{formatPesos(g.monto)}</span>
                <span className="pedido-editar-hint">Tocar para editar</span>
              </div>
            </div>
          ))
        }
      </div>
      {editando && (
        <ModalEditarGasto
          gasto={editando}
          categorias={categorias}
          presupuestos={presupuestos}
          onGuardar={async actualizado => {
            const res = await onActualizarGasto(actualizado)
            if (res?.ok) showToast('Gasto actualizado ✓')
            else showToast('Error al guardar')
            setEditando(null)
          }}
          onEliminar={async g => { await onEliminarGasto(g); setEditando(null) }}
          onCerrar={() => setEditando(null)}
        />
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Tab Finanzas ───────────────────────────────────────────────
function formatFechaISOCorta(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}/${y}`
}

function formatFechaHoraISO(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatFechaDateISO(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}/${y}`
}

function gastoDePresupuesto(p, gastos) {
  return gastos.filter(g => g.presupuesto_id === p.id).reduce((s, g) => s + (g.monto || 0), 0)
}

function estadoPresupuesto(p, gastos) {
  if (p.cerrado) return 'Cerrado'
  if (gastoDePresupuesto(p, gastos) >= p.monto_asignado) return 'Agotado'
  if (p.fecha_limite && p.fecha_limite < new Date().toISOString().slice(0, 10)) return 'Vencido'
  return 'Activo'
}

// Devuelve [{cuenta, monto}] tanto para un registro simple (una sola cuenta) como
// para uno dividido entre varias — así el resto del código no distingue los dos casos.
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

function TabFinanzas({ pedidos, esquejes, miembro, gastos, presupuestos, setPresupuestos }) {
  const [subTab, setSubTab] = useState('general')
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [intento, setIntento] = useState(0)
  const [editandoSaldo, setEditandoSaldo] = useState(null)
  const [inputSaldo, setInputSaldo] = useState('')
  const [inputCorte, setInputCorte] = useState('')
  const [toast, showToast] = useToast()


  useEffect(() => {
    async function cargar() {
      const { data: cuentasData, error: errCuentas } = await supabase.from('cuentas').select('*')
      if (cuentasData) setCuentas(cuentasData)
      setErrorCarga(Boolean(errCuentas))
      setCargando(false)
    }
    cargar()
  }, [intento])

  function reintentar() {
    setCargando(true)
    setErrorCarga(false)
    setIntento(n => n + 1)
  }

  function esDesdeCorte(fechaStr, corteISO) {
    if (!fechaStr) return true            // sin fecha (imports jun-jul): se cuentan igual
    const d = parseFechaDP(fechaStr)
    if (!d) return true                   // fecha ilegible: contarla, no perder plata
    const [y, m, dd] = (corteISO || FECHA_CORTE_DEFAULT).split('-').map(Number)
    const corte = new Date(y, m - 1, dd)  // corte como fecha LOCAL (misma base que parseFechaDP)
    return d >= corte
  }

  const resumen = useMemo(() => CUENTAS.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { nombre, saldo_inicial: 0, fecha_corte: FECHA_CORTE_DEFAULT, validado: false }
    const ingresosPedidos = pedidos.filter(p => p.pagado && esDesdeCorte(p.fecha, info.fecha_corte))
      .flatMap(p => montosPorCuenta(p, 'total')).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    const ingresosEsquejes = esquejes.filter(e => e.pagado && esDesdeCorte(e.fecha, info.fecha_corte))
      .flatMap(e => montosPorCuenta(e, 'total')).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    const egresos = gastos.filter(g => esDesdeCorte(g.fecha, info.fecha_corte))
      .flatMap(g => montosPorCuenta(g, 'monto')).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    const ingresos = ingresosPedidos + ingresosEsquejes
    const saldo = (info.saldo_inicial || 0) + ingresos - egresos
    const estimados =
      pedidos.filter(p => p.cuenta === nombre && p.cuenta_estimada).length +
      esquejes.filter(e => e.cuenta === nombre && e.cuenta_estimada).length +
      gastos.filter(g => g.cuenta === nombre && g.cuenta_estimada).length
    return { nombre, info, ingresos, egresos, saldo, estimados }
  }), [pedidos, esquejes, gastos, cuentas])

  const totalGeneral = resumen.reduce((s, r) => s + r.saldo, 0)
  const totalEstimados = resumen.reduce((s, r) => s + r.estimados, 0)

  // Registros pagados/con egreso pero sin cuenta asignada (o con una división que no suma
  // el total) no entran en ningún saldo de arriba y por eso no deben quedar invisibles —
  // se muestran aparte para que se corrijan.
  const pedidosSinCuenta = pedidos.filter(p => p.pagado && !tieneAsignacionValida(p, 'total'))
  const esquejesSinCuenta = esquejes.filter(e => e.pagado && !tieneAsignacionValida(e, 'total'))
  const gastosSinCuenta = gastos.filter(g => !tieneAsignacionValida(g, 'monto'))
  const ingresosSinCuenta = pedidosSinCuenta.reduce((s, p) => s + (p.total || 0), 0) + esquejesSinCuenta.reduce((s, e) => s + (e.total || 0), 0)
  const egresosSinCuenta = gastosSinCuenta.reduce((s, g) => s + (g.monto || 0), 0)
  const cantidadSinCuenta = pedidosSinCuenta.length + esquejesSinCuenta.length + gastosSinCuenta.length

  async function guardarSaldoInicial(nombre) {
    const valor = parseFloat(inputSaldo)
    if (isNaN(valor)) { showToast('Ingresá un número válido'); return }
    if (!inputCorte) { showToast('Elegí una fecha de corte'); return }
    const ahora = new Date().toISOString()
    const existente = cuentas.find(c => c.nombre === nombre)
    if (existente) {
      const { error } = await supabase.from('cuentas').update({ saldo_inicial: valor, fecha_corte: inputCorte, validado: true, actualizado_por: miembro || null, actualizado_en: ahora }).eq('nombre', nombre)
      if (!error) { setCuentas(prev => prev.map(c => c.nombre === nombre ? { ...c, saldo_inicial: valor, fecha_corte: inputCorte, validado: true, actualizado_por: miembro || null, actualizado_en: ahora } : c)); showToast('Saldo inicial validado ✓') }
      else showToast('Error al guardar')
    } else {
      const { data, error } = await supabase.from('cuentas').insert({ nombre, saldo_inicial: valor, fecha_corte: inputCorte, validado: true, actualizado_por: miembro || null, actualizado_en: ahora }).select().single()
      if (!error && data) { setCuentas(prev => [...prev, data]); showToast('Saldo inicial validado ✓') }
      else showToast('Error al guardar')
    }
    setEditandoSaldo(null)
    setInputSaldo('')
    setInputCorte('')
  }

  if (cargando) return <div className="content"><div className="empty-state">Cargando Finanzas...</div></div>

  if (errorCarga) {
    return (
      <div className="content">
        <div className="card" style={{ background: '#FCEBEB', borderColor: '#791F1F' }}>
          <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10 }}>
            No se pudieron cargar los datos financieros. Los saldos NO se muestran para evitar mostrar números incorrectos.
          </div>
          <button className="btn-submit" onClick={reintentar}>Reintentar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="miembro-row" style={{ marginBottom: 14 }}>
        {['general', 'Hormi 1.0', 'Hormi 2.0'].map(st => (
          <button key={st} className={`miembro-btn${subTab === st ? ' active' : ''}`} onClick={() => setSubTab(st)}>{st === 'general' ? 'General' : st}</button>
        ))}
      </div>
      {subTab !== 'general' && (
        <PanelFinanzasHormi locacion={subTab} gastos={gastos} presupuestos={presupuestos} setPresupuestos={setPresupuestos} miembro={miembro} />
      )}
      {subTab === 'general' && (
      <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Saldo por cuenta = saldo inicial + pedidos y esquejes cobrados − gastos, desde la fecha de corte de cada cuenta. Mientras el saldo inicial no esté validado con el equipo, la cifra es un <strong>movimiento neto</strong>, no el saldo real de la cuenta.
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-num" style={{ fontSize: 16, color: totalGeneral < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(totalGeneral)}</div>
          <div className="stat-lbl">Total todas las cuentas</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ color: totalEstimados > 0 ? '#854F0B' : undefined }}>{totalEstimados}</div>
          <div className="stat-lbl">Registros a revisar</div>
        </div>
      </div>
      {totalEstimados > 0 && (
        <div className="card" style={{ marginBottom: 14, background: '#FFF8ED', borderColor: '#E8C77E' }}>
          <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.5 }}>
            Hay <strong>{totalEstimados}</strong> registro(s) de junio-julio con cuenta estimada (asignada por quién cargó el pedido/gasto, no confirmada contra comprobante). Se pueden corregir abriendo cada uno desde Cosecha, Esquejes o Gastos → Lista.
          </div>
        </div>
      )}
      {cantidadSinCuenta > 0 && (
        <div className="card" style={{ marginBottom: 14, background: '#FCEBEB', borderColor: '#791F1F' }}>
          <div style={{ fontSize: 12, color: '#791F1F', lineHeight: 1.5 }}>
            <strong>Atención:</strong> hay <strong>{cantidadSinCuenta}</strong> registro(s) pagado(s)/con gasto SIN cuenta asignada o con una división de cuentas inválida, por eso <strong>no están sumados en ningún total de arriba</strong> (ingresos sin contar: {formatPesos(ingresosSinCuenta)} · gastos sin contar: {formatPesos(egresosSinCuenta)}). Corregilos desde Cosecha, Esquejes o Gastos → Lista, abriendo cada registro y eligiendo su cuenta.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {resumen.map(r => (
          <div className="card" key={r.nombre}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {r.info.validado ? 'Saldo actual' : `Movimiento neto desde ${formatFechaISOCorta(r.info.fecha_corte)}`}
                </div>
                {r.info.actualizado_por && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                    Último cambio: {r.info.actualizado_por} · {formatFechaHoraISO(r.info.actualizado_en)}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: r.saldo < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(r.saldo)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ingresos</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-dark)' }}>{formatPesos(r.ingresos)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Gastos</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#791F1F' }}>{formatPesos(r.egresos)}</span>
              </div>
            </div>
            {r.estimados > 0 && (
              <div style={{ fontSize: 11, color: '#854F0B', marginTop: 8 }}>{r.estimados} registro(s) estimado(s) en esta cuenta</div>
            )}
            {editandoSaldo === r.nombre ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <InputMonto placeholder="Saldo real validado" value={inputSaldo} onChange={setInputSaldo} permiteNegativo style={{ flex: 1 }} />
                  <input className="form-control" type="date" value={inputCorte} onChange={e => setInputCorte(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Desde esta fecha se cuentan los movimientos nuevos — todo lo anterior queda afuera del saldo (sigue disponible en Cosecha/Esquejes/Gastos).
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={() => guardarSaldoInicial(r.nombre)}>Guardar</button>
                  <button onClick={() => { setEditandoSaldo(null); setInputSaldo(''); setInputCorte('') }} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setEditandoSaldo(r.nombre); setInputSaldo(String(r.info.saldo_inicial || 0)); setInputCorte(new Date().toISOString().slice(0, 10)) }} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>
                {r.info.validado ? 'Corregir saldo validado' : 'Validar saldo inicial con el equipo'}
              </button>
            )}
          </div>
        ))}
      </div>
      {presupuestos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="form-label" style={{ marginBottom: 10, display: 'block' }}>Presupuestos — todas las locaciones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {presupuestos.map(p => {
              const gastado = gastoDePresupuesto(p, gastos)
              const restante = p.monto_asignado - gastado
              const estado = estadoPresupuesto(p, gastos)
              const colorEstado = estado === 'Vencido' || estado === 'Agotado' ? '#791F1F' : estado === 'Cerrado' ? 'var(--text-secondary)' : 'var(--green-dark)'
              return (
                <div className="card" key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {p.locacion} · asignado {formatFechaDateISO(p.fecha_asignacion)}{p.fecha_limite ? ` · límite ${formatFechaDateISO(p.fecha_limite)}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colorEstado }}>{estado}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Asignado</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{formatPesos(p.monto_asignado)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Gastado</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#791F1F' }}>{formatPesos(gastado)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Restante</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: restante < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(restante)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      </>
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function PanelFinanzasHormi({ locacion, gastos, presupuestos, setPresupuestos, miembro }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', monto_asignado: '', fecha_asignacion: new Date().toISOString().slice(0, 10), fecha_limite: '' })
  const [toast, showToast] = useToast()


  const gastosLocacion = gastos.filter(g => g.locacion === locacion)
  const totalGastos = gastosLocacion.reduce((s, g) => s + (g.monto || 0), 0)
  const categorias = CATEGORIAS_GASTOS_MAP[locacion] || CATEGORIAS_GASTOS
  const porCategoria = categorias.map(cat => ({
    cat, total: gastosLocacion.filter(g => g.categoria === cat).reduce((s, g) => s + g.monto, 0)
  })).filter(x => x.total > 0)

  const presupuestosLocacion = presupuestos.filter(p => p.locacion === locacion)

  async function guardarPresupuesto() {
    if (!form.nombre.trim() || !parseFloat(form.monto_asignado)) {
      showToast('Completá nombre y monto asignado')
      return
    }
    const nuevoPresupuesto = {
      nombre: form.nombre.trim(),
      locacion,
      monto_asignado: parseFloat(form.monto_asignado),
      fecha_asignacion: form.fecha_asignacion || new Date().toISOString().slice(0, 10),
      fecha_limite: form.fecha_limite || null,
      creado_por: miembro || null,
    }
    const { data, error } = await supabase.from('presupuestos').insert(nuevoPresupuesto).select().single()
    if (!error && data) {
      setPresupuestos(prev => [data, ...prev])
      setForm({ nombre: '', monto_asignado: '', fecha_asignacion: new Date().toISOString().slice(0, 10), fecha_limite: '' })
      setMostrarForm(false)
      showToast('Presupuesto creado ✓')
    } else showToast('Error al guardar')
  }

  async function alternarCerrado(p) {
    const { error } = await supabase.from('presupuestos').update({ cerrado: !p.cerrado }).eq('id', p.id)
    if (!error) setPresupuestos(prev => prev.map(x => x.id === p.id ? { ...x, cerrado: !p.cerrado } : x))
    else showToast('Error al guardar')
  }

  return (
    <div>
      {porCategoria.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 10 }}><span className="form-label">Gastos de {locacion}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {porCategoria.map(({ cat, total }) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{cat}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{formatPesos(total)}</span>
              </div>
            ))}
            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{formatPesos(totalGastos)}</span>
            </div>
          </div>
        </div>
      )}
      {porCategoria.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 14 }}>Todavía no hay gastos registrados en {locacion}.</div>
      )}

      <div className="form-label" style={{ marginBottom: 10, display: 'block' }}>Presupuestos de {locacion}</div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Nombre / proyecto</label>
              <input className="form-control" type="text" placeholder="Ej: LED" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Monto asignado ($)</label>
              <InputMonto value={form.monto_asignado} onChange={v => setForm(f => ({ ...f, monto_asignado: v }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha asignación</label>
              <input className="form-control" type="date" value={form.fecha_asignacion} onChange={e => setForm(f => ({ ...f, fecha_asignacion: e.target.value }))} />
            </div>
            <div className="form-group full">
              <label className="form-label">Fecha límite (opcional)</label>
              <input className="form-control" type="date" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={guardarPresupuesto} style={{ flex: 1 }}>Guardar presupuesto</button>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}
      {!mostrarForm && (
        <button className="btn-agregar-fila" onClick={() => setMostrarForm(true)} style={{ marginBottom: 14 }}>+ Nuevo presupuesto en {locacion}</button>
      )}

      {presupuestosLocacion.length === 0
        ? <div className="empty-state">Todavía no hay presupuestos en {locacion}.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {presupuestosLocacion.map(p => {
              const gastado = gastoDePresupuesto(p, gastos)
              const restante = p.monto_asignado - gastado
              const estado = estadoPresupuesto(p, gastos)
              const colorEstado = estado === 'Vencido' || estado === 'Agotado' ? '#791F1F' : estado === 'Cerrado' ? 'var(--text-secondary)' : 'var(--green-dark)'
              return (
                <div className="card" key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        asignado {formatFechaDateISO(p.fecha_asignacion)}{p.fecha_limite ? ` · límite ${formatFechaDateISO(p.fecha_limite)}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colorEstado }}>{estado}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Asignado</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{formatPesos(p.monto_asignado)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Gastado</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#791F1F' }}>{formatPesos(gastado)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Restante</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: restante < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(restante)}</div>
                    </div>
                  </div>
                  <button onClick={() => alternarCerrado(p)} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, color: p.cerrado ? 'var(--green-dark)' : '#791F1F', fontWeight: 500, cursor: 'pointer' }}>
                    {p.cerrado ? 'Reabrir presupuesto' : 'Cerrar presupuesto'}
                  </button>
                </div>
              )
            })}
          </div>
        )
      }
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function TabGastos({ miembro, gastos, presupuestos, onGuardarGasto, onActualizarGasto, onEliminarGasto }) {
  const [locacion, setLocacion] = useState('Hormi 1.0')
  const gastosFiltrados = gastos.filter(g => g.locacion === locacion)
  return (
    <div className="content">
      <div className="miembro-row">
        {['Hormi 1.0', 'Hormi 2.0'].map(loc => (
          <button key={loc} className={`miembro-btn${locacion === loc ? ' active' : ''}`} onClick={() => setLocacion(loc)}>{loc}</button>
        ))}
      </div>
      <PanelGastos
        locacion={locacion}
        gastos={gastosFiltrados}
        miembro={miembro}
        presupuestos={presupuestos}
        onNuevoGasto={onGuardarGasto}
        onActualizarGasto={onActualizarGasto}
        onEliminarGasto={onEliminarGasto}
      />
    </div>
  )
}

// ─── Tab Calendario de Cultivo ────────────────────────────────
const paramsCultivo = [
  { key: 'fertilizante', label: 'Fertilizante', placeholder: 'Ej: Calcium + Grow + PH-' },
  { key: 'ec', label: 'EC', placeholder: 'Ej: 1.4' },
  { key: 'ph', label: 'pH', placeholder: 'Ej: 6.0' },
  { key: 'maceta', label: 'Maceta', placeholder: 'Ej: 1L' },
  { key: 'luz', label: 'Intensidad lumínica', placeholder: 'Ej: 300 ppfd' },
  { key: 'temperatura', label: 'Temperatura promedio', placeholder: 'Ej: 24°C' },
  { key: 'humedad', label: 'Humedad promedio', placeholder: 'Ej: 60%' },
  { key: 'tareas', label: 'Tareas / Notas', placeholder: 'Ej: Insecticida aplicado' },
]
const cicloVacio = (tipo) => ({ nombre: '', tipo, semanaActual: 1, semanas: {} })

function SeccionCiclo({ ciclo, onChange, riegoPromedios = {} }) {
  const semana = ciclo.semanaActual
  const datos = ciclo.semanas[semana] || {}
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [toast, showToast] = useToast()
  function setParam(key, val) { onChange({ ...ciclo, semanas: { ...ciclo.semanas, [semana]: { ...datos, [key]: val } } }) }
  const color = ciclo.tipo === 'vegetativo' ? 'var(--green-dark)' : '#7B4F9E'
  const colorLight = ciclo.tipo === 'vegetativo' ? 'var(--green-light)' : '#F3EAF9'
  const colorBorder = ciclo.tipo === 'vegetativo' ? 'var(--green-border)' : '#D4B8E8'
  const tieneDatos = ciclo.semanas[semana] && Object.values(ciclo.semanas[semana]).some(v => v)

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ciclo.tipo === 'vegetativo' ? 'Vegetativo' : 'Floración'}</span>
          {editandoNombre ? (
            <input className="form-control" style={{ marginTop: 4, height: 32, fontSize: 14, fontWeight: 600 }} value={ciclo.nombre} placeholder="Nombre del ciclo..." onChange={e => onChange({ ...ciclo, nombre: e.target.value })} onBlur={() => setEditandoNombre(false)} autoFocus />
          ) : (
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, cursor: 'pointer' }} onClick={() => setEditandoNombre(true)}>
              {ciclo.nombre || <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 13 }}>Tocá para nombrar el ciclo...</span>}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, background: colorLight, borderRadius: 8, padding: '8px 12px', border: `0.5px solid ${colorBorder}` }}>
        <button onClick={() => onChange({ ...ciclo, semanaActual: Math.max(1, semana - 1) })} disabled={semana === 1} style={{ background: 'none', border: 'none', fontSize: 22, cursor: semana === 1 ? 'not-allowed' : 'pointer', color: semana === 1 ? 'var(--text-secondary)' : color, opacity: semana === 1 ? 0.4 : 1, padding: '0 8px', lineHeight: 1 }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color }}>{`Semana ${semana}`}</div>
          {tieneDatos && <div style={{ fontSize: 10, color, opacity: 0.7, marginTop: 1 }}>● datos cargados</div>}
        </div>
        <button onClick={() => onChange({ ...ciclo, semanaActual: semana + 1 })} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color, padding: '0 8px', lineHeight: 1 }}>›</button>
      </div>
      {riegoPromedios[semana] && Object.keys(riegoPromedios[semana]).length > 0 && (() => {
        const prom = riegoPromedios[semana]
        return (
          <div style={{ background: colorLight, border: `0.5px solid ${colorBorder}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Promedio riegos · Semana {semana}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
              {[['EC', prom.ec], ['pH', prom.ph], ['PPFD', prom.ppfd], ['Pulsos', prom.pulsos], ['ML', prom.ml], ['VPD', prom.vpd], ['HR', prom.hr ? prom.hr + '%' : null], ['Temp', prom.temp ? prom.temp + '°C' : null]].map(([label, val]) => val ? (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color }}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        )
      })()}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {paramsCultivo.map(p => (
          <div key={p.key} className="form-group">
            <label className="form-label">{p.label}</label>
            <input className="form-control" type="text" placeholder={p.placeholder} value={datos[p.key] || ''} onChange={e => setParam(p.key, e.target.value)} />
          </div>
        ))}
      </div>
      <button className="btn-submit" style={{ marginTop: 14, background: color }} onClick={() => showToast(`Semana ${semana} guardada ✓`, 2000)}>
        Guardar semana {semana}
      </button>
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function TabCalendario({ riegoPromediosVege, riegoPromediosFlora }) {
  const [vege, setVege] = useState(cicloVacio('vegetativo'))
  const [flora, setFlora] = useState(cicloVacio('floracion'))
  return (
    <div className="content">
      <SeccionCiclo ciclo={vege} onChange={setVege} riegoPromedios={riegoPromediosVege} />
      <SeccionCiclo ciclo={flora} onChange={setFlora} riegoPromedios={riegoPromediosFlora} />
    </div>
  )
}

// ─── Tab Riegos ───────────────────────────────────────────────
const paramsRiego = [
  { key: 'ec', label: 'EC', placeholder: 'Ej: 1.4' },
  { key: 'ph', label: 'pH', placeholder: 'Ej: 6.0' },
  { key: 'ppfd', label: 'PPFD', placeholder: 'Ej: 300' },
  { key: 'pulsos', label: 'Pulsos (cantidad)', placeholder: 'Ej: 3' },
  { key: 'tiempoPulso', label: 'Tiempo pulso', placeholder: 'Ej: 30min' },
  { key: 'ml', label: 'ML por disparo', placeholder: 'Ej: 150' },
  { key: 'vpd', label: 'VPD', placeholder: 'Ej: 1.2' },
  { key: 'hr', label: 'HR (%)', placeholder: 'Ej: 60' },
  { key: 'temp', label: 'Temperatura (°C)', placeholder: 'Ej: 24' },
  { key: 'fertilizantes', label: 'Fertilizantes', placeholder: 'Ej: Calcium + Grow' },
]
const riegoVacio = () => ({ ec: '', ph: '', ppfd: '', pulsos: '', tiempoPulso: '', ml: '', vpd: '', hr: '', temp: '', fertilizantes: '' })

function promediarRiegos(riegos) {
  if (!riegos || riegos.length === 0) return {}
  const keys = ['ec', 'ph', 'ppfd', 'pulsos', 'ml', 'vpd', 'hr', 'temp']
  const resultado = {}
  keys.forEach(k => {
    const vals = riegos.map(r => parseFloat(String(r[k] ?? '').replace(',', '.'))).filter(v => !isNaN(v))
    if (vals.length > 0) resultado[k] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  })
  ;['tiempoPulso', 'fertilizantes'].forEach(k => {
    const last = [...riegos].reverse().find(r => r[k])
    if (last) resultado[k] = last[k]
  })
  return resultado
}

function TabRiegos({ onRiegosChange }) {
  const [etapa, setEtapa] = useState('vegetativo')
  const [riegosVege, setRiegosVege] = useState([])
  const [riegosFlora, setRiegosFlora] = useState([])
  const [semanaFiltro, setSemanaFiltro] = useState(1)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ ...riegoVacio(), fecha: hoyCompleto(), semana: 1 })
  const [toast, showToast] = useToast()

  useEffect(() => {
    supabase.from('riegos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const vege = data.filter(r => r.etapa === 'vegetativo')
          const flora = data.filter(r => r.etapa === 'floracion')
          setRiegosVege(vege)
          setRiegosFlora(flora)
          ;['vegetativo', 'floracion'].forEach(et => {
            const riegos = et === 'vegetativo' ? vege : flora
            const semanas = [...new Set(riegos.map(r => r.semana))]
            const promedios = {}
            semanas.forEach(s => { promedios[s] = promediarRiegos(riegos.filter(r => r.semana === s)) })
            onRiegosChange(et, promedios)
          })
        }
      })
  }, [])

  const riegos = etapa === 'vegetativo' ? riegosVege : riegosFlora
  const setRiegos = etapa === 'vegetativo' ? setRiegosVege : setRiegosFlora
  const color = etapa === 'vegetativo' ? 'var(--green-dark)' : '#7B4F9E'
  const colorLight = etapa === 'vegetativo' ? 'var(--green-light)' : '#F3EAF9'
  const colorBorder = etapa === 'vegetativo' ? 'var(--green-border)' : '#D4B8E8'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))


  async function guardarRiego() {
    if (!form.fecha) { showToast('Completá la fecha'); return }
    const { data, error } = await supabase.from('riegos').insert({
      etapa, semana: form.semana, fecha: form.fecha,
      ec: form.ec, ph: form.ph, ppfd: form.ppfd,
      pulsos: form.pulsos, tiempo_pulso: form.tiempoPulso,
      ml: form.ml, vpd: form.vpd, hr: form.hr,
      temp: form.temp, fertilizantes: form.fertilizantes,
    }).select().single()
    if (!error && data) {
      const nuevo = { ...data, tiempoPulso: data.tiempo_pulso }
      const nuevosRiegos = [nuevo, ...riegos]
      setRiegos(nuevosRiegos)
      const semanas = [...new Set(nuevosRiegos.map(r => r.semana))]
      const promedios = {}
      semanas.forEach(s => { promedios[s] = promediarRiegos(nuevosRiegos.filter(r => r.semana === s)) })
      onRiegosChange(etapa, promedios)
      setForm({ ...riegoVacio(), fecha: hoyCompleto(), semana: form.semana })
      setMostrarForm(false)
      showToast('Riego registrado ✓')
    } else showToast('Error al guardar')
  }

  const riegosFiltrados = riegos.filter(r => r.semana === semanaFiltro)

  return (
    <div className="content">
      <div className="miembro-row">
        <button className={`miembro-btn${etapa === 'vegetativo' ? ' active' : ''}`} onClick={() => setEtapa('vegetativo')}>Vegetativo</button>
        <button className={`miembro-btn${etapa === 'floracion' ? ' active' : ''}`} style={etapa === 'floracion' ? { background: '#F3EAF9', borderColor: '#D4B8E8', color: '#7B4F9E' } : {}} onClick={() => setEtapa('floracion')}>Floración</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colorLight, borderRadius: 8, padding: '8px 12px', border: `0.5px solid ${colorBorder}` }}>
        <button onClick={() => setSemanaFiltro(s => Math.max(1, s - 1))} disabled={semanaFiltro === 1} style={{ background: 'none', border: 'none', fontSize: 22, cursor: semanaFiltro === 1 ? 'not-allowed' : 'pointer', color: semanaFiltro === 1 ? 'var(--text-secondary)' : color, opacity: semanaFiltro === 1 ? 0.4 : 1, padding: '0 8px', lineHeight: 1 }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color }}>Semana {semanaFiltro}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{riegosFiltrados.length} riego{riegosFiltrados.length !== 1 ? 's' : ''} registrado{riegosFiltrados.length !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={() => setSemanaFiltro(s => s + 1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color, padding: '0 8px', lineHeight: 1 }}>›</button>
      </div>
      {mostrarForm && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="form-label">Nuevo riego — Semana {form.semana}</span>
            <button onClick={() => setMostrarForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Semana</label>
              <input className="form-control" type="number" min="1" value={form.semana} onChange={e => set('semana', parseInt(e.target.value) || 1)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
            </div>
            {paramsRiego.map(p => (
              <div key={p.key} className="form-group">
                <label className="form-label">{p.label}</label>
                <input className="form-control" type="text" placeholder={p.placeholder} value={form[p.key]} onChange={e => set(p.key, e.target.value)} />
              </div>
            ))}
          </div>
          <button className="btn-submit" style={{ marginTop: 14, background: color }} onClick={guardarRiego}>Guardar riego</button>
        </div>
      )}
      {!mostrarForm && (
        <button className="btn-agregar-fila" onClick={() => { setForm(f => ({ ...f, semana: semanaFiltro })); setMostrarForm(true) }}>
          + Registrar riego semana {semanaFiltro}
        </button>
      )}
      <div className="pedidos-list">
        {riegosFiltrados.length === 0
          ? <div className="empty-state">No hay riegos registrados para la semana {semanaFiltro}.</div>
          : riegosFiltrados.map(r => (
            <div className="pedido-card" key={r.id} style={{ cursor: 'default' }}>
              <div>
                <div className="pedido-nombre">{r.fecha}</div>
                <div className="pedido-sub">EC {r.ec || '—'} · pH {r.ph || '—'} · {r.pulsos || '—'} pulsos · {r.ml || '—'}ml</div>
                {r.fertilizantes && <div className="pedido-sub" style={{ marginTop: 3 }}>{r.fertilizantes}</div>}
              </div>
              <div className="pedido-right">
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>VPD {r.vpd || '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.temp || '—'}°C · {r.hr || '—'}%HR</span>
              </div>
            </div>
          ))
        }
      </div>
      {riegosFiltrados.length > 0 && (() => {
        const prom = promediarRiegos(riegosFiltrados)
        return (
          <div className="card" style={{ borderColor: colorBorder, background: colorLight }}>
            <div className="form-label" style={{ marginBottom: 10 }}>Promedio semana {semanaFiltro}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              {[['EC', prom.ec], ['pH', prom.ph], ['PPFD', prom.ppfd], ['Pulsos', prom.pulsos], ['ML', prom.ml], ['VPD', prom.vpd], ['HR', prom.hr ? prom.hr + '%' : null], ['Temp', prom.temp ? prom.temp + '°C' : null]].map(([label, val]) => val ? (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color }}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        )
      })()}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Esquejes: Tab con sub-navegación ───────────────────────────
function TabEsquejes({ esquejes, stockEsquejes, miembro, onGuardarEsqueje, onActualizarEsqueje, onEliminarEsqueje }) {
  const [sub, setSub] = useState('nuevo')
  const activeStyle = { background: COLOR_ESQUEJES_LIGHT, borderColor: COLOR_ESQUEJES_BORDER, color: COLOR_ESQUEJES }
  return (
    <div className="content">
      <div className="miembro-row">
        <button className={`miembro-btn${sub === 'nuevo' ? ' active' : ''}`} style={sub === 'nuevo' ? activeStyle : {}} onClick={() => setSub('nuevo')}>Nuevo</button>
        <button className={`miembro-btn${sub === 'lista' ? ' active' : ''}`} style={sub === 'lista' ? activeStyle : {}} onClick={() => setSub('lista')}>Lista</button>
        <button className={`miembro-btn${sub === 'stock' ? ' active' : ''}`} style={sub === 'stock' ? activeStyle : {}} onClick={() => setSub('stock')}>Stock</button>
      </div>
      {sub === 'nuevo' && <FormRegistro cfg={CFG_ESQUEJES} onGuardar={onGuardarEsqueje} miembro={miembro} />}
      {sub === 'lista' && <ListaRegistros cfg={CFG_ESQUEJES} registros={esquejes} onActualizar={onActualizarEsqueje} onEliminar={onEliminarEsqueje} />}
      {sub === 'stock' && <PanelStock stock={stockEsquejes} cfg={CFG_ESQUEJES} />}
    </div>
  )
}

// ─── Login ────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function ingresar() {
    if (!email.trim() || !password) {
      setError('Completá email y contraseña')
      return
    }
    setCargando(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setCargando(false)
    if (error) {
      setError('Email o contraseña incorrectos')
    } else {
      onLogin()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') ingresar()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-dark)' }}>El Hormiguero</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Acceso para miembros</div>
        </div>

        <div className="card">
          <div className="form-group full" style={{ marginBottom: 12 }}>
            <label className="form-label">Email</label>
            <input className="form-control" type="email" autoCapitalize="none" autoCorrect="off" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKeyDown} />
          </div>
          <div className="form-group full" style={{ marginBottom: 16 }}>
            <label className="form-label">Contraseña</label>
            <input className="form-control" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKeyDown} />
          </div>
          {error && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#791F1F', textAlign: 'center' }}>
              {error}
            </div>
          )}
          <button className="btn-submit" onClick={ingresar} disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </div>

        <div style={{ marginTop: 16, background: 'var(--green-light)', border: '0.5px solid var(--green-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-dark)', marginBottom: 6 }}>¿Primera vez que entrás?</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            Usá el <strong>email</strong> y la <strong>contraseña temporal</strong> que te pasó el equipo. Una vez adentro, vas a poder cambiar tu contraseña desde el botón <strong>⚙</strong> arriba a la derecha.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Cambiar contraseña ───────────────────────────────────────
function ModalCambiarPassword({ onCerrar }) {
  useEscape(onCerrar)
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function guardar() {
    if (nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (nueva !== repetir) { setError('Las contraseñas no coinciden'); return }
    setCargando(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setCargando(false)
    if (error) {
      setError('No se pudo cambiar. Probá cerrar sesión y entrar de nuevo.')
    } else {
      setOk(true)
      setTimeout(onCerrar, 1500)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-titulo">Cambiar contraseña</div>
          <button className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        {ok ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--green-dark)', fontSize: 14, fontWeight: 500 }}>
            Contraseña actualizada ✓
          </div>
        ) : (
          <>
            <div className="form-group full" style={{ marginBottom: 12 }}>
              <label className="form-label">Nueva contraseña</label>
              <input className="form-control" type="password" placeholder="Mínimo 6 caracteres" value={nueva} onChange={e => setNueva(e.target.value)} />
            </div>
            <div className="form-group full" style={{ marginBottom: 16 }}>
              <label className="form-label">Repetir contraseña</label>
              <input className="form-control" type="password" placeholder="Repetí la nueva" value={repetir} onChange={e => setRepetir(e.target.value)} />
            </div>
            {error && (
              <div style={{ background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#791F1F', textAlign: 'center' }}>
                {error}
              </div>
            )}
            <button className="btn-submit" onClick={guardar} disabled={cargando}>
              {cargando ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Stock: ajuste atómico vía RPC (server-side, sin doble descuento ni carreras) ───
function acumularCantidades(geneticas, signo, acc) {
  for (const g of geneticas || []) {
    const cant = parseFloat(g.cantidad)
    if (!g.nombre || !isFinite(cant) || cant < 0) continue
    acc[g.nombre] = (acc[g.nombre] || 0) + signo * cant
  }
  return acc
}

async function aplicarDeltas(deltas, rpcName, setStockFn) {
  for (const [genetica, delta] of Object.entries(deltas)) {
    if (!delta) continue
    const { data, error } = await supabase.rpc(rpcName, { p_genetica: genetica, p_delta: delta })
    if (error) {
      console.error('Error ajustando stock', genetica, error)
      alert(`Se guardó el registro, pero no se pudo ajustar el stock de ${genetica}. Revisalo manualmente.`)
      continue
    }
    if (data != null) setStockFn(prev => ({ ...prev, [genetica]: Number(data) }))
  }
}

// ─── Mapeo DB (snake_case) ↔ app (camelCase) ──────────────────
// Fuente única de verdad: evita repetir metodoPago/metodo_pago y
// cuentaEstimada/cuenta_estimada por todo el código.
const conAliasPago = row => ({ ...row, metodoPago: row.metodo_pago, fechaCobro: row.fecha_cobro })

const pedidoToDB = p => ({
  fecha: p.fecha, mes: p.mes || mesActual(), miembro: p.miembro, socio: p.socio,
  geneticas: p.geneticas, precio: p.precio, total: p.total, propio: p.propio,
  pagado: p.pagado, metodo_pago: p.metodo_pago || p.metodoPago, fecha_cobro: p.fecha_cobro || p.fechaCobro,
  cuenta: p.cuenta || null, cuenta_estimada: p.cuentaEstimada ?? false, entregado: p.entregado,
  divisiones: p.divisiones || null,
})

const esquejeToDB = e => ({
  fecha: e.fecha, mes: e.mes || mesActual(), miembro: e.miembro, socio: e.socio,
  geneticas: e.geneticas, total: e.total, propio: e.propio,
  pagado: e.pagado, metodo_pago: e.metodo_pago || e.metodoPago, fecha_cobro: e.fecha_cobro || e.fechaCobro,
  cuenta: e.cuenta || null, cuenta_estimada: e.cuentaEstimada ?? false, entregado: e.entregado,
  divisiones: e.divisiones || null,
})

const gastoToDB = g => ({
  descripcion: g.descripcion, categoria: g.categoria, monto: g.monto,
  fecha: g.fecha, mes: g.mes, miembro: g.miembro || null,
  cuenta: g.cuenta || null, presupuesto_id: g.presupuesto_id || null, cuenta_estimada: false,
  divisiones: g.divisiones || null,
})

// ─── App raíz ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('cosecha')
  const [pedidos, setPedidos] = useState([])
  const [stock, setStock] = useState(STOCK_INICIAL)
  const [esquejes, setEsquejes] = useState([])
  const [gastos, setGastos] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [stockEsquejes, setStockEsquejes] = useState(STOCK_ESQUEJES_INICIAL)
  const [riegoPromediosVege, setRiegoPromediosVege] = useState({})
  const [riegoPromediosFlora, setRiegoPromediosFlora] = useState({})
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [sesion, setSesion] = useState(null)
  const [chequeandoSesion, setChequeandoSesion] = useState(true)
  const [mostrarCambiarPass, setMostrarCambiarPass] = useState(false)

  // Chequear sesión al inicio y escuchar cambios
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSesion(session)
      setChequeandoSesion(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setSesion(null)
  }

  useEffect(() => {
    if (!sesion) return
    let cancelado = false
    async function cargarDatos() {
      setCargando(true)
      setErrorCarga(false)
      const [pedidosRes, stockRes, esquejesRes, stockEsquejesRes, gastosRes, presupuestosRes] = await Promise.all([
        supabase.from('pedidos').select('*').order('created_at', { ascending: false }),
        supabase.from('stock').select('*'),
        supabase.from('esquejes').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_esquejes').select('*'),
        supabase.from('gastos').select('*').order('created_at', { ascending: false }),
        supabase.from('presupuestos').select('*').order('created_at', { ascending: false }),
      ])
      if (cancelado) return
      const conError = [pedidosRes, stockRes, esquejesRes, stockEsquejesRes, gastosRes, presupuestosRes].filter(r => r.error)
      if (conError.length > 0) {
        console.error('Error al cargar datos', conError.map(r => r.error))
        setErrorCarga(true)
        setCargando(false)
        return
      }
      setPedidos((pedidosRes.data || []).map(conAliasPago))
      if (stockRes.data) {
        const stockObj = {}
        stockRes.data.forEach(s => { stockObj[s.genetica] = s.gramos })
        setStock(stockObj)
      }
      setEsquejes((esquejesRes.data || []).map(conAliasPago))
      if (stockEsquejesRes.data) {
        const obj = {}
        stockEsquejesRes.data.forEach(s => { obj[s.genetica] = s.unidades })
        setStockEsquejes(obj)
      }
      setGastos(gastosRes.data || [])
      setPresupuestos(presupuestosRes.data || [])
      setCargando(false)
    }
    cargarDatos()
    return () => { cancelado = true }
  }, [sesion?.user?.id, intentoCarga])

  function handleRiegosChange(etapa, promedios) {
    if (etapa === 'vegetativo') setRiegoPromediosVege(promedios)
    else setRiegoPromediosFlora(promedios)
  }

  const guardarPedido = useCallback(async p => {
    const { data, error } = await supabase.from('pedidos').insert(pedidoToDB(p)).select().single()
    if (error || !data) {
      console.error('Error al guardar pedido', error)
      return { ok: false, error }
    }
    setPedidos(prev => [conAliasPago(data), ...prev])
    if (p.entregado) {
      await aplicarDeltas(acumularCantidades(p.geneticas, -1, {}), 'ajustar_stock', setStock)
    }
    return { ok: true }
  }, [])

  const actualizarPedido = useCallback(async (actualizado, anterior) => {
    const { data, error } = await supabase.from('pedidos').update(pedidoToDB(actualizado)).eq('id', actualizado.id).select().single()
    if (error || !data) {
      console.error('Error al actualizar pedido', error)
      return { ok: false, error }
    }
    setPedidos(prev => prev.map(p => p.id === data.id ? conAliasPago(data) : p))
    const deltas = {}
    if (anterior.entregado) acumularCantidades(anterior.geneticas, 1, deltas)
    if (actualizado.entregado) acumularCantidades(actualizado.geneticas, -1, deltas)
    await aplicarDeltas(deltas, 'ajustar_stock', setStock)
    return { ok: true }
  }, [])

  const eliminarPedido = useCallback(async (pedido) => {
    const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
    if (!error) {
      setPedidos(prev => prev.filter(p => p.id !== pedido.id))
      if (pedido.entregado) {
        await aplicarDeltas(acumularCantidades(pedido.geneticas, 1, {}), 'ajustar_stock', setStock)
      }
    }
  }, [])

  const guardarEsqueje = useCallback(async e => {
    const { data, error } = await supabase.from('esquejes').insert(esquejeToDB(e)).select().single()
    if (error || !data) {
      console.error('Error al guardar esqueje', error)
      return { ok: false, error }
    }
    setEsquejes(prev => [conAliasPago(data), ...prev])
    if (e.entregado) {
      await aplicarDeltas(acumularCantidades(e.geneticas, -1, {}), 'ajustar_stock_esquejes', setStockEsquejes)
    }
    return { ok: true }
  }, [])

  const actualizarEsqueje = useCallback(async (actualizado, anterior) => {
    const { data, error } = await supabase.from('esquejes').update(esquejeToDB(actualizado)).eq('id', actualizado.id).select().single()
    if (error || !data) {
      console.error('Error al actualizar esqueje', error)
      return { ok: false, error }
    }
    setEsquejes(prev => prev.map(x => x.id === data.id ? conAliasPago(data) : x))
    const deltas = {}
    if (anterior.entregado) acumularCantidades(anterior.geneticas, 1, deltas)
    if (actualizado.entregado) acumularCantidades(actualizado.geneticas, -1, deltas)
    await aplicarDeltas(deltas, 'ajustar_stock_esquejes', setStockEsquejes)
    return { ok: true }
  }, [])

  const eliminarEsqueje = useCallback(async (esqueje) => {
    const { error } = await supabase.from('esquejes').delete().eq('id', esqueje.id)
    if (!error) {
      setEsquejes(prev => prev.filter(x => x.id !== esqueje.id))
      if (esqueje.entregado) {
        await aplicarDeltas(acumularCantidades(esqueje.geneticas, 1, {}), 'ajustar_stock_esquejes', setStockEsquejes)
      }
    }
  }, [])

  const guardarGasto = useCallback(async nuevoGasto => {
    const { data, error } = await supabase.from('gastos').insert(nuevoGasto).select().single()
    if (error || !data) { console.error('Error al guardar gasto', error); return { ok: false, error } }
    setGastos(prev => [data, ...prev])
    return { ok: true }
  }, [])

  const actualizarGasto = useCallback(async gasto => {
    const { data, error } = await supabase.from('gastos').update(gastoToDB(gasto)).eq('id', gasto.id).select().single()
    if (error || !data) { console.error('Error al actualizar gasto', error); return { ok: false, error } }
    setGastos(prev => prev.map(g => g.id === data.id ? data : g))
    return { ok: true }
  }, [])

  const eliminarGasto = useCallback(async gasto => {
    const { error } = await supabase.from('gastos').delete().eq('id', gasto.id)
    if (error) { console.error('Error al eliminar gasto', error); return { ok: false, error } }
    setGastos(prev => prev.filter(g => g.id !== gasto.id))
    return { ok: true }
  }, [])

  if (chequeandoSesion) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)', fontSize: 14 }}>
      Cargando...
    </div>
  )

  if (!sesion) return <Login onLogin={() => {}} />

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)', fontSize: 14 }}>
      Cargando...
    </div>
  )

  if (errorCarga) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="card" style={{ background: '#FCEBEB', borderColor: '#791F1F' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#791F1F', marginBottom: 6 }}>No se pudieron cargar los datos</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 12 }}>
            Hubo un problema al traer pedidos, esquejes, gastos y finanzas. Para no mostrarte información incompleta no se carga nada. Revisá tu conexión y probá de nuevo.
          </div>
          <button className="btn-submit" onClick={() => setIntentoCarga(n => n + 1)}>Reintentar</button>
        </div>
      </div>
    </div>
  )

  const miembro = miembroDeSesion(sesion)

  if (!miembro) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#791F1F', marginBottom: 6 }}>Cuenta sin vincular</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            Tu email <strong>{sesion.user.email}</strong> no está mapeado a ningún miembro de la directiva. Avisale a Nacho para que lo agregue en el código antes de seguir.
          </div>
        </div>
        <button onClick={cerrarSesion} style={{ marginTop: 16, width: '100%', height: 40, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-mid)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Salir</button>
      </div>
    </div>
  )

  return (
    <div className="app">
      <div className="header">
        <div className="header-top">
          <div>
            <div className="header-title">El Hormiguero</div>
            <div className="header-sub">Registro de pedidos</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMostrarCambiarPass(true)} title="Cambiar contraseña" style={{ width: 34, height: 34, borderRadius: '50%', border: '0.5px solid var(--border-mid)', background: 'transparent', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>⚙</button>
            <button onClick={cerrarSesion} title="Cerrar sesión" style={{ height: 34, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-mid)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>Salir</button>
          </div>
        </div>
        <div className="tab-bar">
          <button className={`tab${tab === 'cosecha' ? ' active' : ''}`} onClick={() => setTab('cosecha')}>Cosecha</button>
          <button className={`tab${tab === 'esquejes' ? ' active' : ''}`} onClick={() => setTab('esquejes')}>Esquejes</button>
          <button className={`tab${tab === 'gastos' ? ' active' : ''}`} onClick={() => setTab('gastos')}>Gastos</button>
          <button className={`tab${tab === 'finanzas' ? ' active' : ''}`} onClick={() => setTab('finanzas')}>Finanzas</button>
          <button className={`tab${tab === 'riegos' ? ' active' : ''}`} onClick={() => setTab('riegos')}>Riegos</button>
          <button className={`tab${tab === 'calendario' ? ' active' : ''}`} onClick={() => setTab('calendario')}>Cultivo</button>
        </div>
      </div>
      {tab === 'cosecha' && (
        <TabCosecha
          pedidos={pedidos}
          stock={stock}
          miembro={miembro}
          onGuardarPedido={guardarPedido}
          onActualizarPedido={actualizarPedido}
          onEliminarPedido={eliminarPedido}
        />
      )}
      {tab === 'gastos' && <TabGastos miembro={miembro} gastos={gastos} presupuestos={presupuestos} onGuardarGasto={guardarGasto} onActualizarGasto={actualizarGasto} onEliminarGasto={eliminarGasto} />}
      {tab === 'finanzas' && <TabFinanzas pedidos={pedidos} esquejes={esquejes} miembro={miembro} gastos={gastos} presupuestos={presupuestos} setPresupuestos={setPresupuestos} />}
      {tab === 'esquejes' && (
        <TabEsquejes
          esquejes={esquejes}
          stockEsquejes={stockEsquejes}
          miembro={miembro}
          onGuardarEsqueje={guardarEsqueje}
          onActualizarEsqueje={actualizarEsqueje}
          onEliminarEsqueje={eliminarEsqueje}
        />
      )}
      {tab === 'riegos' && <TabRiegos onRiegosChange={handleRiegosChange} />}
      {tab === 'calendario' && <TabCalendario riegoPromediosVege={riegoPromediosVege} riegoPromediosFlora={riegoPromediosFlora} />}
      {mostrarCambiarPass && <ModalCambiarPassword onCerrar={() => setMostrarCambiarPass(false)} />}
    </div>
  )
}
