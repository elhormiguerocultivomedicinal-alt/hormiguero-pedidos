import { useState, useCallback } from 'react'
import './App.css'

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

const formInicial = {
  socio: '',
  geneticas: [],
  precio: PRECIO_DEFAULT,
  propio: false,
  pagado: false,
  metodoPago: 'Transferencia',
  fechaCobro: '',
  entregado: false,
}

// ─── Formulario ───────────────────────────────────────────────
function FormNuevo({ onGuardar }) {
  const [miembro, setMiembro] = useState('Bruno')
  const [form, setForm] = useState(formInicial)
  const [toast, setToast] = useState({ show: false, msg: '' })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const precio = parseFloat(form.precio) || 0
  const total = form.propio ? 0 : form.geneticas.reduce((s, g) => s + (parseFloat(g.cantidad) || 0) * precio, 0)
  const cantidadTotal = form.geneticas.reduce((s, g) => s + (parseFloat(g.cantidad) || 0), 0)

  function toggleGenetica(nombre) {
    const existe = form.geneticas.find(g => g.nombre === nombre)
    const next = existe
      ? form.geneticas.filter(g => g.nombre !== nombre)
      : [...form.geneticas, { nombre, cantidad: '' }]
    set('geneticas', next)
  }

  function setCantidadGenetica(nombre, cantidad) {
    set('geneticas', form.geneticas.map(g => g.nombre === nombre ? { ...g, cantidad } : g))
  }

  function handlePropio(val) {
    setForm(f => ({ ...f, propio: val, precio: val ? 0 : PRECIO_DEFAULT, pagado: false, fechaCobro: '' }))
  }

  function handlePagado(val) {
    setForm(f => ({ ...f, pagado: val, fechaCobro: val ? hoyDDMM() : '' }))
  }

  function showToast(msg) {
    setToast({ show: true, msg })
    setTimeout(() => setToast({ show: false, msg: '' }), 2500)
  }

  function guardar() {
    const sinCantidad = form.geneticas.some(g => !parseFloat(g.cantidad))
    if (!form.socio.trim() || form.geneticas.length === 0 || sinCantidad) {
      showToast('Completá socio, genéticas y cantidades')
      return
    }
    const pedido = {
      id: Date.now(),
      fecha: hoyDDMM(),
      miembro,
      socio: form.socio.trim(),
      geneticas: form.geneticas,
      cantidadTotal,
      precio,
      total,
      propio: form.propio,
      pagado: form.pagado,
      metodoPago: form.metodoPago,
      fechaCobro: form.fechaCobro,
      entregado: form.entregado,
    }
    onGuardar(pedido)
    setForm(formInicial)
    showToast('Pedido guardado ✓')
  }

  return (
    <div className="content">
      {/* Miembro */}
      <div className="miembro-row">
        {MIEMBROS.map(m => (
          <button key={m} className={`miembro-btn${miembro === m ? ' active' : ''}`} onClick={() => setMiembro(m)}>{m}</button>
        ))}
      </div>

      {/* Datos del pedido */}
      <div className="card">
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Socio</label>
            <input className="form-control" type="text" placeholder="Nombre del socio..." value={form.socio} onChange={e => set('socio', e.target.value)} />
          </div>
          <div className="form-group full">
            <label className="form-label">Genética</label>
            <div className="genetica-grid">
              {GENETICAS.map(g => {
                const sel = form.geneticas.find(x => x.nombre === g)
                return (
                  <div key={g} className="genetica-item">
                    <button
                      type="button"
                      className={`genetica-btn${sel ? ' active' : ''}`}
                      onClick={() => toggleGenetica(g)}
                    >
                      {g}
                    </button>
                    {sel && (
                      <input
                        className="form-control genetica-cantidad"
                        type="number"
                        placeholder="g"
                        min="0"
                        value={sel.cantidad}
                        onChange={e => setCantidadGenetica(g, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
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

      {/* Toggles */}
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
                    <input className="form-control" type="text" placeholder="dd/mm" value={form.fechaCobro} onChange={e => set('fechaCobro', e.target.value)} />
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
function ListaPedidos({ pedidos }) {
  const [filtro, setFiltro] = useState('todos')

  const filtrados = pedidos.filter(p => {
    if (filtro === 'sin-entregar') return !p.entregado
    if (filtro === 'sin-cobrar') return !p.pagado && !p.propio
    return true
  })

  const totalVendido = pedidos.filter(p => !p.propio).reduce((s, p) => s + p.total, 0)
  const sinEntregar = pedidos.filter(p => !p.entregado).length

  return (
    <div className="content">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-num">{pedidos.length}</div>
          <div className="stat-lbl">Pedidos</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ fontSize: 16 }}>{formatPesos(totalVendido)}</div>
          <div className="stat-lbl">Vendido</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ color: sinEntregar > 0 ? '#854F0B' : undefined }}>{sinEntregar}</div>
          <div className="stat-lbl">Sin entregar</div>
        </div>
      </div>

      <div className="filtros-row">
        {[['todos', 'Todos'], ['sin-entregar', 'Sin entregar'], ['sin-cobrar', 'Sin cobrar']].map(([key, label]) => (
          <button key={key} className={`filtro-btn${filtro === key ? ' active' : ''}`} onClick={() => setFiltro(key)}>{label}</button>
        ))}
      </div>

      <div className="pedidos-list">
        {filtrados.length === 0 ? (
          <div className="empty-state">No hay pedidos aún.<br />Cargá el primero desde "Nuevo pedido".</div>
        ) : filtrados.map(p => (
          <div className="pedido-card" key={p.id}>
            <div>
              <div className="pedido-nombre">{p.socio}</div>
              <div className="pedido-sub">{p.geneticas.map(g => `${g.nombre} ${g.cantidad}g`).join(' · ')} · {p.fecha} · {p.miembro}</div>
              <div className="pedido-badges">
                <span className={`badge ${p.entregado ? 'badge-entregado' : 'badge-no-entregado'}`}>
                  {p.entregado ? 'Entregado' : 'No entregado'}
                </span>
                {p.propio
                  ? <span className="badge badge-propio">Consumo propio</span>
                  : <span className={`badge ${p.pagado ? 'badge-pagado' : 'badge-sin-cobrar'}`}>{p.pagado ? 'Pagado' : 'Sin cobrar'}</span>
                }
              </div>
            </div>
            <div className="pedido-right">
              <span className="pedido-total">{p.propio ? '—' : formatPesos(p.total)}</span>
              {p.pagado && <span className="pedido-metodo">{p.metodoPago}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── App raíz ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('nuevo')
  const [pedidos, setPedidos] = useState([])

  const guardarPedido = useCallback(p => {
    setPedidos(prev => [p, ...prev])
    setTab('pedidos')
  }, [])

  return (
    <div className="app">
      <div className="header">
        <div className="header-top">
          <div>
            <div className="header-title">El Hormiguero</div>
            <div className="header-sub">Registro de pedidos</div>
          </div>
        </div>
        <div className="tab-bar">
          <button className={`tab${tab === 'nuevo' ? ' active' : ''}`} onClick={() => setTab('nuevo')}>Nuevo pedido</button>
          <button className={`tab${tab === 'pedidos' ? ' active' : ''}`} onClick={() => setTab('pedidos')}>
            Pedidos {pedidos.length > 0 && `(${pedidos.length})`}
          </button>
        </div>
      </div>

      {tab === 'nuevo' ? <FormNuevo onGuardar={guardarPedido} /> : <ListaPedidos pedidos={pedidos} />}
    </div>
  )
}
