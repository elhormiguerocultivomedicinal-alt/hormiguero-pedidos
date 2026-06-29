import { useState, useCallback, useEffect } from 'react'
import './App.css'
import { supabase } from './supabase'

const GENETICAS = ['OG24K', 'Choco OG', 'Z-Kiem', 'Fancy', 'Gorilla Rainbow']
const MIEMBROS = ['Bruno', 'Checho', 'Nacho', 'Nico']
const PRECIO_DEFAULT = 12500

function formatPesos(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function hoyDDMM() {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function hoyCompleto() {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

const mesActual = () => {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getFullYear()}`
}

const filaVacia = () => ({ id: Date.now() + Math.random(), nombre: '', cantidad: '' })

const formInicial = {
  socio: '',
  filas: [filaVacia()],
  precio: PRECIO_DEFAULT,
  propio: false,
  pagado: false,
  metodoPago: 'Transferencia',
  fechaCobro: '',
  entregado: false,
}

const STOCK_INICIAL = {
  'OG24K': 286,
  'Choco OG': 384,
  'Z-Kiem': 546,
  'Fancy': 172,
  'Gorilla Rainbow': 557,
}

const CATEGORIAS_GASTOS = ['Servicios', 'Alquiler', 'Insumos cultivo', 'Marketing', 'Bonos comisión directiva', 'Gastos estructurales', 'Inversiones', 'Insumos varios']
const CATEGORIAS_GASTOS_MAP = {
  'Hormi 1.0': CATEGORIAS_GASTOS,
  'Hormi 2.0': CATEGORIAS_GASTOS,
}

// ─── DatePicker ───────────────────────────────────────────────
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const NOMBRES_MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function parseFechaDP(str) {
  if (!str) return null
  const p = str.split('/')
  if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
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

// ─── Modal edición completa ───────────────────────────────────
function ModalEditar({ pedido, onGuardar, onEliminar, onCerrar }) {
  const [form, setForm] = useState({
    socio: pedido.socio,
    miembro: pedido.miembro,
    fecha: pedido.fecha && pedido.mes ? `${pedido.fecha}/${pedido.mes.split('/')[1]}` : (pedido.fecha || ''),
    mes: pedido.mes || '',
    filas: pedido.geneticas.map(g => ({ id: Math.random(), nombre: g.nombre, cantidad: g.cantidad })),
    precio: pedido.precio,
    propio: pedido.propio,
    pagado: pedido.pagado,
    metodoPago: pedido.metodoPago || pedido.metodo_pago || 'Transferencia',
    fechaCobro: pedido.fechaCobro || pedido.fecha_cobro || '',
    entregado: pedido.entregado,
  })
  const [confirmando, setConfirmando] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const precio = parseFloat(form.precio) || 0
  const total = form.propio ? 0 : form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0) * precio, 0)

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() { set('filas', [...form.filas, { id: Math.random(), nombre: '', cantidad: '' }]) }
  function eliminarFila(id) { if (form.filas.length > 1) set('filas', form.filas.filter(f => f.id !== id)) }
  function handlePropio(val) { setForm(f => ({ ...f, propio: val, precio: val ? 0 : PRECIO_DEFAULT, pagado: false, fechaCobro: '' })) }
  function handlePagado(val) { setForm(f => ({ ...f, pagado: val, fechaCobro: val ? (form.fechaCobro || hoyCompleto()) : '' })) }

  function guardar() {
    const filasValidas = form.filas.filter(f => f.nombre)
    if (!form.socio.trim() || filasValidas.length === 0) return
    const geneticas = filasValidas.map(f => ({ nombre: f.nombre, cantidad: f.cantidad }))
    let mes = form.mes
    const partes = form.fecha.split('/')
    if (partes.length === 3) mes = `${parseInt(partes[1])}/${partes[2]}`
    onGuardar({ ...pedido, ...form, mes, geneticas, total, metodo_pago: form.metodoPago, fecha_cobro: form.fechaCobro })
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-titulo">Editar pedido</div>
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
                <input className="form-control fila-cantidad" type="number" placeholder="g" min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
              </div>
            ))}
          </div>
          <button className="btn-agregar-fila" onClick={agregarFila}>+ Agregar genética</button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Precio por g ($)</label>
            <input className="form-control" type="number" value={form.precio} onChange={e => set('precio', e.target.value)} disabled={form.propio} />
          </div>
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
                  <div className="form-group">
                    <label className="form-label">Método</label>
                    <select className="form-control" value={form.metodoPago} onChange={e => set('metodoPago', e.target.value)}>
                      <option>Transferencia</option>
                      <option>Efectivo</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha cobro</label>
                    <DatePicker value={form.fechaCobro} onChange={v => set('fechaCobro', v)} />
                  </div>
                </div>
              )}
            </>
          )}
          <div className="toggle-row">
            <span className="toggle-label">Pedido entregado</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.entregado} onChange={e => set('entregado', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
        <button className="btn-submit" style={{ marginTop: 16 }} onClick={guardar}>Guardar cambios</button>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} style={{ width: '100%', marginTop: 8, padding: '10px', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', background: 'transparent', color: '#791F1F', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Eliminar pedido
          </button>
        ) : (
          <div style={{ marginTop: 8, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>¿Confirmás la eliminación?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onEliminar(pedido)} style={{ flex: 1, padding: '9px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, eliminar</button>
              <button onClick={() => setConfirmando(false)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal editar gasto ───────────────────────────────────────
function ModalEditarGasto({ gasto, categorias, onGuardar, onEliminar, onCerrar }) {
  const [form, setForm] = useState({
    descripcion: gasto.descripcion,
    categoria: gasto.categoria,
    monto: gasto.monto,
    fecha: gasto.fecha || '',
    miembro: gasto.miembro || '',
  })
  const [confirmando, setConfirmando] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function guardar() {
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto)) return
    const partes = form.fecha.split('/')
    const mes = partes.length === 3 ? `${parseInt(partes[1])}/${partes[2]}` : gasto.mes
    onGuardar({ ...gasto, ...form, monto: parseFloat(form.monto), mes })
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
            <input className="form-control" type="number" min="0" value={form.monto} onChange={e => set('monto', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
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

// ─── Formulario nuevo pedido ──────────────────────────────────
function FormNuevo({ onGuardar }) {
  const [miembro, setMiembro] = useState('Bruno')
  const [form, setForm] = useState({ ...formInicial, filas: [filaVacia()] })
  const [toast, setToast] = useState({ show: false, msg: '' })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const precio = parseFloat(form.precio) || 0
  const total = form.propio ? 0 : form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0) * precio, 0)

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() { set('filas', [...form.filas, filaVacia()]) }
  function eliminarFila(id) { if (form.filas.length === 1) return; set('filas', form.filas.filter(f => f.id !== id)) }
  function handlePropio(val) { setForm(f => ({ ...f, propio: val, precio: val ? 0 : PRECIO_DEFAULT, pagado: false, fechaCobro: '' })) }
  function handlePagado(val) { setForm(f => ({ ...f, pagado: val, fechaCobro: val ? hoyCompleto() : '' })) }

  function showToast(msg) {
    setToast({ show: true, msg })
    setTimeout(() => setToast({ show: false, msg: '' }), 2500)
  }

  function guardar() {
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if (!form.socio.trim() || filasValidas.length === 0 || sinCantidad) {
      showToast('Completá socio, genética y cantidad')
      return
    }
    const geneticas = filasValidas.map(f => ({ nombre: f.nombre, cantidad: f.cantidad }))
    const pedido = {
      id: Date.now(),
      fecha: hoyCompleto(),
      miembro,
      socio: form.socio.trim(),
      geneticas,
      precio,
      total,
      propio: form.propio,
      pagado: form.pagado,
      metodoPago: form.metodoPago,
      fechaCobro: form.fechaCobro,
      entregado: form.entregado,
    }
    onGuardar(pedido)
    setForm({ ...formInicial, filas: [filaVacia()] })
    showToast('Pedido guardado ✓')
  }

  return (
    <div className="content">
      <div className="miembro-row">
        {MIEMBROS.map(m => (
          <button key={m} className={`miembro-btn${miembro === m ? ' active' : ''}`} onClick={() => setMiembro(m)}>{m}</button>
        ))}
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
                  <input className="form-control fila-cantidad" type="number" placeholder="g" min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                  {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
                </div>
              ))}
            </div>
            <button className="btn-agregar-fila" onClick={agregarFila}>+ Agregar genética al pedido</button>
          </div>
          <div className="form-group">
            <label className="form-label">Precio por g ($)</label>
            <input className="form-control" type="number" placeholder="0" min="0" value={form.precio} onChange={e => set('precio', e.target.value)} disabled={form.propio} />
          </div>
          <div className="form-group">
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
                  <div className="form-group">
                    <label className="form-label">Método</label>
                    <select className="form-control" value={form.metodoPago} onChange={e => set('metodoPago', e.target.value)}>
                      <option>Transferencia</option>
                      <option>Efectivo</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha cobro</label>
                    <DatePicker value={form.fechaCobro} onChange={v => set('fechaCobro', v)} />
                  </div>
                </div>
              )}
            </>
          )}
          <div className="toggle-row">
            <span className="toggle-label">Pedido entregado</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.entregado} onChange={e => set('entregado', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
      <button className="btn-submit" onClick={guardar}>Guardar pedido</button>
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Lista de pedidos ─────────────────────────────────────────
function ListaPedidos({ pedidos, onActualizar, onEliminar }) {
  const [filtro, setFiltro] = useState('todos')
  const [mesActivo, setMesActivo] = useState(mesActual())
  const [editando, setEditando] = useState(null)

  const meses = [...new Set(pedidos.map(p => p.mes).filter(Boolean))].sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number)
    const [mb, yb] = b.split('/').map(Number)
    return yb !== ya ? yb - ya : mb - ma
  })

  const filtrados = pedidos.filter(p => {
    const mesOk = mesActivo === 'todos' || p.mes === mesActivo
    if (filtro === 'sin-entregar') return mesOk && !p.entregado
    if (filtro === 'sin-cobrar') return mesOk && !p.pagado && !p.propio
    return mesOk
  })

  const totalVendido = filtrados.filter(p => !p.propio).reduce((s, p) => s + p.total, 0)
  const sinEntregar = filtrados.filter(p => !p.entregado).length
  const NOMBRES_MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  function formatMes(mes) {
    if (!mes) return mes
    const [m, y] = mes.split('/')
    return `${NOMBRES_MESES[parseInt(m)]} ${y}`
  }

  return (
    <div className="content">
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
          ? <div className="empty-state">No hay pedidos para mostrar.</div>
          : filtrados.map(p => (
            <div className="pedido-card" key={p.id} onClick={() => setEditando(p)}>
              <div>
                <div className="pedido-nombre">{p.socio}</div>
                <div className="pedido-sub">{p.geneticas.map(g => `${g.nombre} ${g.cantidad}g`).join(' · ')} · {p.fecha} · {p.miembro}</div>
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
                {p.pagado && <span className="pedido-metodo">{p.metodoPago || p.metodo_pago}</span>}
                <span className="pedido-editar-hint">Tocar para editar</span>
              </div>
            </div>
          ))
        }
      </div>
      {editando && (
        <ModalEditar
          pedido={editando}
          onGuardar={actualizado => { onActualizar(actualizado, editando); setEditando(null) }}
          onEliminar={p => { onEliminar(p, editando); setEditando(null) }}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

// ─── Tab Stock Producción ─────────────────────────────────────
function TabStock({ stock }) {
  const totalActual = Object.values(stock).reduce((s, v) => s + v, 0)
  const totalInicial = Object.values(STOCK_INICIAL).reduce((s, v) => s + v, 0)
  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center', marginBottom: 14 }}>
          <span className="form-label">Genética</span>
          <span className="form-label">Inicial</span>
          <span className="form-label">Actual</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {GENETICAS.map(g => {
            const gramos = stock[g] ?? 0
            const inicial = STOCK_INICIAL[g] ?? 0
            const pct = Math.max(0, Math.min(100, (gramos / inicial) * 100))
            const color = gramos === 0 ? '#791F1F' : gramos < 50 ? '#854F0B' : 'var(--green-dark)'
            return (
              <div key={g}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{g}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inicial}g</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color }}>{gramos}g</span>
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
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{totalInicial}g</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{totalActual}g</span>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Gastos ───────────────────────────────────────────────
function PanelGastos({ locacion, gastos, onNuevoGasto, onActualizarGasto, onEliminarGasto }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ descripcion: '', categoria: '', monto: '', fecha: '', miembro: '' })
  const [toast, setToast] = useState({ show: false, msg: '' })
  const [filtroMes, setFiltroMes] = useState('todos')
  const [filtrocat, setFiltrocat] = useState('todas')
  const [editando, setEditando] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const categorias = CATEGORIAS_GASTOS_MAP[locacion] || CATEGORIAS_GASTOS

  function showToast(msg) {
    setToast({ show: true, msg })
    setTimeout(() => setToast({ show: false, msg: '' }), 2500)
  }

  async function guardarGasto() {
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto)) {
      showToast('Completá descripción, categoría y monto')
      return
    }
    const partes = (form.fecha || '').split('/')
    const mes = partes.length === 3 ? `${parseInt(partes[1])}/${partes[2]}` : mesActual()
    const nuevoGasto = { descripcion: form.descripcion.trim(), categoria: form.categoria, monto: parseFloat(form.monto), fecha: form.fecha, mes, locacion, miembro: form.miembro || null }
    const { data, error } = await supabase.from('gastos').insert(nuevoGasto).select().single()
    if (!error && data) {
      onNuevoGasto(data)
      setForm({ descripcion: '', categoria: '', monto: '', fecha: '', miembro: '' })
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
          <select className="form-control" style={{ flex: 1, height: 34, fontSize: 12 }} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="todos">Todos los meses</option>
            {meses.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="form-control" style={{ flex: 1, height: 34, fontSize: 12 }} value={filtrocat} onChange={e => setFiltrocat(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {mostrarForm && (
        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>Quién registra</label>
            <div className="miembro-row">
              {MIEMBROS.map(m => (
                <button key={m} className={`miembro-btn${form.miembro === m ? ' active' : ''}`} onClick={() => set('miembro', m)}>{m}</button>
              ))}
            </div>
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
              <input className="form-control" type="number" placeholder="0" min="0" value={form.monto} onChange={e => set('monto', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
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
                <div className="pedido-sub">{g.fecha} · {g.categoria}{g.miembro ? ` · ${g.miembro}` : ''}</div>
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
          onGuardar={async actualizado => {
            const { error } = await supabase.from('gastos').update({ descripcion: actualizado.descripcion, categoria: actualizado.categoria, monto: actualizado.monto, fecha: actualizado.fecha, mes: actualizado.mes, miembro: actualizado.miembro || null }).eq('id', actualizado.id)
            if (!error) { onActualizarGasto(actualizado); showToast('Gasto actualizado ✓') }
            setEditando(null)
          }}
          onEliminar={async g => {
            const { error } = await supabase.from('gastos').delete().eq('id', g.id)
            if (!error) onEliminarGasto(g)
            setEditando(null)
          }}
          onCerrar={() => setEditando(null)}
        />
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function TabGastos() {
  const [gastos, setGastos] = useState([])
  const [locacion, setLocacion] = useState('Hormi 1.0')
  useEffect(() => {
    supabase.from('gastos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setGastos(data) })
  }, [])
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
        onNuevoGasto={g => setGastos(prev => [g, ...prev])}
        onActualizarGasto={actualizado => setGastos(prev => prev.map(g => g.id === actualizado.id ? actualizado : g))}
        onEliminarGasto={g => setGastos(prev => prev.filter(x => x.id !== g.id))}
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
  const [toast, setToast] = useState({ show: false, msg: '' })
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
      <button className="btn-submit" style={{ marginTop: 14, background: color }} onClick={() => { setToast({ show: true, msg: `Semana ${semana} guardada ✓` }); setTimeout(() => setToast({ show: false, msg: '' }), 2000) }}>
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
    const vals = riegos.map(r => parseFloat(r[k])).filter(v => !isNaN(v))
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
  const [toast, setToast] = useState({ show: false, msg: '' })

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

  function showToast(msg) {
    setToast({ show: true, msg })
    setTimeout(() => setToast({ show: false, msg: '' }), 2500)
  }

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

// ─── App raíz ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('nuevo')
  const [pedidos, setPedidos] = useState([])
  const [stock, setStock] = useState(STOCK_INICIAL)
  const [riegoPromediosVege, setRiegoPromediosVege] = useState({})
  const [riegoPromediosFlora, setRiegoPromediosFlora] = useState({})
  const [cargando, setCargando] = useState(true)
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
    async function cargarDatos() {
      const { data: pedidosData } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false })
      if (pedidosData) setPedidos(pedidosData.map(p => ({ ...p, metodoPago: p.metodo_pago, fechaCobro: p.fecha_cobro })))
      const { data: stockData } = await supabase.from('stock').select('*')
      if (stockData) {
        const stockObj = {}
        stockData.forEach(s => { stockObj[s.genetica] = s.gramos })
        setStock(stockObj)
      }
      setCargando(false)
    }
    cargarDatos()
  }, [sesion])

  function handleRiegosChange(etapa, promedios) {
    if (etapa === 'vegetativo') setRiegoPromediosVege(promedios)
    else setRiegoPromediosFlora(promedios)
  }

  const guardarPedido = useCallback(async p => {
    const { data, error } = await supabase.from('pedidos').insert({
      fecha: p.fecha, mes: mesActual(), miembro: p.miembro, socio: p.socio,
      geneticas: p.geneticas, precio: p.precio, total: p.total, propio: p.propio,
      pagado: p.pagado, metodo_pago: p.metodoPago, fecha_cobro: p.fechaCobro, entregado: p.entregado,
    }).select().single()
    if (!error && data) {
      const pedidoGuardado = { ...data, metodoPago: data.metodo_pago, fechaCobro: data.fecha_cobro }
      setPedidos(prev => [pedidoGuardado, ...prev])
      if (p.entregado) {
        for (const g of p.geneticas) {
          const nuevoStock = (stock[g.nombre] ?? 0) - parseFloat(g.cantidad)
          await supabase.from('stock').update({ gramos: nuevoStock }).eq('genetica', g.nombre)
          setStock(prev => ({ ...prev, [g.nombre]: nuevoStock }))
        }
      }
    }
    setTab('pedidos')
  }, [stock])

  const actualizarPedido = useCallback(async (actualizado, anterior) => {
    const { error } = await supabase.from('pedidos').update({
      socio: actualizado.socio, miembro: actualizado.miembro, fecha: actualizado.fecha,
      mes: actualizado.mes, geneticas: actualizado.geneticas, precio: actualizado.precio,
      total: actualizado.total, propio: actualizado.propio, pagado: actualizado.pagado,
      metodo_pago: actualizado.metodo_pago || actualizado.metodoPago,
      fecha_cobro: actualizado.fecha_cobro || actualizado.fechaCobro, entregado: actualizado.entregado,
    }).eq('id', actualizado.id)
    if (!error) {
      setPedidos(prev => prev.map(p => p.id === actualizado.id ? { ...actualizado, metodoPago: actualizado.metodo_pago || actualizado.metodoPago, fechaCobro: actualizado.fecha_cobro || actualizado.fechaCobro } : p))
      if (anterior.entregado) {
        for (const g of anterior.geneticas) {
          const nuevoStock = (stock[g.nombre] ?? 0) + parseFloat(g.cantidad)
          await supabase.from('stock').update({ gramos: nuevoStock }).eq('genetica', g.nombre)
          setStock(prev => ({ ...prev, [g.nombre]: nuevoStock }))
        }
      }
      if (actualizado.entregado) {
        for (const g of actualizado.geneticas) {
          const nuevoStock = (stock[g.nombre] ?? 0) - parseFloat(g.cantidad)
          await supabase.from('stock').update({ gramos: nuevoStock }).eq('genetica', g.nombre)
          setStock(prev => ({ ...prev, [g.nombre]: nuevoStock }))
        }
      }
    }
  }, [stock])

  const eliminarPedido = useCallback(async (pedido) => {
    const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
    if (!error) {
      setPedidos(prev => prev.filter(p => p.id !== pedido.id))
      if (pedido.entregado) {
        for (const g of pedido.geneticas) {
          const nuevoStock = (stock[g.nombre] ?? 0) + parseFloat(g.cantidad)
          await supabase.from('stock').update({ gramos: nuevoStock }).eq('genetica', g.nombre)
          setStock(prev => ({ ...prev, [g.nombre]: nuevoStock }))
        }
      }
    }
  }, [stock])

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
          <button className={`tab${tab === 'nuevo' ? ' active' : ''}`} onClick={() => setTab('nuevo')}>Pedidos</button>
          <button className={`tab${tab === 'pedidos' ? ' active' : ''}`} onClick={() => setTab('pedidos')}>Lista</button>
          <button className={`tab${tab === 'stock' ? ' active' : ''}`} onClick={() => setTab('stock')}>Stock</button>
          <button className={`tab${tab === 'gastos' ? ' active' : ''}`} onClick={() => setTab('gastos')}>Gastos</button>
          <button className={`tab${tab === 'riegos' ? ' active' : ''}`} onClick={() => setTab('riegos')}>Riegos</button>
          <button className={`tab${tab === 'calendario' ? ' active' : ''}`} onClick={() => setTab('calendario')}>Cultivo</button>
        </div>
      </div>
      {tab === 'nuevo' && <FormNuevo onGuardar={guardarPedido} />}
      {tab === 'pedidos' && <ListaPedidos pedidos={pedidos} onActualizar={actualizarPedido} onEliminar={eliminarPedido} />}
      {tab === 'stock' && <TabStock stock={stock} />}
      {tab === 'gastos' && <TabGastos />}
      {tab === 'riegos' && <TabRiegos onRiegosChange={handleRiegosChange} />}
      {tab === 'calendario' && <TabCalendario riegoPromediosVege={riegoPromediosVege} riegoPromediosFlora={riegoPromediosFlora} />}
      {mostrarCambiarPass && <ModalCambiarPassword onCerrar={() => setMostrarCambiarPass(false)} />}
    </div>
  )
}
