import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Landmark, Wallet, ChevronDown, ChevronUp, Target, TriangleAlert, Info, Check } from 'lucide-react'
import './App.css'
import { supabase } from './supabase'

const GENETICAS = ['OG24K', 'Choco OG', 'Z-Kiem', 'Fancy', 'Gorilla Rainbow']
const GENETICAS_ESQUEJES = ['OG24K', 'Black Domina', 'Z-Kiem', 'Fancy', 'Gorilla Rainbow', 'Dosichoc']
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
  const r = Math.round(isFinite(v) ? v : 0)
  return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('es-AR')
}

function formatDolares(n) {
  const v = Number(n)
  const r = Math.round(isFinite(v) ? v : 0)
  return (r < 0 ? '-US$' : 'US$') + Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hoyCompleto() {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

const mesActual = () => {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getFullYear()}`
}

function ordenarMesesDesc(meses) {
  return [...meses].sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number)
    const [mb, yb] = b.split('/').map(Number)
    return yb !== ya ? yb - ya : mb - ma
  })
}

const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function formatMesLabel(mesStr) {
  const [m, y] = mesStr.split('/').map(Number)
  const nombre = NOMBRES_MES[m - 1] || mesStr
  return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + y
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
const CUENTAS_DOLARES = ['NaranjaX (Dólar) - Nacho', 'NaranjaX (Dólar) - Nico', 'Lemon (Dólar) - Checho']
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
// (FormRegistro, ModalEditarRegistro, PanelStock) son únicos.
const CFG_COSECHA = {
  unidad: 'g', stockInicial: STOCK_INICIAL, stockLow: 50, rpcStock: 'ajustar_stock', geneticas: GENETICAS,
  color: 'var(--green-dark)', colorBorde: null, btnBg: null,
  nuevaFila: filaVacia, precioDefaultFila: PRECIO_DEFAULT,
  singular: 'pedido', plural: 'pedidos', labelEntregado: 'Pedido entregado', txtEliminar: 'Eliminar pedido',
  fkPagos: 'pedido_id',
}
const CFG_ESQUEJES = {
  unidad: 'u', stockInicial: STOCK_ESQUEJES_INICIAL, stockLow: 20, rpcStock: 'ajustar_stock_esquejes', geneticas: GENETICAS_ESQUEJES,
  color: COLOR_ESQUEJES, colorBorde: COLOR_ESQUEJES_BORDER, btnBg: COLOR_ESQUEJES,
  nuevaFila: filaEsquejeVacia, precioDefaultFila: '',
  singular: 'esqueje', plural: 'esquejes', labelEntregado: 'Entregado', txtEliminar: 'Eliminar',
  fkPagos: 'esqueje_id',
}

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

// ─── Historial de pagos de pedidos/esquejes — reemplaza pagado/divisiones
// como fuente de verdad acá: cada cobro es su propio evento (monto, cuenta,
// método, fecha), y el estado sale de comparar la suma contra el total. Esto
// generaliza "dividir entre cuentas" (ya no hace falta que sea el mismo día
// ni el total completo). Gastos NO usa nada de esto: sigue con
// FilasDivision/validarDivisiones/montosPorCuenta/tieneAsignacionValida.
function pagosDe(pagos, registroId, fk) {
  return (pagos || []).filter(pg => pg[fk] === registroId)
}
function totalCobrado(pagos, registroId, fk) {
  return pagosDe(pagos, registroId, fk).reduce((s, pg) => s + (parseFloat(pg.monto) || 0), 0)
}
// Mismo margen de 0.5 que validarDivisiones, para no mostrar "parcial" por un
// redondeo de centavos. 'sobrepago' es un caso particular de "ya está cubierto":
// para la proyección de Finanzas cuenta igual que 'pagado' (ver PanelFinanzasHormi).
function estadoCobro(total, cobrado) {
  if (cobrado <= 0) return 'sin-cobrar'
  if (cobrado > (total || 0) + 0.5) return 'sobrepago'
  if (cobrado + 0.5 >= (total || 0)) return 'pagado'
  return 'parcial'
}

function PagosRegistro({ registro, pagos, total, miembro, onAgregarPago, onEditarPago, onEliminarPago, fkCampo, compacto }) {
  const [formPara, setFormPara] = useState(null) // null | 'agregar' | id del pago que se está editando
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const propios = pagosDe(pagos, registro.id, fkCampo)
  const cobrado = propios.reduce((s, pg) => s + (parseFloat(pg.monto) || 0), 0)

  // Si se está editando un pago existente, ese monto no cuenta dos veces: ni para saber
  // cuánto falta (el botón "Pago total"), ni para detectar sobrepago.
  const cobradoSinEditado = (formPara && formPara !== 'agregar')
    ? cobrado - (propios.find(pg => pg.id === formPara)?.monto || 0)
    : cobrado
  const montoPagoTotal = Math.max(0, (total || 0) - cobradoSinEditado)
  const excedente = form ? (cobradoSinEditado + (parseFloat(form.monto) || 0)) - (total || 0) : 0
  const haySobrepago = excedente > 0.5
  // El check "Pago total" no es un flag aparte: refleja si el monto cargado ahora mismo
  // coincide con lo que falta cobrar. Tildarlo lo completa; destildarlo lo vacía de nuevo.
  const esPagoTotal = montoPagoTotal > 0 && form && form.monto === String(montoPagoTotal)

  function abrirAgregar() {
    setForm({ monto: '', metodoPago: 'Transferencia', cuenta: '', fecha: new Date().toISOString().slice(0, 10) })
    setError('')
    setFormPara('agregar')
  }
  function abrirEditar(pg) {
    setForm({ monto: String(pg.monto), metodoPago: pg.metodo_pago || 'Transferencia', cuenta: pg.cuenta || '', fecha: pg.fecha || new Date().toISOString().slice(0, 10) })
    setError('')
    setFormPara(pg.id)
  }
  function cerrar() { setFormPara(null); setForm(null); setError('') }
  function setMetodoPago(val) {
    setForm(f => ({ ...f, metodoPago: val, cuenta: val === 'Efectivo' ? CUENTA_EFECTIVO : (f.cuenta === CUENTA_EFECTIVO ? '' : f.cuenta) }))
  }
  function marcarPagoTotal(marcar) {
    setForm(f => ({ ...f, monto: marcar ? String(montoPagoTotal) : '' }))
  }

  async function confirmar() {
    const monto = parseFloat(form.monto)
    if (!monto || monto <= 0) { setError('Ingresá un monto válido.'); return }
    if (!form.cuenta) { setError('Elegí una cuenta: si no, este pago no se va a reflejar en Finanzas.'); return }
    setGuardando(true)
    // cuenta_estimada siempre se limpia al guardar: tanto al cargar un pago nuevo (nunca es
    // estimado, se elige la cuenta a mano) como al editar uno existente (corregir la cuenta
    // es justamente lo que saca al registro de "a revisar").
    const payload = { monto, metodo_pago: form.metodoPago, cuenta: form.cuenta, fecha: form.fecha, cuenta_estimada: false }
    const res = formPara === 'agregar'
      ? await onAgregarPago(registro, { ...payload, creado_por: miembro || null })
      : await onEditarPago(formPara, payload)
    setGuardando(false)
    if (!res?.ok) { setError('No se pudo guardar. Intentá de nuevo.'); return }
    cerrar()
  }

  const camposForm = form && (
    <div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Monto ($)</label>
          {montoPagoTotal > 0 && (
            <button
              type="button"
              onClick={() => marcarPagoTotal(!esPagoTotal)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '2px 0 6px', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{
                width: 17, height: 17, borderRadius: 4, flexShrink: 0,
                border: `1.5px solid ${esPagoTotal ? 'var(--green-dark)' : 'var(--border-mid)'}`,
                background: esPagoTotal ? 'var(--green-dark)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, border-color 0.15s',
              }}>
                {esPagoTotal && <Check size={12} color="white" strokeWidth={3} />}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Pago total <span style={{ color: 'var(--text-secondary)' }}>({formatPesos(montoPagoTotal)})</span></span>
            </button>
          )}
          <InputMonto value={form.monto} onChange={v => setForm(f => ({ ...f, monto: v }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Método</label>
          <select className="form-control" value={form.metodoPago} onChange={e => setMetodoPago(e.target.value)}>
            <option>Transferencia</option>
            <option>Efectivo</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Cuenta</label>
          <select className="form-control" value={form.cuenta} disabled={form.metodoPago === 'Efectivo'} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {(form.metodoPago === 'Efectivo' ? [CUENTA_EFECTIVO] : CUENTAS_BANCARIAS).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input className="form-control" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
        </div>
      </div>
      {haySobrepago && <div style={{ fontSize: 11, color: '#791F1F', marginTop: 6 }}>⚠ Este cobro deja {formatPesos(excedente)} por encima del total del {registro.propio ? 'registro' : 'pedido'}.</div>}
      {error && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-submit" onClick={confirmar} disabled={guardando} style={{ flex: 1 }}>{formPara === 'agregar' ? 'Guardar cobro' : 'Guardar cambios'}</button>
        <button onClick={cerrar} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div onClick={e => e.stopPropagation()}>
      {!compacto && propios.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="form-label">Historial de pagos</div>
          {propios.map(pg => (
            formPara === pg.id ? (
              <div key={pg.id} style={{ padding: '4px 0 8px', borderBottom: '0.5px dashed var(--border)' }}>{camposForm}</div>
            ) : (
              <div key={pg.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {formatFechaISOCorta(pg.fecha)} · <strong style={{ color: 'var(--text-primary)' }}>{formatPesos(pg.monto)}</strong>{pg.cuenta ? ` · ${pg.cuenta}` : ' · sin cuenta'}{pg.cuenta_estimada ? <span style={{ color: '#854F0B' }}> · estimada</span> : null}
                </span>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => abrirEditar(pg)} style={btnLinkStyle('var(--text-secondary)')}>Editar</button>
                  <button onClick={() => onEliminarPago(pg.id)} style={{ ...btnLinkStyle('#791F1F'), fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              </div>
            )
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{formatPesos(cobrado)} de {formatPesos(total)} cobrado</div>
        </div>
      )}

      {formPara === null && (
        <button onClick={abrirAgregar} style={{ ...btnLinkStyle('var(--green-dark)'), marginTop: compacto ? 0 : 10 }}>+ Registrar cobro</button>
      )}
      {formPara === 'agregar' && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: compacto ? undefined : '0.5px solid var(--border)' }}>{camposForm}</div>
      )}
    </div>
  )
}

// ─── Modal edición completa (genérico: pedido o esqueje) ───────
function ModalEditarRegistro({ cfg, registro, pagos, miembro, onAgregarPago, onEditarPago, onEliminarPago, onGuardar, onEliminar, onCerrar }) {
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
    entregado: registro.entregado,
  })
  const [confirmando, setConfirmando] = useState(false)
  const [confirmarTotal, setConfirmarTotal] = useState(false)
  const [errorMonto, setErrorMonto] = useState('')
  const [errorCampos, setErrorCampos] = useState('')

  const tienePagos = pagosDe(pagos, registro.id, cfg.fkPagos).length > 0

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const total = form.propio ? 0 : form.filas.reduce((s, f) => {
    const precioFila = tienePrecioPorFila ? (parseFloat(f.precio) || 0) : (parseFloat(form.precio) || 0)
    return s + (parseFloat(f.cantidad) || 0) * precioFila
  }, 0)
  // Pedidos migrados del historial (sin precio por genética) guardan un total real que no
  // necesariamente coincide con cantidad × precio único — recalcular y pisarlo sin avisar
  // puede cambiar plata real sin que nadie se dé cuenta. Ver auditoria-salud.md punto 1.
  const totalDifiere = !form.propio && !tienePrecioPorFila && Math.abs(total - (registro.total || 0)) >= 1

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() { set('filas', [...form.filas, { id: Math.random(), nombre: '', cantidad: '', precio: tienePrecioPorFila ? cfg.precioDefaultFila : '' }]) }
  function eliminarFila(id) { if (form.filas.length > 1) set('filas', form.filas.filter(f => f.id !== id)) }
  function handlePropio(val) { setForm(f => ({ ...f, propio: val, precio: val ? 0 : PRECIO_DEFAULT })) }

  function guardar(confirmarCambioTotal = false) {
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if (!form.socio.trim() || filasValidas.length === 0 || sinCantidad) {
      setErrorCampos('Completá socio, genética y cantidad.')
      return
    }
    setErrorCampos('')
    if (!form.propio && total <= 0) { setErrorMonto('El total no puede ser $0 — revisá el precio cargado.'); return }
    setErrorMonto('')
    if (totalDifiere && !confirmarCambioTotal) { setConfirmarTotal(true); return }
    const geneticas = filasValidas.map(f => tienePrecioPorFila
      ? { nombre: f.nombre, cantidad: f.cantidad, precio: f.precio }
      : { nombre: f.nombre, cantidad: f.cantidad })
    let mes = form.mes
    const partes = form.fecha.split('/')
    if (partes.length === 3) mes = `${parseInt(partes[1])}/${partes[2]}`
    onGuardar({ ...registro, ...form, mes, geneticas, total, precio: form.precio })
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
                  {cfg.geneticas.map(g => <option key={g} value={g}>{g}</option>)}
                  {fila.nombre && !cfg.geneticas.includes(fila.nombre) && <option value={fila.nombre}>{fila.nombre} (fuera de catálogo)</option>}
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
        {errorMonto && (
          <div style={{ fontSize: 12, color: '#791F1F', background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
            {errorMonto}
          </div>
        )}
        {totalDifiere && (
          <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', border: '0.5px solid #E8C77E', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
            ⚠ Este {cfg.singular} es histórico (sin precio por genética) y el total no coincide con precio × cantidad. Si guardás, el total pasa de {formatPesos(registro.total)} a {formatPesos(total)}.
            {confirmarTotal && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => guardar(true)} style={{ flex: 1, padding: '7px', background: '#854F0B', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sí, actualizar el total</button>
                <button onClick={() => setConfirmarTotal(false)} style={{ flex: 1, padding: '7px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
              </div>
            )}
          </div>
        )}
        <div className="toggle-group">
          <div className="toggle-row">
            <span className="toggle-label">Consumo propio</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.propio} disabled={tienePagos} onChange={e => handlePropio(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
          {tienePagos && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: -6 }}>Ya tiene pagos registrados — no se puede marcar como consumo propio.</div>}
          <div className="toggle-row">
            <span className="toggle-label">{cfg.labelEntregado}</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.entregado} onChange={e => set('entregado', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
        {!form.propio && (
          <PagosRegistro registro={registro} pagos={pagos} total={total} miembro={miembro} onAgregarPago={onAgregarPago} onEditarPago={onEditarPago} onEliminarPago={onEliminarPago} fkCampo={cfg.fkPagos} compacto={false} />
        )}
        {errorCampos && (
          <div style={{ fontSize: 12, color: '#791F1F', background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginTop: 16 }}>
            {errorCampos}
          </div>
        )}
        <button className="btn-submit" style={{ marginTop: 16, ...(cfg.btnBg ? { background: cfg.btnBg } : {}) }} onClick={() => guardar()}>Guardar cambios</button>
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
  const [errorCampos, setErrorCampos] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const presupuestosDisponibles = (presupuestos || []).filter(p => p.locacion === gasto.locacion && (!p.cerrado || p.id === gasto.presupuesto_id))

  function activarDivision() {
    const montoTotal = parseFloat(form.monto)
    setForm(f => ({ ...f, dividido: true, divisiones: f.divisiones.length ? f.divisiones : [{ id: Math.random(), monto: montoTotal ? String(montoTotal) : '', cuenta: f.cuenta }] }))
  }
  function cancelarDivision() { setForm(f => ({ ...f, dividido: false })); setErrorCuenta('') }

  function guardar() {
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto)) {
      setErrorCampos('Completá descripción, categoría y monto.')
      return
    }
    setErrorCampos('')
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
          {presupuestosDisponibles.length > 0 && (
            <div className="form-group full">
              <label className="form-label">Presupuesto</label>
              <div className="miembro-row" style={{ marginBottom: 0 }}>
                <button type="button" className={`miembro-btn${!form.presupuesto_id ? ' active' : ''}`} onClick={() => set('presupuesto_id', '')}>Ninguno</button>
                {presupuestosDisponibles.map(p => (
                  <button type="button" key={p.id} className={`miembro-btn${String(form.presupuesto_id) === String(p.id) ? ' active' : ''}`} onClick={() => set('presupuesto_id', p.id)}>{p.nombre}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {errorCampos && (
          <div style={{ fontSize: 12, color: '#791F1F', background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginTop: 16 }}>
            {errorCampos}
          </div>
        )}
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
function FormRegistro({ cfg, onGuardar, onAgregarPago, miembro }) {
  const initial = () => ({
    socio: '', propio: false, entregado: false, filas: [cfg.nuevaFila()],
    cobradoAhora: false, montoPago: '', metodoPago: 'Transferencia', cuenta: '', fechaPago: new Date().toISOString().slice(0, 10),
  })
  const [form, setForm] = useState(initial)
  const [toast, showToast] = useToast()

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const total = form.propio ? 0 : form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0) * (parseFloat(f.precio) || 0), 0)

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() { set('filas', [...form.filas, cfg.nuevaFila()]) }
  function eliminarFila(id) { if (form.filas.length === 1) return; set('filas', form.filas.filter(f => f.id !== id)) }
  function handlePropio(val) { setForm(f => ({ ...f, propio: val, cobradoAhora: val ? false : f.cobradoAhora })) }
  function handleCobradoAhora(val) { setForm(f => ({ ...f, cobradoAhora: val, montoPago: val ? (total ? String(total) : '') : '' })) }
  function handleMetodoPago(val) { setForm(f => ({ ...f, metodoPago: val, cuenta: val === 'Efectivo' ? CUENTA_EFECTIVO : (f.cuenta === CUENTA_EFECTIVO ? '' : f.cuenta) })) }

  async function guardar() {
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if (!form.socio.trim() || filasValidas.length === 0 || sinCantidad) {
      showToast('Completá socio, genética y cantidad')
      return
    }
    if (!form.propio && total <= 0) {
      showToast('El total no puede ser $0 — revisá el precio cargado')
      return
    }
    const montoPago = parseFloat(form.montoPago)
    if (form.cobradoAhora && (!montoPago || montoPago <= 0)) {
      showToast('Ingresá un monto de cobro válido')
      return
    }
    if (form.cobradoAhora && !form.cuenta) {
      showToast('Elegí una cuenta para el cobro')
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
      entregado: form.entregado,
    }
    const res = await onGuardar(registro)
    if (!res?.ok) {
      showToast('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      return
    }
    if (form.cobradoAhora && res.data) {
      await onAgregarPago(res.data, { monto: montoPago, metodo_pago: form.metodoPago, cuenta: form.cuenta, fecha: form.fechaPago, cuenta_estimada: false, creado_por: miembro || null })
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
                    {cfg.geneticas.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input className="form-control fila-cantidad" type="number" placeholder={cfg.unidad} min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                  <InputMonto className="form-control fila-cantidad" placeholder={`$/${cfg.unidad}`} value={fila.precio} disabled={form.propio} onChange={v => setFila(fila.id, 'precio', v)} />
                  {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
                </div>
              ))}
            </div>
            <button className="btn-agregar-fila" onClick={agregarFila}>+ Agregar genética al {cfg.singular}</button>
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
                <span className="toggle-label">Cobrado en el momento</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.cobradoAhora} onChange={e => handleCobradoAhora(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
              {form.cobradoAhora && (
                <div className="pago-extra">
                  <div className="form-group">
                    <label className="form-label">Monto cobrado ($)</label>
                    <InputMonto value={form.montoPago} onChange={v => set('montoPago', v)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Método</label>
                    <select className="form-control" value={form.metodoPago} onChange={e => handleMetodoPago(e.target.value)}>
                      <option>Transferencia</option>
                      <option>Efectivo</option>
                    </select>
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Cuenta</label>
                    <select className="form-control" value={form.cuenta} disabled={form.metodoPago === 'Efectivo'} onChange={e => set('cuenta', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {(form.metodoPago === 'Efectivo' ? [CUENTA_EFECTIVO] : CUENTAS_BANCARIAS).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Fecha de cobro</label>
                    <input className="form-control" type="date" value={form.fechaPago} onChange={e => set('fechaPago', e.target.value)} />
                  </div>
                  {total > 0 && (parseFloat(form.montoPago) || 0) > 0 && (parseFloat(form.montoPago) || 0) + 0.5 < total && (
                    <div className="form-group full" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Queda un saldo pendiente de {formatPesos(total - (parseFloat(form.montoPago) || 0))} — vas a poder registrarlo después desde la lista de {cfg.plural}.
                    </div>
                  )}
                  {total > 0 && (parseFloat(form.montoPago) || 0) > total + 0.5 && (
                    <div className="form-group full" style={{ fontSize: 11, color: '#791F1F' }}>
                      ⚠ Este cobro deja {formatPesos((parseFloat(form.montoPago) || 0) - total)} por encima del total del {cfg.singular}.
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

// ─── Lista de registros (genérico: pedidos o esquejes), agrupada por mes
// en acordeón. Mismo patrón que Gastos, pero acá todos los meses arrancan
// cerrados (ni siquiera el actual se auto-abre): el usuario elige qué
// mes abrir en vez de ver el mes en curso expandido de entrada.
function ListaRegistrosPorMes({ cfg, registros, onActualizar, onEliminar, pagos, miembro, onAgregarPago, onEditarPago, onEliminarPago, target }) {
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [mesesAbiertos, setMesesAbiertos] = useState(() => target ? new Set([target.mes]) : new Set())
  const [editando, setEditando] = useState(() => target ? (registros.find(r => r.id === target.id) || null) : null)

  function toggleMes(mes) {
    setMesesAbiertos(prev => {
      const next = new Set(prev)
      next.has(mes) ? next.delete(mes) : next.add(mes)
      return next
    })
  }

  function estadoDe(r) {
    return r.propio ? 'propio' : estadoCobro(r.total, totalCobrado(pagos, r.id, cfg.fkPagos))
  }

  const filtrados = registros.filter(r => {
    if (filtroEstado === 'sin-entregar') return !r.entregado
    if (filtroEstado === 'sin-cobrar') return estadoDe(r) === 'sin-cobrar'
    if (filtroEstado === 'parcial') return estadoDe(r) === 'parcial'
    return true
  })

  const totalVendido = filtrados.filter(r => !r.propio).reduce((s, r) => s + (r.total || 0), 0)
  const sinEntregar = filtrados.filter(r => !r.entregado).length
  const meses = ordenarMesesDesc([...new Set(filtrados.map(r => r.mes).filter(Boolean))])

  return (
    <div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-num">{filtrados.length}</div><div className="stat-lbl">{cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}</div></div>
        <div className="stat-card"><div className="stat-num" style={{ fontSize: 16 }}>{formatPesos(totalVendido)}</div><div className="stat-lbl">Vendido</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: sinEntregar > 0 ? '#854F0B' : undefined }}>{sinEntregar}</div><div className="stat-lbl">Sin entregar</div></div>
      </div>
      <div className="filtros-row">
        {[['sin-entregar', 'Sin entregar'], ['sin-cobrar', 'Sin cobrar'], ['parcial', 'Parcial'], ['todos', 'Todos']].map(([key, label]) => (
          <button key={key} className={`filtro-btn${filtroEstado === key ? ' active' : ''}`} onClick={() => setFiltroEstado(key)}>{label}</button>
        ))}
      </div>
      <div className="pedidos-list">
        {filtrados.length === 0
          ? <div className="empty-state">No hay {cfg.plural} para mostrar.</div>
          : meses.map(mes => {
            const delMes = filtrados.filter(r => r.mes === mes)
            const subtotalMes = delMes.filter(r => !r.propio).reduce((s, r) => s + (r.total || 0), 0)
            const abierto = mesesAbiertos.has(mes)
            return (
              <div key={mes}>
                <div className="pedido-card" onClick={() => toggleMes(mes)} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="pedido-nombre">{formatMesLabel(mes)}</div>
                    <div className="pedido-sub">{delMes.length} {delMes.length === 1 ? cfg.singular : cfg.plural}</div>
                  </div>
                  <div className="pedido-right">
                    <span className="pedido-total">{formatPesos(subtotalMes)}</span>
                    <span className="pedido-editar-hint">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
                  </div>
                </div>
                {abierto && (
                  <div className="pedidos-list" style={{ marginTop: 8, marginLeft: 12 }}>
                    {delMes.map(r => {
                      const pagosDelRegistro = pagosDe(pagos, r.id, cfg.fkPagos)
                      const cobrado = pagosDelRegistro.reduce((s, pg) => s + (parseFloat(pg.monto) || 0), 0)
                      const estado = estadoDe(r)
                      return (
                        <div className="pedido-card" key={r.id} onClick={() => setEditando(r)} style={{ cursor: 'pointer' }}>
                          <div>
                            <div className="pedido-nombre">{r.socio}</div>
                            <div className="pedido-sub">{r.geneticas.map(g => `${g.nombre} ${g.cantidad}${cfg.unidad}`).join(' · ')} · {r.fecha} · {r.miembro}</div>
                            <div className="pedido-badges">
                              <span className={`badge ${r.entregado ? 'badge-entregado' : 'badge-no-entregado'}`}>{r.entregado ? 'Entregado' : 'No entregado'}</span>
                              {r.propio
                                ? <span className="badge badge-propio">Consumo propio</span>
                                : estado === 'sobrepago'
                                  ? <span className="badge badge-sobrepago">⚠ Sobrepago: +{formatPesos(cobrado - r.total)}</span>
                                  : estado === 'pagado'
                                    ? <span className="badge badge-pagado">Pagado</span>
                                    : estado === 'parcial'
                                      ? <span className="badge badge-parcial">Parcial: {formatPesos(cobrado)} de {formatPesos(r.total)}</span>
                                      : <span className="badge badge-sin-cobrar">Sin cobrar</span>
                              }
                            </div>
                          </div>
                          <div className="pedido-right">
                            <span className="pedido-total">{r.propio ? '—' : formatPesos(r.total)}</span>
                            {cobrado > 0 && (
                              <span
                                className="pedido-metodo"
                                title={pagosDelRegistro.map(pg => `${formatFechaISOCorta(pg.fecha)} · ${pg.cuenta || 'sin cuenta'}: ${formatPesos(pg.monto)}`).join(' · ')}
                              >
                                {pagosDelRegistro.length} pago{pagosDelRegistro.length !== 1 ? 's' : ''} ({formatPesos(cobrado)} de {formatPesos(r.total)})
                              </span>
                            )}
                            <span className="pedido-editar-hint">Tocar para editar</span>
                          </div>
                          {!r.propio && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <PagosRegistro registro={r} pagos={pagos} total={r.total} miembro={miembro} onAgregarPago={onAgregarPago} onEditarPago={onEditarPago} onEliminarPago={onEliminarPago} fkCampo={cfg.fkPagos} compacto />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        }
      </div>
      {editando && (
        <ModalEditarRegistro
          cfg={cfg}
          registro={editando}
          pagos={pagos}
          miembro={miembro}
          onAgregarPago={onAgregarPago}
          onEditarPago={onEditarPago}
          onEliminarPago={onEliminarPago}
          onGuardar={actualizado => { onActualizar(actualizado, editando); setEditando(null) }}
          onEliminar={r => { onEliminar(r, editando); setEditando(null) }}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

// ─── Panel de Stock (genérico: producción o esquejes) ─────────
// Input numérico que edita un valor de stock in situ: mantiene un buffer de
// texto propio mientras se escribe y confirma (blur/Enter) contra el valor
// real recibido por props, para no pisar lo que el usuario está tipeando.
function CampoStockEditable({ valor, color, onGuardar }) {
  const [texto, setTexto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const mostrado = texto !== null ? texto : String(valor)

  async function confirmar(valorStr) {
    setTexto(null)
    const parsed = parseFloat(valorStr)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed === valor) return
    setGuardando(true)
    await onGuardar(parsed)
    setGuardando(false)
  }

  return (
    <input
      className="form-control fila-cantidad"
      type="number" min="0" inputMode="decimal"
      style={{ color, fontWeight: 600, opacity: guardando ? 0.5 : 1 }}
      value={mostrado}
      disabled={guardando}
      onChange={e => setTexto(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={e => confirmar(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
    />
  )
}

function PanelStock({ stock, inicial, cfg, ajustesFallidos, onEditar, onEditarInicial }) {
  const [toast, showToast] = useToast()
  const totalActual = cfg.geneticas.reduce((s, g) => s + (stock[g] ?? 0), 0)
  const totalInicial = cfg.geneticas.reduce((s, g) => s + (inicial[g] ?? cfg.stockInicial[g] ?? 0), 0)
  const fallidos = (ajustesFallidos || []).filter(a => a.rpc_name === cfg.rpcStock && !a.resuelto)

  async function guardarActual(g, nuevoValor) {
    const res = await onEditar(g, nuevoValor)
    showToast(res?.ok === false ? `No se pudo actualizar ${g}` : `${g}: stock actualizado`)
  }

  async function guardarInicial(g, nuevoValor) {
    const res = await onEditarInicial(g, nuevoValor)
    showToast(res?.ok === false ? `No se pudo actualizar el inicial de ${g}` : `${g}: inicial actualizado`)
  }

  return (
    <div>
      {fallidos.length > 0 && (
        <div style={{ fontSize: 12, color: '#791F1F', background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          ⚠ {fallidos.length} ajuste(s) de stock fallaron y no se aplicaron: {fallidos.map(a => `${a.genetica} (${a.delta > 0 ? '+' : ''}${a.delta})`).join(', ')}. Corregí el stock manualmente y marcá el registro como resuelto en Supabase (tabla <code>stock_ajustes_fallidos</code>).
        </div>
      )}
      <div className="card" style={{ marginBottom: 0, ...(cfg.colorBorde ? { borderColor: cfg.colorBorde } : {}) }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center', marginBottom: 14 }}>
          <span className="form-label">Genética</span>
          <span className="form-label">Inicial</span>
          <span className="form-label">Actual</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cfg.geneticas.map(g => {
            const cant = stock[g] ?? 0
            const inicialValor = inicial[g] ?? cfg.stockInicial[g] ?? 0
            const pct = inicialValor > 0 ? Math.max(0, Math.min(100, (cant / inicialValor) * 100)) : 0
            const color = cant === 0 ? '#791F1F' : cant < cfg.stockLow ? '#854F0B' : cfg.color
            return (
              <div key={g}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{g}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CampoStockEditable valor={inicialValor} color="var(--text-secondary)" onGuardar={v => guardarInicial(g, v)} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cfg.unidad}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CampoStockEditable valor={cant} color={color} onGuardar={v => guardarActual(g, v)} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cfg.unidad}</span>
                  </span>
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
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Panel genérico Cosecha/Esquejes: una sola página que despliega en
// orden 1) el registro de un pedido nuevo (siempre visible), 2) el stock
// disponible por genética (colapsado, se abre con un click, igual que un
// mes en la lista de abajo) y 3) los pedidos registrados mes a mes (el
// acordeón que ya existe, con cada mes oculto hasta que se lo abre).
function PanelDominio({ cfg, registros, miembro, onGuardar, onActualizar, onEliminar, stock, stockInicial, ajustesFallidos, onEditarStock, onEditarInicial, pagos, onAgregarPago, onEditarPago, onEliminarPago, target }) {
  const [stockAbierto, setStockAbierto] = useState(false)
  const seccionTitulo = { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }
  const plural = cfg.plural[0].toUpperCase() + cfg.plural.slice(1)
  return (
    <div>
      <div style={seccionTitulo}>Registro de nuevo {cfg.singular}</div>
      <FormRegistro cfg={cfg} onGuardar={onGuardar} miembro={miembro} onAgregarPago={onAgregarPago} />

      <div style={{ marginTop: 18 }}>
        <div className="pedido-card" onClick={() => setStockAbierto(o => !o)} style={{ cursor: 'pointer' }}>
          <div>
            <div className="pedido-nombre">Stock disponible por genética</div>
            <div className="pedido-sub">{cfg.geneticas.length} genéticas</div>
          </div>
          <div className="pedido-right">
            <span className="pedido-editar-hint">{stockAbierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
          </div>
        </div>
        {stockAbierto && (
          <div style={{ marginTop: 8 }}>
            <PanelStock stock={stock} inicial={stockInicial} cfg={cfg} ajustesFallidos={ajustesFallidos} onEditar={onEditarStock} onEditarInicial={onEditarInicial} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={seccionTitulo}>{plural} registrados</div>
        <ListaRegistrosPorMes cfg={cfg} registros={registros} onActualizar={onActualizar} onEliminar={onEliminar} pagos={pagos} miembro={miembro} onAgregarPago={onAgregarPago} onEditarPago={onEditarPago} onEliminarPago={onEliminarPago} target={target} />
      </div>
    </div>
  )
}

// ─── Tab Pedidos: agrupa Cosecha y Esquejes, cada uno con su PanelDominio ──
function TabPedidos({
  pedidos, stock, stockInicial, onGuardarPedido, onActualizarPedido, onEliminarPedido,
  esquejes, stockEsquejes, stockEsquejesInicial, onGuardarEsqueje, onActualizarEsqueje, onEliminarEsqueje,
  miembro, ajustesFallidos,
  onEditarStock, onEditarStockEsquejes, onEditarInicial, onEditarInicialEsquejes,
  pedidoPagos, esquejePagos, onAgregarPagoPedido, onEditarPagoPedido, onEliminarPagoPedido, onAgregarPagoEsqueje, onEditarPagoEsqueje, onEliminarPagoEsqueje,
  target,
}) {
  const [tipo, setTipo] = useState(() => target?.tipoRegistro || 'cosecha')
  const cfg = tipo === 'cosecha' ? CFG_COSECHA : CFG_ESQUEJES
  const activeStyle = tipo === 'esquejes' ? { background: COLOR_ESQUEJES_LIGHT, borderColor: COLOR_ESQUEJES_BORDER, color: COLOR_ESQUEJES } : {}
  return (
    <div className="content">
      <div className="miembro-row">
        <button className={`miembro-btn${tipo === 'cosecha' ? ' active' : ''}`} onClick={() => setTipo('cosecha')}>Cosecha</button>
        <button className={`miembro-btn${tipo === 'esquejes' ? ' active' : ''}`} style={tipo === 'esquejes' ? activeStyle : {}} onClick={() => setTipo('esquejes')}>Esquejes</button>
      </div>
      <PanelDominio
        cfg={cfg}
        registros={tipo === 'cosecha' ? pedidos : esquejes}
        miembro={miembro}
        onGuardar={tipo === 'cosecha' ? onGuardarPedido : onGuardarEsqueje}
        onActualizar={tipo === 'cosecha' ? onActualizarPedido : onActualizarEsqueje}
        onEliminar={tipo === 'cosecha' ? onEliminarPedido : onEliminarEsqueje}
        stock={tipo === 'cosecha' ? stock : stockEsquejes}
        stockInicial={tipo === 'cosecha' ? stockInicial : stockEsquejesInicial}
        ajustesFallidos={ajustesFallidos}
        onEditarStock={tipo === 'cosecha' ? onEditarStock : onEditarStockEsquejes}
        onEditarInicial={tipo === 'cosecha' ? onEditarInicial : onEditarInicialEsquejes}
        pagos={tipo === 'cosecha' ? pedidoPagos : esquejePagos}
        onAgregarPago={tipo === 'cosecha' ? onAgregarPagoPedido : onAgregarPagoEsqueje}
        onEditarPago={tipo === 'cosecha' ? onEditarPagoPedido : onEditarPagoEsqueje}
        onEliminarPago={tipo === 'cosecha' ? onEliminarPagoPedido : onEliminarPagoEsqueje}
        target={target}
      />
    </div>
  )
}

// ─── Tab Gastos ───────────────────────────────────────────────
function PanelGastos({ locacion, gastos, miembro, presupuestos, onNuevoGasto, onActualizarGasto, onEliminarGasto, target }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ descripcion: '', categoria: '', monto: '', fecha: '', cuenta: '', presupuesto_id: '', dividido: false, divisiones: [] })
  const [toast, showToast] = useToast()
  const [filtrocat, setFiltrocat] = useState('todas')
  const [editando, setEditando] = useState(() => target ? (gastos.find(g => g.id === target.id) || null) : null)
  const [mesesAbiertos, setMesesAbiertos] = useState(() => target ? new Set([target.mes]) : new Set())
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  function toggleMes(mes) {
    setMesesAbiertos(prev => {
      const next = new Set(prev)
      next.has(mes) ? next.delete(mes) : next.add(mes)
      return next
    })
  }
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

  const filtrados = gastos.filter(g => filtrocat === 'todas' || g.categoria === filtrocat)

  const totalFiltrado = filtrados.reduce((s, g) => s + g.monto, 0)
  const meses = [...new Set(filtrados.map(g => g.mes).filter(Boolean))].sort((a, b) => {
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
        <select className="form-control" style={{ height: 34 }} value={filtrocat} onChange={e => setFiltrocat(e.target.value)}>
          <option value="todas">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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
            {presupuestosActivos.length > 0 && (
              <div className="form-group full">
                <label className="form-label">Presupuesto</label>
                <div className="miembro-row" style={{ marginBottom: 0 }}>
                  <button type="button" className={`miembro-btn${!form.presupuesto_id ? ' active' : ''}`} onClick={() => set('presupuesto_id', '')}>Ninguno</button>
                  {presupuestosActivos.map(p => (
                    <button type="button" key={p.id} className={`miembro-btn${String(form.presupuesto_id) === String(p.id) ? ' active' : ''}`} onClick={() => set('presupuesto_id', p.id)}>{p.nombre}</button>
                  ))}
                </div>
              </div>
            )}
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
          : meses.map(mes => {
            const gastosDelMes = filtrados.filter(g => g.mes === mes)
            const subtotalMes = gastosDelMes.reduce((s, g) => s + g.monto, 0)
            const abierto = mesesAbiertos.has(mes)
            return (
              <div key={mes}>
                <div className="pedido-card" onClick={() => toggleMes(mes)} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="pedido-nombre">{formatMesLabel(mes)}</div>
                    <div className="pedido-sub">{gastosDelMes.length} gasto{gastosDelMes.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="pedido-right">
                    <span className="pedido-total">{formatPesos(subtotalMes)}</span>
                    <span className="pedido-editar-hint">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
                  </div>
                </div>
                {abierto && (
                  <div className="pedidos-list" style={{ marginTop: 8, marginLeft: 12 }}>
                    {gastosDelMes.map(g => (
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
                            {g.presupuesto_id ? ` · ${presupuestos.find(p => p.id === g.presupuesto_id)?.nombre || 'presupuesto'}` : ''}
                          </div>
                        </div>
                        <div className="pedido-right">
                          <span className="pedido-total" style={{ color: '#791F1F' }}>{formatPesos(g.monto)}</span>
                          <span className="pedido-editar-hint">Tocar para editar</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
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

// El monto asignado original nunca se pisa — los aportes de capital extra (comisión
// directiva) quedan como movimientos aparte en presupuesto_aportes, así se conserva
// el historial de cuánto se sumó, cuándo y por qué.
function totalAsignado(p, aportes) {
  return (p.monto_asignado || 0) + (aportes || []).filter(a => a.presupuesto_id === p.id).reduce((s, a) => s + (a.monto || 0), 0)
}

function estadoPresupuesto(p, gastos, aportes) {
  if (p.cerrado) return 'Cerrado'
  if (gastoDePresupuesto(p, gastos) >= totalAsignado(p, aportes)) return 'Agotado'
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

function IconoCuenta({ nombre, size = 34 }) {
  const esEfectivo = nombre === CUENTA_EFECTIVO
  const esDolar = CUENTAS_DOLARES.includes(nombre)
  const Icono = esEfectivo ? Wallet : Landmark
  const bg = esEfectivo ? '#FFF8ED' : esDolar ? '#EAF0FB' : '#E1F5EE'
  const color = esEfectivo ? '#854F0B' : esDolar ? '#33538F' : '#0F6E56'
  return (
    <div className="cuenta-icono" style={{ width: size, height: size, background: bg }}>
      <Icono size={Math.round(size * 0.5)} color={color} strokeWidth={2} />
    </div>
  )
}

const btnLinkStyle = color => ({ background: 'none', border: 'none', padding: 0, fontSize: 12, color, fontWeight: 500, cursor: 'pointer' })

function TarjetaPresupuesto({ p, gastos, aportes, onAlternarCerrado, onAportar, onEliminarAporte, onEditar, mostrarLocacion }) {
  const [formAbierto, setFormAbierto] = useState(null) // null | 'aportar' | 'editar'
  const [formAporte, setFormAporte] = useState({ monto: '', motivo: '', fecha: new Date().toISOString().slice(0, 10) })
  const [formEditar, setFormEditar] = useState({ nombre: p.nombre, fecha_limite: p.fecha_limite || '' })

  const aportesDelPresupuesto = (aportes || []).filter(a => a.presupuesto_id === p.id)
  const asignado = totalAsignado(p, aportes)
  const gastado = gastoDePresupuesto(p, gastos)
  const restante = asignado - gastado
  const estado = estadoPresupuesto(p, gastos, aportes)
  const necesitaAporte = estado === 'Agotado' && !p.cerrado
  const colorEstado = estado === 'Vencido' || estado === 'Agotado' ? '#791F1F' : estado === 'Cerrado' ? 'var(--text-secondary)' : 'var(--green-dark)'
  const colorBarra = estado === 'Vencido' || estado === 'Agotado' ? '#791F1F' : estado === 'Cerrado' ? '#c2c2ba' : '#1D9E75'
  const pct = asignado > 0 ? Math.min(100, Math.max(0, (gastado / asignado) * 100)) : 0

  function abrirForm(nombre) {
    setFormAporte({ monto: '', motivo: '', fecha: new Date().toISOString().slice(0, 10) })
    setFormEditar({ nombre: p.nombre, fecha_limite: p.fecha_limite || '' })
    setFormAbierto(prev => prev === nombre ? null : nombre)
  }

  async function confirmarAporte() {
    if (!parseFloat(formAporte.monto)) return
    await onAportar(p, { monto: parseFloat(formAporte.monto), motivo: formAporte.motivo.trim() || null, fecha: formAporte.fecha })
    setFormAbierto(null)
  }

  async function confirmarEditar() {
    if (!formEditar.nombre.trim()) return
    await onEditar(p, { nombre: formEditar.nombre.trim(), fecha_limite: formEditar.fecha_limite || null })
    setFormAbierto(null)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="cuenta-icono" style={{ width: 34, height: 34, background: '#F3EAF9' }}>
          <Target size={17} color="#7B4F9E" strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {mostrarLocacion ? `${p.locacion} · ` : ''}asignado {formatFechaDateISO(p.fecha_asignacion)}{p.fecha_limite ? ` · límite ${formatFechaDateISO(p.fecha_limite)}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: colorEstado }}>{necesitaAporte ? 'Necesita aporte' : estado}</div>
      </div>
      <div className="progreso-bar">
        <div className="progreso-fill" style={{ width: `${pct}%`, background: colorBarra }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px', marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Asignado</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{formatPesos(asignado)}</div>
          {aportesDelPresupuesto.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--green-dark)', marginTop: 1 }}>{formatPesos(p.monto_asignado)} + {formatPesos(asignado - p.monto_asignado)} aportado</div>
          )}
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

      {aportesDelPresupuesto.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="form-label">Aportes de capital</div>
          {aportesDelPresupuesto.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatFechaDateISO(a.fecha)} · <strong style={{ color: 'var(--text-primary)' }}>{formatPesos(a.monto)}</strong>{a.motivo ? ` · ${a.motivo}` : ''}{a.creado_por ? ` · ${a.creado_por}` : ''}
              </span>
              {onEliminarAporte && (
                <button onClick={() => onEliminarAporte(a.id)} style={{ ...btnLinkStyle('#791F1F'), fontSize: 14, lineHeight: 1 }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
        {onAportar && !p.cerrado && (
          <button onClick={() => abrirForm('aportar')} style={btnLinkStyle('var(--green-dark)')}>+ Aportar capital</button>
        )}
        {onEditar && (
          <button onClick={() => abrirForm('editar')} style={btnLinkStyle('var(--text-secondary)')}>Editar</button>
        )}
        {onAlternarCerrado && (
          <button onClick={() => onAlternarCerrado(p)} style={btnLinkStyle(p.cerrado ? 'var(--green-dark)' : '#791F1F')}>
            {p.cerrado ? 'Reabrir presupuesto' : 'Cerrar presupuesto'}
          </button>
        )}
      </div>

      {formAbierto === 'aportar' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Monto a aportar ($)</label>
              <InputMonto value={formAporte.monto} onChange={v => setFormAporte(f => ({ ...f, monto: v }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-control" type="date" value={formAporte.fecha} onChange={e => setFormAporte(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div className="form-group full">
              <label className="form-label">Motivo (opcional)</label>
              <input className="form-control" type="text" placeholder="Ej: aprobado en reunión de comisión" value={formAporte.motivo} onChange={e => setFormAporte(f => ({ ...f, motivo: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={confirmarAporte} style={{ flex: 1 }}>Guardar aporte</button>
            <button onClick={() => setFormAbierto(null)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}

      {formAbierto === 'editar' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Nombre / proyecto</label>
              <input className="form-control" type="text" value={formEditar.nombre} onChange={e => setFormEditar(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="form-group full">
              <label className="form-label">Fecha límite (opcional)</label>
              <input className="form-control" type="date" value={formEditar.fecha_limite} onChange={e => setFormEditar(f => ({ ...f, fecha_limite: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={confirmarEditar} style={{ flex: 1 }}>Guardar cambios</button>
            <button onClick={() => setFormAbierto(null)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Cuentas en dólares: sin pedidos/gastos que las alimenten, el saldo es
// saldo inicial validado + historial de movimientos manuales (compras/retiros),
// igual patrón que los aportes de capital de un presupuesto.
function TarjetaCuentaDolar({ r, onValidarSaldo, onAgregarMovimiento, onEliminarMovimiento }) {
  const [formAbierto, setFormAbierto] = useState(null) // null | 'saldo' | 'movimiento'
  const [inputSaldo, setInputSaldo] = useState('')
  const [inputCorte, setInputCorte] = useState('')
  const [formMov, setFormMov] = useState({ tipo: 'ingreso', monto: '', concepto: '', fecha: new Date().toISOString().slice(0, 10) })

  function abrirValidarSaldo() {
    setInputSaldo(String(r.info.saldo_inicial || 0))
    setInputCorte(r.info.validado ? r.info.fecha_corte : new Date().toISOString().slice(0, 10))
    setFormAbierto('saldo')
  }

  function abrirMovimiento() {
    setFormMov({ tipo: 'ingreso', monto: '', concepto: '', fecha: new Date().toISOString().slice(0, 10) })
    setFormAbierto('movimiento')
  }

  async function confirmarSaldo() {
    await onValidarSaldo(r.nombre, inputSaldo, inputCorte)
    setFormAbierto(null)
  }

  async function confirmarMovimiento() {
    if (!parseFloat(formMov.monto)) return
    await onAgregarMovimiento(r.nombre, { tipo: formMov.tipo, monto: parseFloat(formMov.monto), concepto: formMov.concepto.trim() || null, fecha: formMov.fecha })
    setFormAbierto(null)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <IconoCuenta nombre={r.nombre} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.nombre}</div>
          <div className="form-label" style={{ marginTop: 2 }}>Cuenta en dólares</div>
        </div>
        <div className="cifra-tabular" style={{ fontSize: 18, fontWeight: 700, color: r.saldo < 0 ? '#791F1F' : '#33538F', textAlign: 'right' }}>{formatDolares(r.saldo)}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
        {r.info.validado ? `Saldo validado · movimientos contados desde ${formatFechaISOCorta(r.info.fecha_corte)}` : `Movimiento neto desde ${formatFechaISOCorta(r.info.fecha_corte)}`}
      </div>
      {r.info.actualizado_por && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
          Último cambio: {r.info.actualizado_por} · {formatFechaHoraISO(r.info.actualizado_en)}
        </div>
      )}
      <div className="cifra-tabular" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ingresos</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#33538F' }}>{formatDolares(r.ingresos)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Retiros</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#791F1F' }}>{formatDolares(r.egresos)}</span>
        </div>
      </div>

      {r.movimientos.length > 0 && (
        <div className="cifra-tabular" style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="form-label">Historial de movimientos</div>
          {r.movimientos.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatFechaDateISO(m.fecha)} · <strong style={{ color: m.tipo === 'egreso' ? '#791F1F' : '#33538F' }}>{m.tipo === 'egreso' ? '-' : '+'}{formatDolares(m.monto)}</strong>{m.concepto ? ` · ${m.concepto}` : ''}{m.creado_por ? ` · ${m.creado_por}` : ''}
              </span>
              <button onClick={() => onEliminarMovimiento(m.id)} style={{ ...btnLinkStyle('#791F1F'), fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
        <button onClick={abrirMovimiento} style={btnLinkStyle('#33538F')}>+ Movimiento</button>
        <button onClick={abrirValidarSaldo} style={btnLinkStyle('var(--text-secondary)')}>
          {r.info.validado ? 'Corregir saldo validado' : 'Validar saldo inicial con el equipo'}
        </button>
      </div>

      {formAbierto === 'saldo' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <InputMonto placeholder="Saldo real validado (US$)" value={inputSaldo} onChange={setInputSaldo} permiteNegativo style={{ flex: 1 }} />
            <input className="form-control" type="date" value={inputCorte} onChange={e => setInputCorte(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            Desde esta fecha se cuentan los movimientos nuevos — todo lo anterior queda afuera del saldo.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={confirmarSaldo}>Guardar</button>
            <button onClick={() => setFormAbierto(null)} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}

      {formAbierto === 'movimiento' && (
        <div style={{ marginTop: 10 }}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={formMov.tipo} onChange={e => setFormMov(f => ({ ...f, tipo: e.target.value }))}>
                <option value="ingreso">Compra / depósito</option>
                <option value="egreso">Retiro</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Monto (US$)</label>
              <InputMonto value={formMov.monto} onChange={v => setFormMov(f => ({ ...f, monto: v }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-control" type="date" value={formMov.fecha} onChange={e => setFormMov(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Concepto (opcional)</label>
              <input className="form-control" type="text" placeholder="Ej: compra para reserva" value={formMov.concepto} onChange={e => setFormMov(f => ({ ...f, concepto: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={confirmarMovimiento} style={{ flex: 1 }}>Guardar movimiento</button>
            <button onClick={() => setFormAbierto(null)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TabFinanzas({ pedidos, esquejes, miembro, gastos, presupuestos, setPresupuestos, aportes, setAportes, gastosFijos, setGastosFijos, pedidoPagos, esquejePagos, onRevisar }) {
  const revisarRef = useRef(null)
  const [subTab, setSubTab] = useState('general')
  const [cuentas, setCuentas] = useState([])
  const [dolaresMovimientos, setDolaresMovimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [intento, setIntento] = useState(0)
  const [editandoSaldo, setEditandoSaldo] = useState(null)
  const [inputSaldo, setInputSaldo] = useState('')
  const [inputCorte, setInputCorte] = useState('')
  const [verDetalleCuentas, setVerDetalleCuentas] = useState(false)
  const [verDetalleDolares, setVerDetalleDolares] = useState(false)
  const [verPresupuestosGeneral, setVerPresupuestosGeneral] = useState(false)
  const [toast, showToast] = useToast()


  useEffect(() => {
    async function cargar() {
      const [cuentasRes, dolaresRes] = await Promise.all([
        supabase.from('cuentas').select('*'),
        supabase.from('dolares_movimientos').select('*').order('fecha', { ascending: false }),
      ])
      if (cuentasRes.data) setCuentas(cuentasRes.data)
      if (dolaresRes.data) setDolaresMovimientos(dolaresRes.data)
      setErrorCarga(Boolean(cuentasRes.error || dolaresRes.error))
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

  // Para la alerta de "sin cuenta" el criterio es al revés que en esDesdeCorte: ahí una fecha
  // ilegible (imports viejos tipo "06/08" sin año) se cuenta como plata igual para no perderla
  // del saldo. Acá, en cambio, una fecha ilegible o anterior al corte más viejo configurado es
  // exactamente lo que identifica a un registro migrado del historial (nunca va a tener cuenta
  // asignada) — y no tiene sentido reclamarlo para siempre. Ver auditoria-salud.md punto 2.
  function esLegado(fechaStr, corteMinimo) {
    const d = parseFechaDP(fechaStr)
    if (!d) return true
    return !esDesdeCorte(fechaStr, corteMinimo)
  }

  // Los pagos de pedidos/esquejes ya guardan una fecha ISO real por evento (a diferencia de
  // fecha/fecha_cobro, que son texto legado dd/mm/aaaa) — comparar contra el corte es una
  // simple comparación de strings ISO, sin pasar por parseFechaDP.
  function esDesdeCorteISO(fechaISO, corteISO) {
    if (!fechaISO) return true
    return fechaISO >= (corteISO || FECHA_CORTE_DEFAULT)
  }
  function esLegadoISO(fechaISO, corteMinimo) {
    return !fechaISO || fechaISO < corteMinimo
  }

  // Ingresos de pedidos/esquejes: se suman directo desde el historial de pagos (pedido_pagos/
  // esqueje_pagos), no desde el registro — cada pago tiene su propia cuenta y fecha, así que un
  // cobro dividido entre dos cuentas en fechas distintas ya no comparte una sola fecha_cobro
  // (mejora real sobre el modelo viejo de "pagado + divisiones", ver plan de pagos parciales).
  const resumen = useMemo(() => CUENTAS.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { nombre, saldo_inicial: 0, fecha_corte: FECHA_CORTE_DEFAULT, validado: false }
    const ingresosPedidos = pedidoPagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    const ingresosEsquejes = esquejePagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    const egresos = gastos.filter(g => esDesdeCorte(g.fecha, info.fecha_corte))
      .flatMap(g => montosPorCuenta(g, 'monto')).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    const ingresos = ingresosPedidos + ingresosEsquejes
    const saldo = (info.saldo_inicial || 0) + ingresos - egresos
    const estimados =
      pedidoPagos.filter(pg => pg.cuenta === nombre && pg.cuenta_estimada).length +
      esquejePagos.filter(pg => pg.cuenta === nombre && pg.cuenta_estimada).length +
      gastos.filter(g => g.cuenta === nombre && g.cuenta_estimada).length
    return { nombre, info, ingresos, egresos, saldo, estimados }
  }), [pedidoPagos, esquejePagos, gastos, cuentas])

  const totalGeneral = resumen.reduce((s, r) => s + r.saldo, 0)

  // Independiente del desglose por cuenta de arriba (que agrupa por nombre de cuenta y por
  // eso se pierde los gastos divididos entre varias, que no tienen un "cuenta" único): acá
  // contamos directo sobre los 3 orígenes, así el total y el listado de abajo son exactos.
  const registrosARevisar = useMemo(() => {
    const items = []
    pedidoPagos.filter(pg => pg.cuenta_estimada).forEach(pg => {
      const pedido = pedidos.find(p => p.id === pg.pedido_id)
      items.push({
        key: `pedido-${pg.id}`,
        label: `Pedido de ${pedido?.socio || '(no encontrado)'} · ${formatPesos(pg.monto)} · ${formatFechaISOCorta(pg.fecha)}`,
        objetivo: { tab: 'pedidos', tipoRegistro: 'cosecha', mes: pedido?.mes, id: pg.pedido_id },
      })
    })
    esquejePagos.filter(pg => pg.cuenta_estimada).forEach(pg => {
      const esqueje = esquejes.find(e => e.id === pg.esqueje_id)
      items.push({
        key: `esqueje-${pg.id}`,
        label: `Esqueje de ${esqueje?.socio || '(no encontrado)'} · ${formatPesos(pg.monto)} · ${formatFechaISOCorta(pg.fecha)}`,
        objetivo: { tab: 'pedidos', tipoRegistro: 'esquejes', mes: esqueje?.mes, id: pg.esqueje_id },
      })
    })
    gastos.filter(g => g.cuenta_estimada).forEach(g => {
      items.push({
        key: `gasto-${g.id}`,
        label: `${g.descripcion} · ${formatPesos(g.monto)} · ${g.fecha}`,
        objetivo: { tab: 'gastos', locacion: g.locacion, mes: g.mes, id: g.id },
      })
    })
    return items
  }, [pedidoPagos, esquejePagos, gastos, pedidos, esquejes])

  const totalEstimados = registrosARevisar.length

  // Cuentas en dólares: reserva/ahorro, sin pedidos ni gastos que las muevan —
  // el saldo sale de saldo inicial validado + historial propio de movimientos.
  const resumenDolares = useMemo(() => CUENTAS_DOLARES.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { nombre, saldo_inicial: 0, fecha_corte: FECHA_CORTE_DEFAULT, validado: false }
    const movimientos = dolaresMovimientos.filter(m => m.cuenta === nombre)
    const movimientosContados = movimientos.filter(m => esDesdeCorteISO(m.fecha, info.fecha_corte))
    const ingresos = movimientosContados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + (m.monto || 0), 0)
    const egresos = movimientosContados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + (m.monto || 0), 0)
    const saldo = (info.saldo_inicial || 0) + ingresos - egresos
    return { nombre, info, ingresos, egresos, saldo, movimientos }
  }), [cuentas, dolaresMovimientos])

  const totalDolares = resumenDolares.reduce((s, r) => s + r.saldo, 0)

  // Pagos/gastos sin cuenta asignada no entran en ningún saldo de arriba y por eso no deben
  // quedar invisibles — se muestran aparte para que se corrijan. Se excluye lo anterior al
  // corte más viejo entre las cuentas configuradas: es plata migrada del historial que nunca
  // va a tener cuenta.
  const corteMinimo = cuentas.length > 0
    ? cuentas.reduce((min, c) => (c.fecha_corte && c.fecha_corte < min ? c.fecha_corte : min), cuentas[0].fecha_corte || FECHA_CORTE_DEFAULT)
    : FECHA_CORTE_DEFAULT
  const pagosPedidosSinCuenta = pedidoPagos.filter(pg => !pg.cuenta && !esLegadoISO(pg.fecha, corteMinimo))
  const pagosEsquejesSinCuenta = esquejePagos.filter(pg => !pg.cuenta && !esLegadoISO(pg.fecha, corteMinimo))
  const gastosSinCuenta = gastos.filter(g => !tieneAsignacionValida(g, 'monto') && !esLegado(g.fecha, corteMinimo))
  const ingresosSinCuenta = pagosPedidosSinCuenta.reduce((s, pg) => s + (pg.monto || 0), 0) + pagosEsquejesSinCuenta.reduce((s, pg) => s + (pg.monto || 0), 0)
  const egresosSinCuenta = gastosSinCuenta.reduce((s, g) => s + (g.monto || 0), 0)
  const cantidadSinCuenta = pagosPedidosSinCuenta.length + pagosEsquejesSinCuenta.length + gastosSinCuenta.length

  async function actualizarSaldoCuenta(nombre, valorStr, corteStr) {
    const valor = parseFloat(valorStr)
    if (isNaN(valor)) { showToast('Ingresá un número válido'); return }
    if (!corteStr) { showToast('Elegí una fecha de corte'); return }
    const ahora = new Date().toISOString()
    const existente = cuentas.find(c => c.nombre === nombre)
    if (existente) {
      const { error } = await supabase.from('cuentas').update({ saldo_inicial: valor, fecha_corte: corteStr, validado: true, actualizado_por: miembro || null, actualizado_en: ahora }).eq('nombre', nombre)
      if (!error) { setCuentas(prev => prev.map(c => c.nombre === nombre ? { ...c, saldo_inicial: valor, fecha_corte: corteStr, validado: true, actualizado_por: miembro || null, actualizado_en: ahora } : c)); showToast('Saldo inicial validado ✓') }
      else showToast('Error al guardar')
    } else {
      const { data, error } = await supabase.from('cuentas').insert({ nombre, saldo_inicial: valor, fecha_corte: corteStr, validado: true, actualizado_por: miembro || null, actualizado_en: ahora }).select().single()
      if (!error && data) { setCuentas(prev => [...prev, data]); showToast('Saldo inicial validado ✓') }
      else showToast('Error al guardar')
    }
  }

  async function guardarSaldoInicial(nombre) {
    await actualizarSaldoCuenta(nombre, inputSaldo, inputCorte)
    setEditandoSaldo(null)
    setInputSaldo('')
    setInputCorte('')
  }

  async function agregarMovimientoDolares(nombre, { tipo, monto, concepto, fecha }) {
    const nuevo = { cuenta: nombre, tipo, monto, concepto, fecha, creado_por: miembro || null }
    const { data, error } = await supabase.from('dolares_movimientos').insert(nuevo).select().single()
    if (!error && data) { setDolaresMovimientos(prev => [data, ...prev]); showToast('Movimiento registrado ✓') }
    else showToast('Error al guardar')
  }

  async function eliminarMovimientoDolares(id) {
    const { error } = await supabase.from('dolares_movimientos').delete().eq('id', id)
    if (!error) setDolaresMovimientos(prev => prev.filter(m => m.id !== id))
    else showToast('Error al eliminar')
  }

  // Punto de color en la pestaña de una locación cuando tiene presupuesto activo —
  // rojo si alguno está Agotado/Vencido, verde si están bien, nada si no hay ninguno.
  function colorPresupuestoLocacion(locacion) {
    const activos = presupuestos.filter(p => p.locacion === locacion && !p.cerrado)
    if (activos.length === 0) return null
    const hayProblema = activos.some(p => {
      const estado = estadoPresupuesto(p, gastos, aportes)
      return estado === 'Agotado' || estado === 'Vencido'
    })
    return hayProblema ? '#791F1F' : 'var(--green-dark)'
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
        {['general', 'Hormi 1.0', 'Hormi 2.0'].map(st => {
          const colorPunto = st !== 'general' ? colorPresupuestoLocacion(st) : null
          return (
            <button key={st} className={`miembro-btn${subTab === st ? ' active' : ''}`} onClick={() => setSubTab(st)}>
              {st === 'general' ? 'General' : st}
              {colorPunto && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colorPunto, marginLeft: 6 }} />}
            </button>
          )
        })}
      </div>
      {subTab !== 'general' && (
        <PanelFinanzasHormi locacion={subTab} pedidos={pedidos} esquejes={esquejes} gastos={gastos} presupuestos={presupuestos} setPresupuestos={setPresupuestos} aportes={aportes} setAportes={setAportes} gastosFijos={gastosFijos} setGastosFijos={setGastosFijos} totalCuentas={totalGeneral} miembro={miembro} pedidoPagos={pedidoPagos} esquejePagos={esquejePagos} />
      )}
      {subTab === 'general' && (
      <>
      <div className="stats-row">
        <div className="stat-card">
          <Wallet size={16} color={totalGeneral < 0 ? '#791F1F' : '#1D9E75'} style={{ marginBottom: 4 }} />
          <div className="stat-num" style={{ fontSize: 16, color: totalGeneral < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(totalGeneral)}</div>
          <div className="stat-lbl">Total todas las cuentas</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: totalEstimados > 0 ? 'pointer' : 'default' }}
          onClick={() => totalEstimados > 0 && revisarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          <TriangleAlert size={16} color={totalEstimados > 0 ? '#854F0B' : '#6b6b66'} style={{ marginBottom: 4 }} />
          <div className="stat-num" style={{ color: totalEstimados > 0 ? '#854F0B' : undefined }}>{totalEstimados}</div>
          <div className="stat-lbl">Registros a revisar</div>
        </div>
        <div className="stat-card">
          <Landmark size={16} color={totalDolares < 0 ? '#791F1F' : '#33538F'} style={{ marginBottom: 4 }} />
          <div className="cifra-tabular stat-num" style={{ fontSize: 16, color: totalDolares < 0 ? '#791F1F' : '#33538F' }}>{formatDolares(totalDolares)}</div>
          <div className="stat-lbl">Ahorro en dólares</div>
        </div>
      </div>
      {totalEstimados > 0 && (
        <div ref={revisarRef} className="card" style={{ marginBottom: 14, background: '#FFF8ED', borderColor: '#E8C77E' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <TriangleAlert size={15} color="#854F0B" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.5 }}>
              Hay <strong>{totalEstimados}</strong> registro(s) con cuenta estimada.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {registrosARevisar.map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '0.5px solid #E8C77E' }}>
                <span style={{ fontSize: 12, color: '#854F0B' }}>{item.label}</span>
                <button onClick={() => onRevisar(item.objetivo)} style={{ ...btnLinkStyle('#854F0B'), flexShrink: 0 }}>Revisar</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {cantidadSinCuenta > 0 && (
        <div className="card" style={{ marginBottom: 14, background: '#FCEBEB', borderColor: '#791F1F' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <TriangleAlert size={15} color="#791F1F" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#791F1F', lineHeight: 1.5 }}>
              <strong>Atención:</strong> hay <strong>{cantidadSinCuenta}</strong> pago(s)/gasto(s) SIN cuenta asignada, por eso <strong>no están sumados en ningún total de arriba</strong> (ingresos sin contar: {formatPesos(ingresosSinCuenta)} · gastos sin contar: {formatPesos(egresosSinCuenta)}). Los pagos se corrigen desde Pedidos (Cosecha/Esquejes): abrí el registro, borrá el pago sin cuenta y volvé a cargarlo con la cuenta confirmada. Los gastos se corrigen desde Gastos → Lista, abriendo cada uno y eligiendo su cuenta.
            </div>
          </div>
        </div>
      )}
      <button className="btn-disclosure" onClick={() => setVerDetalleCuentas(v => !v)}>
        <span>{verDetalleCuentas ? 'Ocultar cuentas en pesos' : `Ver detalle cuentas en pesos (${resumen.length})`}</span>
        {verDetalleCuentas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {verDetalleCuentas && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {resumen.map(r => (
          <div className="card" key={r.nombre}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <IconoCuenta nombre={r.nombre} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.nombre}</div>
                <div className="form-label" style={{ marginTop: 2 }}>{r.nombre === CUENTA_EFECTIVO ? 'Efectivo' : 'Cuenta bancaria'}</div>
              </div>
              <div className="cifra-tabular" style={{ fontSize: 18, fontWeight: 700, color: r.saldo < 0 ? '#791F1F' : 'var(--green-dark)', textAlign: 'right' }}>{formatPesos(r.saldo)}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
              {r.info.validado ? `Saldo validado · ingresos y gastos contados desde ${formatFechaISOCorta(r.info.fecha_corte)}` : `Movimiento neto desde ${formatFechaISOCorta(r.info.fecha_corte)}`}
            </div>
            {r.info.actualizado_por && (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                Último cambio: {r.info.actualizado_por} · {formatFechaHoraISO(r.info.actualizado_en)}
              </div>
            )}
            <div className="cifra-tabular" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
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
                  Desde esta fecha se cuentan los movimientos nuevos — todo lo anterior queda afuera del saldo (sigue disponible en Pedidos/Gastos).
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={() => guardarSaldoInicial(r.nombre)}>Guardar</button>
                  <button onClick={() => { setEditandoSaldo(null); setInputSaldo(''); setInputCorte('') }} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setEditandoSaldo(r.nombre); setInputSaldo(String(r.info.saldo_inicial || 0)); setInputCorte(r.info.validado ? r.info.fecha_corte : new Date().toISOString().slice(0, 10)) }} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>
                {r.info.validado ? 'Corregir saldo validado' : 'Validar saldo inicial con el equipo'}
              </button>
            )}
          </div>
        ))}
      </div>
      )}
      <button className="btn-disclosure" style={{ marginTop: 10 }} onClick={() => setVerDetalleDolares(v => !v)}>
        <span>{verDetalleDolares ? 'Ocultar cuentas en dólares' : `Ver detalle cuentas en dólares (${resumenDolares.length})`}</span>
        {verDetalleDolares ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {verDetalleDolares && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {resumenDolares.map(r => (
          <TarjetaCuentaDolar
            key={r.nombre}
            r={r}
            onValidarSaldo={actualizarSaldoCuenta}
            onAgregarMovimiento={agregarMovimientoDolares}
            onEliminarMovimiento={eliminarMovimientoDolares}
          />
        ))}
      </div>
      )}
      {presupuestos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn-disclosure" onClick={() => setVerPresupuestosGeneral(v => !v)}>
            <span>{verPresupuestosGeneral ? 'Ocultar presupuestos activos' : `Ver presupuestos activos (${presupuestos.length})`}</span>
            {verPresupuestosGeneral ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {verPresupuestosGeneral && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {presupuestos.map(p => (
              <TarjetaPresupuesto key={p.id} p={p} gastos={gastos} aportes={aportes} mostrarLocacion />
            ))}
          </div>
          )}
        </div>
      )}
      </>
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function PanelFinanzasHormi({ locacion, pedidos, esquejes, gastos, presupuestos, setPresupuestos, aportes, setAportes, gastosFijos, setGastosFijos, totalCuentas, miembro, pedidoPagos, esquejePagos }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', monto_asignado: '', fecha_asignacion: new Date().toISOString().slice(0, 10), fecha_limite: '' })
  const [mostrarFormFijo, setMostrarFormFijo] = useState(false)
  const [formFijo, setFormFijo] = useState({ nombre: '', categoria: '', monto: '' })
  const [editandoFijo, setEditandoFijo] = useState(null)
  const [inputMontoFijo, setInputMontoFijo] = useState('')
  const [toast, showToast] = useToast()


  const gastosLocacion = gastos.filter(g => g.locacion === locacion)
  const totalGastos = gastosLocacion.reduce((s, g) => s + (g.monto || 0), 0)
  const categorias = CATEGORIAS_GASTOS_MAP[locacion] || CATEGORIAS_GASTOS
  const porCategoria = categorias.map(cat => ({
    cat, total: gastosLocacion.filter(g => g.categoria === cat).reduce((s, g) => s + g.monto, 0)
  })).filter(x => x.total > 0)

  const presupuestosLocacion = presupuestos.filter(p => p.locacion === locacion)

  const gastosFijosLocacion = (gastosFijos || []).filter(g => g.locacion === locacion)
  const totalGastosFijosActivos = gastosFijosLocacion.filter(g => g.activo).reduce((s, g) => s + (g.monto || 0), 0)

  const mesHoy = mesActual()
  // 'pagado' de pedidos/esquejes ya no se escribe en la base (ver historial de pagos) — se
  // deriva acá desde pedidoPagos/esquejePagos para no tocar el resto de esta proyección.
  const pedidosConEstado = pedidos.map(p => ({ ...p, pagado: ['pagado', 'sobrepago'].includes(estadoCobro(p.total, totalCobrado(pedidoPagos, p.id, 'pedido_id'))) }))
  const esquejesConEstado = esquejes.map(e => ({ ...e, pagado: ['pagado', 'sobrepago'].includes(estadoCobro(e.total, totalCobrado(esquejePagos, e.id, 'esqueje_id'))) }))
  const cobradoPorMes = {}
  ;[...pedidosConEstado, ...esquejesConEstado].filter(r => r.locacion === locacion && r.pagado && r.mes && r.mes !== mesHoy).forEach(r => {
    cobradoPorMes[r.mes] = (cobradoPorMes[r.mes] || 0) + (r.total || 0)
  })
  const mesesCerradosConDatos = ordenarMesesDesc(Object.keys(cobradoPorMes)).slice(0, 3)
  const ingresoPromedio = mesesCerradosConDatos.length > 0
    ? mesesCerradosConDatos.reduce((s, m) => s + cobradoPorMes[m], 0) / mesesCerradosConDatos.length
    : null
  const disponibleProyectado = ingresoPromedio !== null ? ingresoPromedio - totalGastosFijosActivos : null

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

  async function aportarCapital(p, { monto, motivo, fecha }) {
    const nuevoAporte = { presupuesto_id: p.id, monto, motivo, fecha, creado_por: miembro || null }
    const { data, error } = await supabase.from('presupuesto_aportes').insert(nuevoAporte).select().single()
    if (!error && data) { setAportes(prev => [data, ...prev]); showToast('Aporte registrado ✓') }
    else showToast('Error al guardar')
  }

  async function eliminarAporte(id) {
    const { error } = await supabase.from('presupuesto_aportes').delete().eq('id', id)
    if (!error) setAportes(prev => prev.filter(a => a.id !== id))
    else showToast('Error al eliminar')
  }

  async function editarPresupuesto(p, { nombre, fecha_limite }) {
    const { error } = await supabase.from('presupuestos').update({ nombre, fecha_limite }).eq('id', p.id)
    if (!error) setPresupuestos(prev => prev.map(x => x.id === p.id ? { ...x, nombre, fecha_limite } : x))
    else showToast('Error al guardar')
  }

  async function agregarGastoFijo() {
    if (!formFijo.nombre.trim() || !parseFloat(formFijo.monto)) {
      showToast('Completá nombre y monto')
      return
    }
    const ahora = new Date().toISOString()
    const nuevo = { nombre: formFijo.nombre.trim(), categoria: formFijo.categoria || null, monto: parseFloat(formFijo.monto), locacion, activo: true, actualizado_por: miembro || null, actualizado_en: ahora }
    const { data, error } = await supabase.from('gastos_fijos').insert(nuevo).select().single()
    if (!error && data) {
      setGastosFijos(prev => [data, ...prev])
      setFormFijo({ nombre: '', categoria: '', monto: '' })
      setMostrarFormFijo(false)
      showToast('Gasto fijo agregado ✓')
    } else showToast('Error al guardar')
  }

  async function guardarMontoFijo(id) {
    const valor = parseFloat(inputMontoFijo)
    if (isNaN(valor)) { showToast('Ingresá un número válido'); return }
    const ahora = new Date().toISOString()
    const { error } = await supabase.from('gastos_fijos').update({ monto: valor, actualizado_por: miembro || null, actualizado_en: ahora }).eq('id', id)
    if (!error) {
      setGastosFijos(prev => prev.map(g => g.id === id ? { ...g, monto: valor, actualizado_por: miembro || null, actualizado_en: ahora } : g))
      showToast('Monto actualizado ✓')
    } else showToast('Error al guardar')
    setEditandoFijo(null)
    setInputMontoFijo('')
  }

  async function toggleActivoFijo(g) {
    const { error } = await supabase.from('gastos_fijos').update({ activo: !g.activo }).eq('id', g.id)
    if (!error) setGastosFijos(prev => prev.map(x => x.id === g.id ? { ...x, activo: !g.activo } : x))
    else showToast('Error al guardar')
  }

  async function eliminarGastoFijo(id) {
    const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
    if (!error) setGastosFijos(prev => prev.filter(g => g.id !== id))
    else showToast('Error al eliminar')
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 10 }}><span className="form-label">Proyección de {locacion}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ingreso promedio</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{ingresoPromedio !== null ? formatPesos(ingresoPromedio) : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Gastos fijos</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#791F1F' }}>{formatPesos(totalGastosFijosActivos)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Disponible</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: disponibleProyectado !== null && disponibleProyectado < 0 ? '#791F1F' : 'var(--green-dark)' }}>
              {disponibleProyectado !== null ? formatPesos(disponibleProyectado) : '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
          <Info size={14} color="#6b6b66" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {ingresoPromedio !== null ? (
              <>
                <strong>Ingreso promedio</strong>: cobrado en {locacion} en <strong>{mesesCerradosConDatos.map(formatMesLabel).join(', ')}</strong> ({mesesCerradosConDatos.length} mes{mesesCerradosConDatos.length !== 1 ? 'es' : ''} cerrado{mesesCerradosConDatos.length !== 1 ? 's' : ''}). {formatMesLabel(mesHoy)} (en curso) todavía no entra. <strong>Gastos fijos</strong>: valor activo hoy. <strong>Disponible</strong> = la resta — referencia, no exacto.
              </>
            ) : (
              <>Todavía no hay ningún mes cerrado con pedidos o esquejes pagados en {locacion} para calcular un promedio.</>
            )}
          </div>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total real en todas las cuentas hoy (Hormi 1.0 + 2.0)</span>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatPesos(totalCuentas)}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
          Saldo real del banco, combinado — no tiene por qué coincidir con Disponible (son números de otro tipo). Solo de referencia.
        </div>
      </div>

      <div className="form-label" style={{ marginBottom: 10, display: 'block' }}>Gastos fijos de {locacion}</div>
      {gastosFijosLocacion.length > 0 && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gastosFijosLocacion.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: g.activo ? 1 : 0.5 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{g.nombre}</div>
                {g.categoria && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{g.categoria}</div>}
              </div>
              {editandoFijo === g.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <InputMonto value={inputMontoFijo} onChange={setInputMontoFijo} style={{ width: 100, height: 32 }} />
                  <button className="btn-submit" style={{ width: 'auto', height: 32, padding: '0 10px' }} onClick={() => guardarMontoFijo(g.id)}>OK</button>
                </div>
              ) : (
                <button onClick={() => { setEditandoFijo(g.id); setInputMontoFijo(String(g.monto)) }} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  {formatPesos(g.monto)}
                </button>
              )}
              <label className="toggle-switch" style={{ width: 32, height: 19 }}>
                <input type="checkbox" checked={g.activo} onChange={() => toggleActivoFijo(g)} />
                <span className="toggle-slider" />
              </label>
              <button onClick={() => eliminarGastoFijo(g.id)} style={btnLinkStyle('#791F1F')}>×</button>
            </div>
          ))}
          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Total activos</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{formatPesos(totalGastosFijosActivos)}</span>
          </div>
        </div>
      )}
      {gastosFijosLocacion.length === 0 && !mostrarFormFijo && (
        <div className="empty-state" style={{ marginBottom: 14 }}>Todavía no hay gastos fijos cargados en {locacion}.</div>
      )}

      {mostrarFormFijo && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Nombre</label>
              <input className="form-control" type="text" placeholder="Ej: Alquiler" value={formFijo.nombre} onChange={e => setFormFijo(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select className="form-control" value={formFijo.categoria} onChange={e => setFormFijo(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Sin categoría</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Monto ($)</label>
              <InputMonto value={formFijo.monto} onChange={v => setFormFijo(f => ({ ...f, monto: v }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={agregarGastoFijo} style={{ flex: 1 }}>Guardar gasto fijo</button>
            <button onClick={() => setMostrarFormFijo(false)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}
      {!mostrarFormFijo && (
        <button className="btn-agregar-fila" onClick={() => setMostrarFormFijo(true)} style={{ marginBottom: 14 }}>+ Nuevo gasto fijo en {locacion}</button>
      )}

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
            {presupuestosLocacion.map(p => (
              <TarjetaPresupuesto key={p.id} p={p} gastos={gastos} aportes={aportes} onAlternarCerrado={alternarCerrado} onAportar={aportarCapital} onEliminarAporte={eliminarAporte} onEditar={editarPresupuesto} />
            ))}
          </div>
        )
      }
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function TabGastos({ miembro, gastos, presupuestos, onGuardarGasto, onActualizarGasto, onEliminarGasto, target }) {
  const [locacion, setLocacion] = useState(() => target?.locacion || 'Hormi 1.0')
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
        target={target}
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
      await supabase.from('stock_ajustes_fallidos').insert({ rpc_name: rpcName, genetica, delta, error: error.message || String(error) })
      continue
    }
    if (data != null) setStockFn(prev => ({ ...prev, [genetica]: Number(data) }))
  }
}

// Edición manual de stock (PanelStock): a diferencia de aplicarDeltas, no usa
// alert() bloqueante — el feedback queda a cargo del propio panel (toast inline).
async function ajustarStockDirecto(genetica, nuevoValor, rpcName, stockActual, setStockFn) {
  const actual = stockActual[genetica] ?? 0
  const delta = Number(nuevoValor) - actual
  if (!Number.isFinite(delta) || delta === 0) return { ok: true }
  const { data, error } = await supabase.rpc(rpcName, { p_genetica: genetica, p_delta: delta })
  if (error) {
    console.error('Error ajustando stock manualmente', genetica, error)
    await supabase.from('stock_ajustes_fallidos').insert({ rpc_name: rpcName, genetica, delta, error: error.message || String(error) })
    return { ok: false }
  }
  if (data != null) setStockFn(prev => ({ ...prev, [genetica]: Number(data) }))
  return { ok: true }
}

// El "inicial" es solo un valor de referencia (no lo consume ningún pedido/
// esqueje), asi que a diferencia del stock actual no necesita delta ni RPC:
// un update directo alcanza (la RLS de la tabla ya exige miembro autenticado).
async function actualizarInicialDirecto(genetica, nuevoValor, tabla, setInicialFn) {
  // .select() es necesario para poder distinguir un update legitimo de uno que
  // la RLS dejo pasar sin error pero filtro a 0 filas (update silencioso a nada).
  const { data, error } = await supabase.from(tabla).update({ inicial: nuevoValor }).eq('genetica', genetica).select()
  if (error || !data || data.length === 0) {
    console.error('Error actualizando inicial de stock', genetica, error)
    return { ok: false }
  }
  setInicialFn(prev => ({ ...prev, [genetica]: nuevoValor }))
  return { ok: true }
}

// ─── Mapeo DB (snake_case) ↔ app (camelCase) ──────────────────
// Fuente única de verdad: evita repetir metodoPago/metodo_pago y
// cuentaEstimada/cuenta_estimada por todo el código.
const conAliasPago = row => ({ ...row, metodoPago: row.metodo_pago, fechaCobro: row.fecha_cobro })

// pagado/metodo_pago/fecha_cobro/cuenta/cuenta_estimada/divisiones ya no se escriben acá: el
// historial de pagos (pedido_pagos/esqueje_pagos) es la única fuente de verdad de ahora en más.
// Esas columnas quedan en la base como respaldo histórico congelado de antes de este cambio.
const pedidoToDB = p => ({
  fecha: p.fecha, mes: p.mes || mesActual(), miembro: p.miembro, socio: p.socio,
  geneticas: p.geneticas, precio: p.precio, total: p.total, propio: p.propio, entregado: p.entregado,
})

const esquejeToDB = e => ({
  fecha: e.fecha, mes: e.mes || mesActual(), miembro: e.miembro, socio: e.socio,
  geneticas: e.geneticas, total: e.total, propio: e.propio, entregado: e.entregado,
})

const gastoToDB = g => ({
  descripcion: g.descripcion, categoria: g.categoria, monto: g.monto,
  fecha: g.fecha, mes: g.mes, miembro: g.miembro || null,
  cuenta: g.cuenta || null, presupuesto_id: g.presupuesto_id || null, cuenta_estimada: false,
  divisiones: g.divisiones || null,
})

// ─── App raíz ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('pedidos')
  const [objetivoRevision, setObjetivoRevision] = useState(null)

  function irATab(nuevoTab) {
    setObjetivoRevision(null)
    setTab(nuevoTab)
  }

  function irARevisar(objetivo) {
    setObjetivoRevision(objetivo)
    setTab(objetivo.tab)
  }
  const [pedidos, setPedidos] = useState([])
  const [stock, setStock] = useState(STOCK_INICIAL)
  const [stockInicial, setStockInicial] = useState(STOCK_INICIAL)
  const [esquejes, setEsquejes] = useState([])
  const [gastos, setGastos] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [aportes, setAportes] = useState([])
  const [gastosFijos, setGastosFijos] = useState([])
  const [pedidoPagos, setPedidoPagos] = useState([])
  const [esquejePagos, setEsquejePagos] = useState([])
  const [stockEsquejes, setStockEsquejes] = useState(STOCK_ESQUEJES_INICIAL)
  const [stockEsquejesInicial, setStockEsquejesInicial] = useState(STOCK_ESQUEJES_INICIAL)
  const [stockAjustesFallidos, setStockAjustesFallidos] = useState([])
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
      const [pedidosRes, stockRes, esquejesRes, stockEsquejesRes, gastosRes, presupuestosRes, aportesRes, gastosFijosRes, pedidoPagosRes, esquejePagosRes] = await Promise.all([
        supabase.from('pedidos').select('*').order('created_at', { ascending: false }),
        supabase.from('stock').select('*'),
        supabase.from('esquejes').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_esquejes').select('*'),
        supabase.from('gastos').select('*').order('created_at', { ascending: false }),
        supabase.from('presupuestos').select('*').order('created_at', { ascending: false }),
        supabase.from('presupuesto_aportes').select('*').order('created_at', { ascending: false }),
        supabase.from('gastos_fijos').select('*').order('created_at', { ascending: false }),
        supabase.from('pedido_pagos').select('*').order('created_at', { ascending: false }),
        supabase.from('esqueje_pagos').select('*').order('created_at', { ascending: false }),
      ])
      if (cancelado) return
      const conError = [pedidosRes, stockRes, esquejesRes, stockEsquejesRes, gastosRes, presupuestosRes, aportesRes, gastosFijosRes, pedidoPagosRes, esquejePagosRes].filter(r => r.error)
      if (conError.length > 0) {
        console.error('Error al cargar datos', conError.map(r => r.error))
        setErrorCarga(true)
        setCargando(false)
        return
      }
      setPedidos((pedidosRes.data || []).map(conAliasPago))
      if (stockRes.data) {
        const stockObj = {}, inicialObj = {}
        stockRes.data.forEach(s => { stockObj[s.genetica] = Number(s.gramos); inicialObj[s.genetica] = Number(s.inicial) })
        setStock(stockObj)
        setStockInicial(inicialObj)
      }
      setEsquejes((esquejesRes.data || []).map(conAliasPago))
      if (stockEsquejesRes.data) {
        const obj = {}, inicialObj = {}
        stockEsquejesRes.data.forEach(s => { obj[s.genetica] = Number(s.unidades); inicialObj[s.genetica] = Number(s.inicial) })
        setStockEsquejes(obj)
        setStockEsquejesInicial(inicialObj)
      }
      setGastos(gastosRes.data || [])
      setPresupuestos(presupuestosRes.data || [])
      setAportes(aportesRes.data || [])
      setGastosFijos(gastosFijosRes.data || [])
      setPedidoPagos(pedidoPagosRes.data || [])
      setEsquejePagos(esquejePagosRes.data || [])
      setCargando(false)
    }
    cargarDatos()
    // Aparte del resto: si esta tabla todavía no existe o falla, no debe bloquear la app entera
    // (a diferencia de pedidos/stock/gastos/etc., esto es solo una señal informativa).
    supabase.from('stock_ajustes_fallidos').select('*').eq('resuelto', false).then(({ data, error }) => {
      if (!cancelado && !error && data) setStockAjustesFallidos(data)
    })
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
    return { ok: true, data }
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
      setPedidoPagos(prev => prev.filter(pg => pg.pedido_id !== pedido.id))
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
    return { ok: true, data }
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
      setEsquejePagos(prev => prev.filter(pg => pg.esqueje_id !== esqueje.id))
      if (esqueje.entregado) {
        await aplicarDeltas(acumularCantidades(esqueje.geneticas, 1, {}), 'ajustar_stock_esquejes', setStockEsquejes)
      }
    }
  }, [])

  const agregarPagoPedido = useCallback(async (pedido, pago) => {
    const { data, error } = await supabase.from('pedido_pagos').insert({ pedido_id: pedido.id, ...pago }).select().single()
    if (error || !data) { console.error('Error al guardar pago', error); return { ok: false, error } }
    setPedidoPagos(prev => [data, ...prev])
    return { ok: true, data }
  }, [])

  const eliminarPagoPedido = useCallback(async id => {
    const { error } = await supabase.from('pedido_pagos').delete().eq('id', id)
    if (error) { console.error('Error al eliminar pago', error); return { ok: false, error } }
    setPedidoPagos(prev => prev.filter(pg => pg.id !== id))
    return { ok: true }
  }, [])

  const agregarPagoEsqueje = useCallback(async (esqueje, pago) => {
    const { data, error } = await supabase.from('esqueje_pagos').insert({ esqueje_id: esqueje.id, ...pago }).select().single()
    if (error || !data) { console.error('Error al guardar pago', error); return { ok: false, error } }
    setEsquejePagos(prev => [data, ...prev])
    return { ok: true, data }
  }, [])

  const eliminarPagoEsqueje = useCallback(async id => {
    const { error } = await supabase.from('esqueje_pagos').delete().eq('id', id)
    if (error) { console.error('Error al eliminar pago', error); return { ok: false, error } }
    setEsquejePagos(prev => prev.filter(pg => pg.id !== id))
    return { ok: true }
  }, [])

  const editarPagoPedido = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('pedido_pagos').update(cambios).eq('id', id).select().single()
    if (error || !data) { console.error('Error al editar pago', error); return { ok: false, error } }
    setPedidoPagos(prev => prev.map(pg => pg.id === id ? data : pg))
    return { ok: true, data }
  }, [])

  const editarPagoEsqueje = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('esqueje_pagos').update(cambios).eq('id', id).select().single()
    if (error || !data) { console.error('Error al editar pago', error); return { ok: false, error } }
    setEsquejePagos(prev => prev.map(pg => pg.id === id ? data : pg))
    return { ok: true, data }
  }, [])

  const editarStock = useCallback((genetica, nuevoValor) => ajustarStockDirecto(genetica, nuevoValor, 'ajustar_stock', stock, setStock), [stock])
  const editarStockEsquejes = useCallback((genetica, nuevoValor) => ajustarStockDirecto(genetica, nuevoValor, 'ajustar_stock_esquejes', stockEsquejes, setStockEsquejes), [stockEsquejes])
  const editarInicial = useCallback((genetica, nuevoValor) => actualizarInicialDirecto(genetica, nuevoValor, 'stock', setStockInicial), [])
  const editarInicialEsquejes = useCallback((genetica, nuevoValor) => actualizarInicialDirecto(genetica, nuevoValor, 'stock_esquejes', setStockEsquejesInicial), [])

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
          <button className={`tab${tab === 'pedidos' ? ' active' : ''}`} onClick={() => irATab('pedidos')}>Pedidos</button>
          <button className={`tab${tab === 'gastos' ? ' active' : ''}`} onClick={() => irATab('gastos')}>Gastos</button>
          <button className={`tab${tab === 'finanzas' ? ' active' : ''}`} onClick={() => irATab('finanzas')}>Finanzas</button>
          <button className={`tab${tab === 'riegos' ? ' active' : ''}`} onClick={() => irATab('riegos')}>Riegos</button>
          <button className={`tab${tab === 'calendario' ? ' active' : ''}`} onClick={() => irATab('calendario')}>Cultivo</button>
        </div>
      </div>
      {tab === 'pedidos' && (
        <TabPedidos
          target={objetivoRevision}
          pedidos={pedidos}
          stock={stock}
          stockInicial={stockInicial}
          onGuardarPedido={guardarPedido}
          onActualizarPedido={actualizarPedido}
          onEliminarPedido={eliminarPedido}
          esquejes={esquejes}
          stockEsquejes={stockEsquejes}
          stockEsquejesInicial={stockEsquejesInicial}
          onGuardarEsqueje={guardarEsqueje}
          onActualizarEsqueje={actualizarEsqueje}
          onEliminarEsqueje={eliminarEsqueje}
          miembro={miembro}
          ajustesFallidos={stockAjustesFallidos}
          onEditarStock={editarStock}
          onEditarStockEsquejes={editarStockEsquejes}
          onEditarInicial={editarInicial}
          onEditarInicialEsquejes={editarInicialEsquejes}
          pedidoPagos={pedidoPagos}
          esquejePagos={esquejePagos}
          onAgregarPagoPedido={agregarPagoPedido}
          onEditarPagoPedido={editarPagoPedido}
          onEliminarPagoPedido={eliminarPagoPedido}
          onAgregarPagoEsqueje={agregarPagoEsqueje}
          onEditarPagoEsqueje={editarPagoEsqueje}
          onEliminarPagoEsqueje={eliminarPagoEsqueje}
        />
      )}
      {tab === 'gastos' && <TabGastos target={objetivoRevision} miembro={miembro} gastos={gastos} presupuestos={presupuestos} onGuardarGasto={guardarGasto} onActualizarGasto={actualizarGasto} onEliminarGasto={eliminarGasto} />}
      {tab === 'finanzas' && <TabFinanzas onRevisar={irARevisar} pedidos={pedidos} esquejes={esquejes} miembro={miembro} gastos={gastos} presupuestos={presupuestos} setPresupuestos={setPresupuestos} aportes={aportes} setAportes={setAportes} gastosFijos={gastosFijos} setGastosFijos={setGastosFijos} pedidoPagos={pedidoPagos} esquejePagos={esquejePagos} />}
      {tab === 'riegos' && <TabRiegos onRiegosChange={handleRiegosChange} />}
      {tab === 'calendario' && <TabCalendario riegoPromediosVege={riegoPromediosVege} riegoPromediosFlora={riegoPromediosFlora} />}
      {mostrarCambiarPass && <ModalCambiarPassword onCerrar={() => setMostrarCambiarPass(false)} />}
    </div>
  )
}
