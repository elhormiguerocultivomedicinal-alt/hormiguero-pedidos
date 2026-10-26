import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo, useId, memo } from 'react'
import { Landmark, Wallet, ChevronDown, ChevronUp, Target, TriangleAlert, Info, Check, Package, Flag, Tag } from 'lucide-react'
import './App.css'
import { supabase } from './supabase'
import { evaluarRegistro, colorPorIntensidad } from './parametrosTurba'
import { evaluarFinanzas, objetivoPago, objetivoGasto, describirDescartado } from './agenteFinanzas'
import { gastosParecidos, pagosParecidos, ventasParecidas, capitalParecidos, cambiosParecidos, devolucionPareceGasto, normalizarTexto } from './duplicados'
import { resumenAporte, resumenCapitalPorInversor, resumenCambios, interesPactado, equivalenteDevolucion, parseDecimal, cotizacionParaFechaISO, cotizacionLejosDelBlue, TOLERANCIA_CAPITAL } from './capital'

const GENETICAS = ['OG24K', 'Choco OG', 'Z-Kiem', 'Fancy', 'Gorilla Rainbow']
const GENETICAS_ESQUEJES = ['OG24K', 'Black Domina', 'Z-Kiem', 'Fancy', 'Gorilla Rainbow', 'Dosichoc']
const GENETICAS_CULTIVO = ['OG24K', 'Choco OG', 'Z-Kiem', 'R-Kiem', 'Fancy', 'Gorilla Rainbow', 'Black Domina', 'Dosichoc', 'Silver', 'Tanner']
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

// Un formateador armado una sola vez: toLocaleString arma uno nuevo en cada llamada, y con miles
// de montos en pantalla (Capital con cientos de aportes y cambios) se llevaba más de un segundo.
const FORMATO_PESOS = new Intl.NumberFormat('es-AR')
const FORMATO_DOLARES = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPesos(n) {
  const v = Number(n)
  const r = Math.round(isFinite(v) ? v : 0)
  return (r < 0 ? '-$' : '$') + FORMATO_PESOS.format(Math.abs(r))
}

function formatDolares(n) {
  const v = Number(n)
  const r = Math.round(isFinite(v) ? v : 0)
  return (r < 0 ? '-US$' : 'US$') + FORMATO_DOLARES.format(Math.abs(r))
}

function hoyCompleto() {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

// Hoy en hora LOCAL como aaaa-mm-dd. No usar toISOString(): es UTC y después de las
// 21 h (Argentina) devuelve el día siguiente — ya pasó con cobros reales.
function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Formato único de la fecha de un gasto: d/m/aaaa sin ceros a la izquierda (lo que
// produce el DatePicker). Acepta también aaaa-mm-dd (compras de Stock) o d/m/aaaa con
// ceros, y devuelve null si no es una fecha real (ej. 31/2/2026).
function normalizarFechaGasto(str) {
  const s = String(str || '').trim()
  let d, m, y
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) [y, m, d] = s.split('-').map(Number)
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) [d, m, y] = s.split('/').map(Number)
  else return null
  const f = new Date(y, m - 1, d)
  if (f.getFullYear() !== y || f.getMonth() !== m - 1 || f.getDate() !== d) return null
  return `${d}/${m}/${y}`
}

// El mes de un gasto siempre sale de su fecha, nunca del día en que se cargó.
function mesDeFecha(fechaDMA) {
  const [, m, y] = fechaDMA.split('/')
  return `${Number(m)}/${y}`
}

function parseFechaCompleta(str) {
  const partes = String(str || '').split('/')
  if (partes.length !== 3) return null
  const [d, m, y] = partes.map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d).getTime()
}

// Semana de calendario (7 días) de una fecha respecto al inicio del ciclo. Nunca por debajo de 1.
function semanaDesdeFecha(fecha, fechaInicio) {
  const inicio = parseFechaCompleta(fechaInicio)
  const t = parseFechaCompleta(fecha)
  if (inicio == null || t == null) return 1
  const dias = Math.round((t - inicio) / 86400000)
  return Math.max(1, Math.floor(dias / 7) + 1)
}

// Fecha aproximada (inicio de esa semana) para prellenar el formulario al registrar un riego en una semana pasada.
function fechaDeSemana(fechaInicio, semana) {
  const inicio = parseFechaCompleta(fechaInicio)
  if (inicio == null) return hoyCompleto()
  return formatFechaCompleta(new Date(inicio + (semana - 1) * 7 * 86400000))
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

const CATEGORIAS_GASTOS = ['Servicios', 'Alquiler', 'Insumos cultivo', 'Marketing', 'Bonos comisión directiva', 'Gastos estructurales', 'Inversiones', 'Insumos varios', 'Comida', 'Herramientas']
const CATEGORIAS_GASTOS_MAP = {
  'Hormi 1.0': CATEGORIAS_GASTOS,
  'Hormi 2.0': CATEGORIAS_GASTOS,
}

// ─── Stock de insumos de cultivo ───────────────────────────────
// Categorías fijas en código; los ítems dentro de cada una son 100% editables
// desde la app (tabla insumos_stock), mismo espíritu que el catálogo de genéticas.
const CATEGORIAS_STOCK_INSUMOS = ['Sustrato', 'Macetas', 'Fertilizantes', 'Riego', 'Iluminación', 'Equipamiento', 'Empaque']
// Cada compra de insumo genera un gasto automático en `gastos` — mapeo a la categoría existente.
const CATEGORIA_GASTO_POR_INSUMO = {
  Sustrato: 'Insumos cultivo', Macetas: 'Insumos cultivo', Fertilizantes: 'Insumos cultivo',
  Riego: 'Insumos cultivo', Iluminación: 'Insumos cultivo', Empaque: 'Insumos cultivo',
  Equipamiento: 'Herramientas',
}
const LABEL_TIPO_MOVIMIENTO = { compra: 'Compra', consumo: 'Consumo', ajuste: 'Ajuste', baja: 'Baja' }

// ─── Tareas: anotaciones del equipo (laborales, compras, gastos estructurales,
// etc.), con aviso al entrar a la app ordenado por prioridad. El tipo es un
// catálogo editable (tabla tareas_tipos), igual que genéticas/insumos.
const MAX_PALABRAS_TAREA = 15
const MAX_PALABRAS_PRESUPUESTO = 15
const PRIORIDADES_TAREA = [
  { valor: 'alta', label: 'Alta' },
  { valor: 'media', label: 'Media' },
  { valor: 'baja', label: 'Baja' },
]
const ORDEN_PRIORIDAD_TAREA = { alta: 0, media: 1, baja: 2 }
const COLOR_PRIORIDAD_TAREA = { alta: '#791F1F', media: '#854F0B', baja: 'var(--text-secondary)' }
const FONDO_PRIORIDAD_TAREA = { alta: '#FCEBEB', media: '#FAEEDA', baja: 'var(--bg-secondary)' }
const BORDE_PRIORIDAD_TAREA = { alta: '#E8B4B4', media: '#E8C77E', baja: 'var(--border-mid)' }
const LABEL_PRIORIDAD_TAREA = { alta: 'Alta', media: 'Media', baja: 'Baja' }

function contarPalabras(texto) {
  const limpio = (texto || '').trim()
  return limpio ? limpio.split(/\s+/).length : 0
}

function ordenarTareas(lista) {
  return [...lista].sort((a, b) =>
    ORDEN_PRIORIDAD_TAREA[a.prioridad] - ORDEN_PRIORIDAD_TAREA[b.prioridad] ||
    new Date(a.created_at) - new Date(b.created_at))
}

// ─── Finanzas: cuentas ──────────────────────────────────────────
const CUENTA_EFECTIVO = 'Efectivo - Caja Hormi'
// Cuenta bancaria propia del Hormiguero (CUIT), todavía no abierta — se deja montada ya para que
// las transferencias de membresías tengan dónde caer; renombrar acá cuando exista la cuenta real.
const CUENTA_HORMIGUERO = 'Cuenta Hormiguero (CUIT)'
const CUENTAS_BANCARIAS = ['NaranjaX - Nacho', 'NaranjaX - Nico', 'NaranjaX - Bruno', 'Lemon - Checho', CUENTA_HORMIGUERO]
const CUENTAS = [...CUENTAS_BANCARIAS, CUENTA_EFECTIVO]
// Transferencia de una venta de membresía: siempre a CUENTA_HORMIGUERO, sin elegir — todas las
// transferencias de membresías van a la misma cuenta de la organización, no a una personal.
// Efectivo arranca en CUENTA_EFECTIVO (cuentaPara/handleMetodoPago la preseleccionan) pero queda
// editable, a diferencia de una membresía: puede haber que corregirla a otra cuenta real.
function opcionesCuenta(metodoPago, esMembresia) {
  if (esMembresia) return [CUENTA_HORMIGUERO]
  if (metodoPago === 'Efectivo') return CUENTAS
  return CUENTAS_BANCARIAS
}
// Caja de efectivo en dólares: donde caen los aportes de Capital recibidos en efectivo en US$,
// igual que CUENTA_EFECTIVO para los pesos.
const CUENTA_EFECTIVO_DOLARES = 'Efectivo (Dólar) - Caja Hormi'
const CUENTAS_DOLARES_BANCARIAS = ['NaranjaX (Dólar) - Nacho', 'NaranjaX (Dólar) - Nico', 'Lemon (Dólar) - Checho']
const CUENTAS_DOLARES = [...CUENTAS_DOLARES_BANCARIAS, CUENTA_EFECTIVO_DOLARES]
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
// `geneticas` NO va acá: el catálogo es editable desde la app (tablas
// geneticas_cosecha/geneticas_esquejes), así que siempre se inyecta como override
// en el cfg de cada call site (TabVentas/TabPropio/TabSocios), nunca se lee este default.
const CFG_COSECHA = {
  unidad: 'g', stockInicial: STOCK_INICIAL, stockLow: 50, rpcStock: 'ajustar_stock',
  color: 'var(--green-dark)', colorLight: 'var(--green-light)', colorBorde: null, btnBg: null,
  nuevaFila: filaVacia, precioDefaultFila: PRECIO_DEFAULT,
  singular: 'pedido', plural: 'pedidos', labelEntregado: 'Pedido entregado', txtEliminar: 'Eliminar pedido',
  fkPagos: 'pedido_id',
}
const CFG_ESQUEJES = {
  unidad: 'u', stockInicial: STOCK_ESQUEJES_INICIAL, stockLow: 20, rpcStock: 'ajustar_stock_esquejes',
  color: COLOR_ESQUEJES, colorLight: COLOR_ESQUEJES_LIGHT, colorBorde: COLOR_ESQUEJES_BORDER, btnBg: COLOR_ESQUEJES,
  nuevaFila: filaEsquejeVacia, precioDefaultFila: '',
  singular: 'esqueje', plural: 'esquejes', labelEntregado: 'Entregado', txtEliminar: 'Eliminar',
  fkPagos: 'esqueje_id',
}

// ─── Insumos: venta puntual de equipos/instrumental de cultivo (leds, carpas,
// extracción, etc.) — sin stock/catálogo fijo, texto libre por ítem, pero mismo
// carrito + ledger de pagos que Cosecha/Esquejes ─────────────────────────────
const COLOR_INSUMOS = '#2C5282'
const COLOR_INSUMOS_LIGHT = '#EBF2FA'
const COLOR_INSUMOS_BORDER = '#90B4DE'
const CFG_INSUMOS = {
  unidad: 'u', geneticas: null, tieneStock: false,
  nuevaFila: filaEsquejeVacia, precioDefaultFila: '',
  color: COLOR_INSUMOS, colorBorde: COLOR_INSUMOS_BORDER, btnBg: COLOR_INSUMOS,
  singular: 'venta', plural: 'ventas',
  labelEntregado: 'Entregado', txtEliminar: 'Eliminar venta',
  labelFilas: 'Insumo', labelSocio: 'Comprador', placeholderSocio: 'Nombre del comprador...',
  tituloNuevo: 'Registro de nueva venta', tituloLista: 'Ventas registradas',
  txtAgregarFila: '+ Agregar insumo a la venta', txtGuardado: 'Venta guardada ✓',
  fkPagos: 'insumo_id',
}

// ─── Membresías de socios (solo Cosecha) ───────────────────────
// El precio por gramo de cada tier ya deja el total bien puesto con la
// fórmula que usa cualquier fila de genética (cantidad × precio): no hace
// falta ningún cálculo de total aparte para una venta de membresía.
const MEMBRESIAS = {
  A: { gramos: 5, precio: 57500, precioPorGramo: 11500 },
  B: { gramos: 10, precio: 105000, precioPorGramo: 10500 },
  C: { gramos: 15, precio: 142500, precioPorGramo: 9500 },
  D: { gramos: 20, precio: 170000, precioPorGramo: 8500 },
}
const ORDEN_MEMBRESIAS = ['A', 'B', 'C', 'D']
const maxGeneticasMembresia = tier => ORDEN_MEMBRESIAS.indexOf(tier) + 1

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

function esDesdeCorte(fechaStr, corteISO) {
  if (!fechaStr) return true            // sin fecha (imports jun-jul): se cuentan igual
  const d = parseFechaDP(fechaStr)
  if (!d) return true                   // fecha ilegible: contarla, no perder plata
  const [y, m, dd] = (corteISO || FECHA_CORTE_DEFAULT).split('-').map(Number)
  const corte = new Date(y, m - 1, dd)  // corte como fecha LOCAL (misma base que parseFechaDP)
  return d >= corte
}

// Los pagos de pedidos/esquejes ya guardan una fecha ISO real por evento (a diferencia de
// fecha/fecha_cobro, que son texto legado dd/mm/aaaa) — comparar contra el corte es una
// simple comparación de strings ISO, sin pasar por parseFechaDP.
function esDesdeCorteISO(fechaISO, corteISO) {
  if (!fechaISO) return true
  return fechaISO >= (corteISO || FECHA_CORTE_DEFAULT)
}

// Cotización del dólar blue del día de una fecha DD/MM/YYYY (formato de gastos) — usa la más
// cercana ANTERIOR si no hay fila exacta para ese día (fin de semana, o un gasto de antes de que
// existiera esta tabla), y si no hay ninguna anterior, la más vieja disponible.
function cotizacionParaFecha(fechaStr, cotizaciones) {
  if (!cotizaciones || cotizaciones.length === 0) return null
  const d = parseFechaDP(fechaStr)
  if (!d) return cotizaciones[0] // fecha ilegible: usar la más reciente conocida
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return cotizaciones.find(c => c.fecha === iso) || cotizaciones.find(c => c.fecha < iso) || cotizaciones[cotizaciones.length - 1]
}

// Para combinar un monto en USD en un total general en pesos (KPIs de "ahora mismo", no
// históricos) — usa la cotización de HOY, a diferencia de gastoDePresupuesto que usa la del día
// de cada gasto puntual.
function valorEnPesos(monto, moneda, cotizacionHoy) {
  if (moneda !== 'USD') return monto
  return cotizacionHoy ? monto * cotizacionHoy.promedio : 0
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
  // Coma decimal (formato argentino): la app no usa centavos, así que todo lo que va después de
  // una coma se descarta. Antes "1.500,75" quedaba como $150.075 porque se juntaban los dígitos.
  // Al tipear, la coma desaparece del display: este flag hace que los dígitos que siguen
  // (los centavos) se ignoren hasta que se borre algo o se vuelva a entrar al campo.
  const enCentavos = useRef(false)
  function handleChange(e) {
    let raw = e.target.value
    if (raw.includes(',')) {
      enCentavos.current = true
      raw = raw.replace(/,.*$/, '')
    } else if (enCentavos.current) {
      const antes = String(value ?? '').replace(/\D/g, '')
      const ahora = raw.replace(/\D/g, '')
      if (ahora.length > antes.length && ahora.startsWith(antes)) return
      enCentavos.current = false
    }
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
      onFocus={() => { enCentavos.current = false }}
    />
  )
}

// ─── Divisiones de pago/gasto entre varias cuentas (compartido) ───
function validarDivisiones(divisiones, total) {
  // Una fila con plata pero sin cuenta (o al revés) antes se descartaba en silencio y esa
  // plata desaparecía del gasto dividido.
  if (divisiones.some(d => !!d.cuenta !== (parseFloat(d.monto) > 0))) return { ok: false, msg: 'Hay una fila incompleta: poné monto y cuenta, o sacala con ✕.' }
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
  // Solo cuenta las filas con cuenta elegida — mismo criterio que validarDivisiones al guardar.
  // Si no, una fila con monto pero sin cuenta todavía seleccionada suma igual acá y el indicador
  // se muestra "cerrado" en verde, aunque al guardar la validación real la va a rechazar.
  const asignado = divisiones.filter(d => d.cuenta).reduce((s, d) => s + (parseFloat(d.monto) || 0), 0)
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

// ─── Control de duplicados al cargar ──────────────────────────
// Antes de guardar algo nuevo se consulta la base (no la foto que tiene la pantalla): así
// también se atrapa a dos personas cargando el mismo ticket a la vez. Si la consulta falla se
// usa lo que ya está en pantalla — el aviso nunca puede impedir guardar. El criterio de
// "parecido" vive en src/duplicados.js (el mismo que usa el agente de Finanzas).
const TABLAS_POR_FK = {
  pedido_id: { registros: 'pedidos', pagos: 'pedido_pagos' },
  esqueje_id: { registros: 'esquejes', pagos: 'esqueje_pagos' },
  insumo_id: { registros: 'insumos', pagos: 'insumo_pagos' },
}

// Tope de espera: con la red caída supabase-js reintenta los GET (1 s + 2 s + 4 s) y el botón
// quedaba ~7 s en "Guardando..." solo por este chequeo. Pasado el tope se sigue con lo que hay
// en pantalla.
// Supabase entrega como máximo 1.000 filas por consulta: una tabla más grande llegaba cortada sin
// avisar (y con ella los saldos). traerTodo la trae entera, de a tandas. `consulta(opciones)` arma
// la misma consulta cada vez y tiene que terminar ordenada por la clave primaria, para que las
// tandas no se pisen. Si alguien cargó o borró justo mientras se leía y la cuenta no cierra
// contra el total que informó la base, vuelve a leer una vez.
const TANDA_FILAS = 1000
async function traerTodo(consulta, clave = 'id', intento = 0) {
  const primera = await consulta({ count: 'exact' }).range(0, TANDA_FILAS - 1)
  if (primera.error) return { data: null, error: primera.error }
  const total = primera.count ?? primera.data.length
  const filas = new Map(primera.data.map(f => [f[clave], f]))
  let desde = primera.data.length
  while (desde < total) {
    const { data, error } = await consulta().range(desde, desde + TANDA_FILAS - 1)
    if (error) return { data: null, error }
    if (data.length === 0) break
    data.forEach(f => filas.set(f[clave], f))
    desde += data.length
  }
  if (filas.size !== total && intento === 0) return traerTodo(consulta, clave, 1)
  return { data: [...filas.values()], error: null }
}

const LIMITE_MS_CONSULTA_DUPLICADOS = 3000
async function filasDeLaBase(consulta, respaldo) {
  try {
    const vencido = new Promise(resolve => setTimeout(() => resolve(null), LIMITE_MS_CONSULTA_DUPLICADOS))
    const res = await Promise.race([consulta, vencido])
    return !res || res.error || !Array.isArray(res.data) ? (respaldo || []) : res.data
  } catch {
    return respaldo || []
  }
}

const cargadoPorTexto = quien => (quien ? ` · cargado por ${quien}` : '')
function describirGastoParecido(g) {
  return `"${g.descripcion}" · ${formatPesos(g.monto)} · ${g.fecha} · ${g.locacion}${cargadoPorTexto(g.miembro)}`
}
function describirCapitalParecido(c) {
  return `${c.tipo === 'aporte' ? 'Aporte de' : 'Devolución a'} ${c.inversor} · ${(c.moneda === 'USD' ? formatDolares : formatPesos)(c.monto)} · ${formatFechaDateISO(c.fecha)} · ${c.cuenta}${cargadoPorTexto(c.creado_por)}`
}

async function buscarGastosParecidos(nuevo, gastosLocales) {
  const [gastos, devoluciones] = await Promise.all([
    filasDeLaBase(supabase.from('gastos').select('*').eq('monto', nuevo.monto), gastosLocales),
    filasDeLaBase(supabase.from('capital_movimientos').select('*').eq('tipo', 'devolucion').eq('moneda', 'ARS').eq('monto', nuevo.monto), []),
  ])
  return [
    ...gastos.filter(g => gastosParecidos(nuevo, g)).map(describirGastoParecido),
    ...devoluciones.filter(c => devolucionPareceGasto(c, nuevo)).map(c => `${describirCapitalParecido(c)} (en Capital — ¿es la misma devolución?)`),
  ]
}

async function buscarPagosParecidos(fk, nuevo, pagosLocales) {
  const pagos = await filasDeLaBase(
    supabase.from(TABLAS_POR_FK[fk].pagos).select('*').eq(fk, nuevo[fk]).eq('monto', nuevo.monto),
    pagosLocales,
  )
  return pagos.filter(pg => pagosParecidos(nuevo, pg, fk))
    .map(pg => `Cobro de ${formatPesos(pg.monto)} · ${formatFechaISOCorta(pg.fecha)} · ${pg.cuenta || 'sin cuenta'}${cargadoPorTexto(pg.creado_por)}`)
}

async function buscarVentasParecidas(fk, nuevo) {
  const desde = new Date(Date.now() - 4 * 86400000).toISOString()
  const registros = await filasDeLaBase(
    supabase.from(TABLAS_POR_FK[fk].registros).select('*').eq('total', nuevo.total).gte('created_at', desde),
    [],
  )
  return registros.filter(r => ventasParecidas(nuevo, r)).map(r => {
    const items = (r.geneticas || []).map(g => `${g.nombre} ×${g.cantidad}`).join(', ')
    return `${r.socio} · ${formatPesos(r.total)} · ${r.fecha} · ${items}${cargadoPorTexto(r.miembro)}`
  })
}

// Los triggers de Capital (capital_movimientos_validar / capital_cambios_validar) rechazan con un
// código CAPITAL_* y el detalle ya escrito en criollo; 23503 es querer borrar un aporte que tiene
// devoluciones o cambios a pesos colgados; PGRST116, que el update no encontró la fila (otro la
// borró mientras esta pantalla la tenía abierta).
function mensajeErrorCapital(error) {
  if (!error) return undefined
  if (String(error.message || '').startsWith('CAPITAL_') && error.details) return error.details
  if (error.code === '23503') return 'Este aporte tiene devoluciones o cambios a pesos cargados: borralos primero.'
  if (error.code === 'PGRST116') return 'Este movimiento ya no existe (puede que otro lo haya borrado). Recargá la página.'
  return undefined
}

async function buscarCapitalParecido(nuevo, capitalLocal) {
  const [movimientos, gastos] = await Promise.all([
    filasDeLaBase(supabase.from('capital_movimientos').select('*').eq('tipo', nuevo.tipo).eq('monto', nuevo.monto), capitalLocal),
    nuevo.tipo === 'devolucion' && nuevo.moneda === 'ARS'
      ? filasDeLaBase(supabase.from('gastos').select('*').eq('monto', nuevo.monto), [])
      : Promise.resolve([]),
  ])
  return [
    ...movimientos.filter(c => c.id !== nuevo.id && capitalParecidos(nuevo, c)).map(describirCapitalParecido),
    ...gastos.filter(g => devolucionPareceGasto(nuevo, g)).map(g => `Gasto ${describirGastoParecido(g)} (¿ya la cargaron como gasto?)`),
  ]
}

// Nunca bloquea: muestra contra qué choca (quién y cuándo lo cargó) y deja seguir.
// El aviso se guarda junto con el form que lo disparó (`para`): si el form cambia, deja de
// mostrarse solo, sin tener que limpiarlo a mano en cada onChange.
function AvisoDuplicado({ parecidos, onGuardarIgual, onCancelar, guardando }) {
  return (
    <div className="aviso-duplicado" style={{ marginTop: 10, background: '#FFF8ED', border: '0.5px solid #E8C77E', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <TriangleAlert size={15} color="#854F0B" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' }}>
          <strong>¿Ya está cargado?</strong> Se parece a {parecidos.length === 1 ? 'esto' : 'esto que ya está en la app'}:
          {parecidos.slice(0, 3).map((p, i) => <div key={i}>· {p}</div>)}
          {parecidos.length > 3 && <div>· y {parecidos.length - 3} más</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn-submit" style={{ flex: 1, background: '#854F0B' }} onClick={onGuardarIgual} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar igual'}</button>
        <button onClick={onCancelar} disabled={guardando} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
      </div>
    </div>
  )
}

function PagosRegistro({ registro, pagos, total, miembro, onAgregarPago, onEditarPago, onEliminarPago, fkCampo, compacto }) {
  const [formPara, setFormPara] = useState(null) // null | 'agregar' | id del pago que se está editando
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [avisoDup, setAvisoDup] = useState(null) // { parecidos, para: form } — ver AvisoDuplicado
  const enCurso = useRef(false)

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

  const esMembresia = !!registro.membresia
  function cuentaPara(metodoPago, cuentaPrevia) {
    if (metodoPago === 'Efectivo') return CUENTA_EFECTIVO
    if (esMembresia) return CUENTA_HORMIGUERO
    return cuentaPrevia === CUENTA_EFECTIVO ? '' : cuentaPrevia
  }
  function abrirAgregar() {
    setForm({ monto: '', metodoPago: 'Transferencia', cuenta: cuentaPara('Transferencia', ''), fecha: hoyISO() })
    setError('')
    setFormPara('agregar')
  }
  function abrirEditar(pg) {
    const metodoPago = pg.metodo_pago || 'Transferencia'
    setForm({ monto: String(pg.monto), metodoPago, cuenta: cuentaPara(metodoPago, pg.cuenta || ''), fecha: pg.fecha || hoyISO() })
    setError('')
    setFormPara(pg.id)
  }
  function cerrar() { setFormPara(null); setForm(null); setError(''); setAvisoDup(null) }
  function setMetodoPago(val) {
    setForm(f => ({ ...f, metodoPago: val, cuenta: cuentaPara(val, f.cuenta) }))
  }
  function marcarPagoTotal(marcar) {
    setForm(f => ({ ...f, monto: marcar ? String(montoPagoTotal) : '' }))
  }

  async function confirmar(forzar = false) {
    if (enCurso.current) return
    const monto = parseFloat(form.monto)
    if (!monto || monto <= 0) { setError('Ingresá un monto válido.'); return }
    if (!form.cuenta) { setError('Elegí una cuenta: si no, este pago no se va a reflejar en Finanzas.'); return }
    enCurso.current = true
    setGuardando(true)
    try {
      if (formPara === 'agregar' && !forzar) {
        const parecidos = await buscarPagosParecidos(fkCampo, { [fkCampo]: registro.id, monto, fecha: form.fecha }, propios)
        if (parecidos.length > 0) { setAvisoDup({ parecidos, para: form }); return }
      }
      // cuenta_estimada siempre se limpia al guardar: tanto al cargar un pago nuevo (nunca es
      // estimado, se elige la cuenta a mano) como al editar uno existente (corregir la cuenta
      // es justamente lo que saca al registro de "a revisar").
      const payload = { monto, metodo_pago: form.metodoPago, cuenta: form.cuenta, fecha: form.fecha, cuenta_estimada: false }
      const res = formPara === 'agregar'
        ? await onAgregarPago(registro, { ...payload, creado_por: miembro || null })
        : await onEditarPago(formPara, payload)
      if (!res?.ok) { setError('No se pudo guardar. Intentá de nuevo.'); return }
      cerrar()
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }
  const avisoVisible = avisoDup && avisoDup.para === form

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
          <select className="form-control" value={form.cuenta} disabled={opcionesCuenta(form.metodoPago, esMembresia).length === 1} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {opcionesCuenta(form.metodoPago, esMembresia).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {esMembresia && form.metodoPago === 'Transferencia' && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Las transferencias de membresías van siempre a esta cuenta.</div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input className="form-control" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
        </div>
      </div>
      {haySobrepago && <div style={{ fontSize: 11, color: '#791F1F', marginTop: 6 }}>⚠ Este cobro deja {formatPesos(excedente)} por encima del total del {registro.tipo && registro.tipo !== 'cliente' ? 'registro' : 'pedido'}.</div>}
      {error && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{error}</div>}
      {avisoVisible ? (
        <AvisoDuplicado parecidos={avisoDup.parecidos} guardando={guardando} onGuardarIgual={() => confirmar(true)} onCancelar={() => setAvisoDup(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn-submit" onClick={() => confirmar()} disabled={guardando} style={{ flex: 1 }}>{formPara === 'agregar' ? 'Guardar cobro' : 'Guardar cambios'}</button>
          <button onClick={cerrar} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
        </div>
      )}
    </div>
  )

  return (
    <div onClick={e => e.stopPropagation()}>
      {propios.length > 0 && (
        <div style={{ marginTop: compacto ? 0 : 10, paddingTop: compacto ? 0 : 10, borderTop: compacto ? undefined : '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {!compacto && (
            <>
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
            </>
          )}
          {/* Antes, en modo compacto (acordeón de meses) este resumen solo se veía en un tooltip
              de hover — inutilizable en mobile/touch. Ahora siempre queda como texto visible. */}
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatPesos(cobrado)} de {formatPesos(total)} cobrado</div>
        </div>
      )}

      {formPara === null && (
        <button className="btn-agregar-fila" onClick={abrirAgregar} style={{ marginTop: compacto ? 6 : 10, padding: compacto ? '7px 9px' : '9px', fontSize: compacto ? 12 : 13 }}>+ Registrar cobro</button>
      )}
      {formPara === 'agregar' && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: compacto ? undefined : '0.5px solid var(--border)' }}>{camposForm}</div>
      )}
    </div>
  )
}

// ─── Modal edición completa (genérico: pedido o esqueje) ───────
function ModalEditarRegistro({ cfg, registro, pagos, miembro, onAgregarPago, onEditarPago, onEliminarPago, onGuardar, onEliminar, onCerrar, permiteMembresia, socios }) {
  useEscape(onCerrar)
  const esInterno = registro.tipo !== 'cliente'
  const esRegalo = registro.tipo === 'regalo'
  const requiereNombre = !esInterno || esRegalo
  const tienePrecioPorFila = registro.geneticas.some(g => g.precio !== undefined && g.precio !== null)
  const [form, setForm] = useState({
    socio: registro.socio,
    miembro: registro.miembro,
    fecha: registro.fecha || '',
    mes: registro.mes || '',
    filas: registro.geneticas.map(g => ({ id: Math.random(), nombre: g.nombre, cantidad: g.cantidad, precio: g.precio ?? '' })),
    precio: registro.precio,
    entregado: registro.entregado,
    esMembresia: !!registro.membresia,
    tier: registro.membresia || null,
    socioId: registro.socioId || '',
  })
  const [confirmando, setConfirmando] = useState(false)
  const [confirmarTotal, setConfirmarTotal] = useState(false)
  const [errorMonto, setErrorMonto] = useState('')
  const [errorCampos, setErrorCampos] = useState('')
  const [guardando, setGuardando] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const precioFila = f => form.esMembresia ? (MEMBRESIAS[form.tier]?.precioPorGramo ?? '') : f.precio
  const total = esInterno ? 0 : form.filas.reduce((s, f) => {
    const p = tienePrecioPorFila ? (parseFloat(precioFila(f)) || 0) : (parseFloat(form.precio) || 0)
    return s + (parseFloat(f.cantidad) || 0) * p
  }, 0)
  // Pedidos migrados del historial (sin precio por genética) guardan un total real que no
  // necesariamente coincide con cantidad × precio único — recalcular y pisarlo sin avisar
  // puede cambiar plata real sin que nadie se dé cuenta. Ver auditoria-salud.md punto 1.
  const totalDifiere = !esInterno && !tienePrecioPorFila && Math.abs(total - (registro.total || 0)) >= 1

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() {
    if (form.esMembresia && form.tier && form.filas.length >= maxGeneticasMembresia(form.tier)) return
    set('filas', [...form.filas, { id: Math.random(), nombre: '', cantidad: '', precio: tienePrecioPorFila ? cfg.precioDefaultFila : '' }])
  }
  function eliminarFila(id) { if (form.filas.length > 1) set('filas', form.filas.filter(f => f.id !== id)) }
  function handleEsMembresia(val) { setForm(f => ({ ...f, esMembresia: val, tier: null, socioId: val ? f.socioId : '', socio: val ? '' : f.socio })) }
  function handleTier(tier) { setForm(f => ({ ...f, tier, filas: f.filas.slice(0, maxGeneticasMembresia(tier)) })) }
  function handleSocioId(id) {
    const s = (socios || []).find(x => String(x.id) === String(id))
    setForm(f => ({ ...f, socioId: id, socio: s ? s.nombre : '' }))
  }

  function guardar(confirmarCambioTotal = false) {
    if (guardando) return
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if ((requiereNombre && !form.socio.trim()) || filasValidas.length === 0 || sinCantidad) {
      const nomSocio = (cfg.labelSocio || 'socio').toLowerCase()
      const nomFilas = (cfg.labelFilas || 'genética').toLowerCase()
      setErrorCampos(esRegalo ? `Completá a quién es el regalo, ${nomFilas} y cantidad.` : (esInterno ? `Completá ${nomFilas} y cantidad.` : `Completá ${nomSocio}, ${nomFilas} y cantidad.`))
      return
    }
    if (form.esMembresia) {
      if (!form.tier) { setErrorCampos('Elegí una membresía.'); return }
      if (!form.socioId) { setErrorCampos('Elegí un socio.'); return }
      const gramosCargados = filasValidas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0), 0)
      if (gramosCargados !== MEMBRESIAS[form.tier].gramos) {
        setErrorCampos(`La suma de gramos tiene que ser ${MEMBRESIAS[form.tier].gramos}g para la membresía ${form.tier}.`)
        return
      }
    }
    setErrorCampos('')
    if (!esInterno && total <= 0) { setErrorMonto('El total no puede ser $0 — revisá el precio cargado.'); return }
    setErrorMonto('')
    if (totalDifiere && !confirmarCambioTotal) { setConfirmarTotal(true); return }
    const geneticas = filasValidas.map(f => tienePrecioPorFila
      ? { nombre: f.nombre, cantidad: f.cantidad, precio: precioFila(f) }
      : { nombre: f.nombre, cantidad: f.cantidad })
    let mes = form.mes
    const partes = form.fecha.split('/')
    if (partes.length === 3) mes = `${parseInt(partes[1])}/${partes[2]}`
    // onGuardar es fire-and-forget (el padre cierra el modal apenas lo llama, sin esperar el
    // resultado) — guardando no se vuelve a poner en false a propósito, el modal desmonta enseguida.
    setGuardando(true)
    onGuardar({
      ...registro, ...form, mes, geneticas, total, precio: form.precio,
      membresia: form.esMembresia ? form.tier : null,
      socioId: form.esMembresia ? (form.socioId || null) : null,
      entregado: esRegalo ? true : form.entregado,
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
        {permiteMembresia && (
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="form-group full">
              <div className="toggle-row">
                <span className="toggle-label">¿Es membresía?</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.esMembresia} onChange={e => handleEsMembresia(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
            {form.esMembresia && (
              <div className="form-group full">
                <label className="form-label">Membresía</label>
                <div className="miembro-row">
                  {ORDEN_MEMBRESIAS.map(tier => (
                    <button key={tier} type="button" className={`miembro-btn${form.tier === tier ? ' active' : ''}`} onClick={() => handleTier(tier)}>
                      {tier} · {MEMBRESIAS[tier].gramos}g · {formatPesos(MEMBRESIAS[tier].precio)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="form-grid">
          {!esInterno && (
            <div className="form-group full">
              <label className="form-label">{cfg.labelSocio || 'Socio'}</label>
              {form.esMembresia ? (
                <select className="form-control" value={form.socioId} onChange={e => handleSocioId(e.target.value)}>
                  <option value="">Seleccionar socio...</option>
                  {(socios || []).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              ) : (
                <input className="form-control" type="text" placeholder={cfg.placeholderSocio || 'Nombre del socio...'} value={form.socio} onChange={e => set('socio', e.target.value)} />
              )}
            </div>
          )}
          {esRegalo && (
            <div className="form-group full">
              <label className="form-label">¿Para quién es el regalo?</label>
              <input className="form-control" type="text" value={form.socio} onChange={e => set('socio', e.target.value)} />
            </div>
          )}
          <div className="form-group full">
            <label className="form-label">Fecha</label>
            <DatePicker value={form.fecha} onChange={v => set('fecha', v)} />
          </div>
        </div>
        <div className="form-group full">
          <label className="form-label">{cfg.labelFilas || 'Genética'}</label>
          <div className="filas-genetica">
            {form.filas.map(fila => (
              <div key={fila.id} className="fila-genetica">
                {cfg.geneticas ? (
                  <select className="form-control" value={fila.nombre} onChange={e => setFila(fila.id, 'nombre', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {cfg.geneticas.map(g => <option key={g} value={g}>{g}</option>)}
                    {fila.nombre && !cfg.geneticas.includes(fila.nombre) && <option value={fila.nombre}>{fila.nombre} (fuera de catálogo)</option>}
                  </select>
                ) : (
                  <input className="form-control" type="text" placeholder="Nombre del insumo..." value={fila.nombre} onChange={e => setFila(fila.id, 'nombre', e.target.value)} />
                )}
                <input className="form-control fila-cantidad" type="number" placeholder={cfg.unidad} min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                {tienePrecioPorFila && (
                  <InputMonto className="form-control fila-cantidad" placeholder={`$/${cfg.unidad}`} value={precioFila(fila)} disabled={esInterno || form.esMembresia} onChange={v => setFila(fila.id, 'precio', v)} />
                )}
                {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
              </div>
            ))}
          </div>
          {!(form.esMembresia && form.tier && form.filas.length >= maxGeneticasMembresia(form.tier)) && (
            <button className="btn-agregar-fila" onClick={agregarFila}>+ Agregar {(cfg.labelFilas || 'genética').toLowerCase()}</button>
          )}
          {form.esMembresia && form.tier && (
            <div style={{ fontSize: 11, marginTop: 4, color: form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0), 0) === MEMBRESIAS[form.tier].gramos ? 'var(--text-secondary)' : '#854F0B' }}>
              {form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0), 0)}g cargados de {MEMBRESIAS[form.tier].gramos}g de la membresía {form.tier}
            </div>
          )}
        </div>
        <div className="form-grid">
          {!tienePrecioPorFila && (
            <div className="form-group">
              <label className="form-label">Precio por {cfg.unidad} ($)</label>
              <InputMonto value={form.precio} onChange={v => set('precio', v)} disabled={esInterno} />
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
                <button onClick={() => guardar(true)} disabled={guardando} style={{ flex: 1, padding: '7px', background: '#854F0B', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>Sí, actualizar el total</button>
                <button onClick={() => setConfirmarTotal(false)} style={{ flex: 1, padding: '7px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
              </div>
            )}
          </div>
        )}
        {!esRegalo && (
          <div className="toggle-group">
            <div className="toggle-row">
              <span className="toggle-label">{cfg.labelEntregado}</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={form.entregado} onChange={e => set('entregado', e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        )}
        {!esInterno && (
          <PagosRegistro registro={registro} pagos={pagos} total={total} miembro={miembro} onAgregarPago={onAgregarPago} onEditarPago={onEditarPago} onEliminarPago={onEliminarPago} fkCampo={cfg.fkPagos} compacto={false} />
        )}
        {errorCampos && (
          <div style={{ fontSize: 12, color: '#791F1F', background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginTop: 16 }}>
            {errorCampos}
          </div>
        )}
        <button className="btn-submit" style={{ marginTop: 16, ...(cfg.btnBg ? { background: cfg.btnBg } : {}), opacity: guardando ? 0.6 : 1 }} disabled={guardando} onClick={() => guardar()}>Guardar cambios</button>
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
  // Guard contra doble click: ref (síncrono, frena clicks del mismo tick) + state (deshabilita el botón).
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const presupuestosDisponibles = (presupuestos || []).filter(p => p.locacion === gasto.locacion && (!p.cerrado || p.id === gasto.presupuesto_id))

  async function ejecutar(accion) {
    if (enCurso.current) return
    enCurso.current = true
    setGuardando(true)
    setErrorCampos('')
    const res = await accion()
    enCurso.current = false
    setGuardando(false)
    // Si salió bien el padre cierra el modal; si no, queda abierto con lo que se escribió.
    if (!res?.ok) setErrorCampos(res?.msg || 'No se pudo guardar. Probá de nuevo.')
  }

  function activarDivision() {
    const montoTotal = parseFloat(form.monto)
    setForm(f => ({ ...f, dividido: true, divisiones: f.divisiones.length ? f.divisiones : [{ id: Math.random(), monto: montoTotal ? String(montoTotal) : '', cuenta: f.cuenta }] }))
  }
  function cancelarDivision() { setForm(f => ({ ...f, dividido: false })); setErrorCuenta('') }

  function guardar() {
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto) || !form.fecha) {
      setErrorCampos('Completá descripción, categoría, monto y fecha.')
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
    // El mes lo deriva prepararGasto() a partir de la fecha.
    ejecutar(() => onGuardar({ ...gasto, ...form, descripcion: form.descripcion.trim(), monto: montoTotal, cuenta: form.dividido ? null : (form.cuenta || null), divisiones: divisionesFinal, presupuesto_id: form.presupuesto_id ? Number(form.presupuesto_id) : null }))
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
        <button className="btn-submit" style={{ marginTop: 16 }} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} disabled={guardando} style={{ width: '100%', marginTop: 8, padding: '10px', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', background: 'transparent', color: '#791F1F', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Eliminar gasto
          </button>
        ) : (
          <div style={{ marginTop: 8, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>¿Confirmás la eliminación?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => ejecutar(() => onEliminar(gasto))} disabled={guardando} style={{ flex: 1, padding: '9px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, eliminar</button>
              <button onClick={() => setConfirmando(false)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Formulario nuevo registro (genérico: pedido o esqueje) ───
function FormRegistro({ cfg, onGuardar, onAgregarPago, miembro, tipoRegistro = 'cliente', permiteMembresia, socios }) {
  const esInterno = tipoRegistro !== 'cliente'
  const esRegalo = tipoRegistro === 'regalo'
  const esPropio = tipoRegistro === 'propio'
  const requiereNombre = !esInterno || esRegalo
  const initial = () => ({
    socio: '', entregado: false, filas: [cfg.nuevaFila()],
    cobradoAhora: false, montoPago: '', metodoPago: 'Transferencia', cuenta: '', fechaPago: hoyISO(),
    esMembresia: false, tier: null, socioId: '',
  })
  const [form, setForm] = useState(initial)
  const [toast, showToast] = useToast()
  const [guardando, setGuardando] = useState(false)
  const [avisoDup, setAvisoDup] = useState(null) // { parecidos, para: form } — ver AvisoDuplicado
  const enCurso = useRef(false)
  // Una venta nueva de membresía solo puede quedar a nombre de un socio activo — a un socio
  // desactivado no se le vende una membresía nueva (sí se sigue viendo su historial ya cargado,
  // eso lo maneja ModalEditarRegistro con la lista completa, sin filtrar).
  const sociosActivos = (socios || []).filter(s => s.activo !== false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const precioFila = f => form.esMembresia ? (MEMBRESIAS[form.tier]?.precioPorGramo ?? '') : f.precio
  const total = esInterno ? 0 : form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0) * (parseFloat(precioFila(f)) || 0), 0)
  const gramosCargados = form.filas.reduce((s, f) => s + (parseFloat(f.cantidad) || 0), 0)
  const gramosObjetivo = form.esMembresia && form.tier ? MEMBRESIAS[form.tier].gramos : null

  function setFila(id, key, val) { set('filas', form.filas.map(f => f.id === id ? { ...f, [key]: val } : f)) }
  function agregarFila() {
    if (form.esMembresia && form.tier && form.filas.length >= maxGeneticasMembresia(form.tier)) return
    set('filas', [...form.filas, cfg.nuevaFila()])
  }
  function eliminarFila(id) { if (form.filas.length === 1) return; set('filas', form.filas.filter(f => f.id !== id)) }
  function handleCobradoAhora(val) {
    setForm(f => ({ ...f, cobradoAhora: val, montoPago: val ? (total ? String(total) : '') : '', cuenta: val ? (f.esMembresia ? CUENTA_HORMIGUERO : f.cuenta) : f.cuenta }))
  }
  function handleMetodoPago(val) { setForm(f => ({ ...f, metodoPago: val, cuenta: val === 'Efectivo' ? CUENTA_EFECTIVO : (f.esMembresia ? CUENTA_HORMIGUERO : (f.cuenta === CUENTA_EFECTIVO ? '' : f.cuenta)) })) }
  function handleEsMembresia(val) { setForm(f => ({ ...f, esMembresia: val, tier: null, socioId: val ? f.socioId : '', socio: val ? '' : f.socio, cuenta: val && f.metodoPago === 'Transferencia' ? CUENTA_HORMIGUERO : f.cuenta })) }
  function handleTier(tier) { setForm(f => ({ ...f, tier, filas: f.filas.slice(0, maxGeneticasMembresia(tier)) })) }
  function handleSocioId(id) {
    const s = (socios || []).find(x => String(x.id) === String(id))
    setForm(f => ({ ...f, socioId: id, socio: s ? s.nombre : '' }))
  }

  async function guardar(forzar = false) {
    if (guardando || enCurso.current) return
    const filasValidas = form.filas.filter(f => f.nombre)
    const sinCantidad = filasValidas.some(f => !parseFloat(f.cantidad))
    if ((requiereNombre && !form.socio.trim()) || filasValidas.length === 0 || sinCantidad) {
      const nomSocio = (cfg.labelSocio || 'socio').toLowerCase()
      const nomFilas = (cfg.labelFilas || 'genética').toLowerCase()
      showToast(esRegalo ? `Completá a quién es el regalo, ${nomFilas} y cantidad` : (esInterno ? `Completá ${nomFilas} y cantidad` : `Completá ${nomSocio}, ${nomFilas} y cantidad`))
      return
    }
    if (form.esMembresia) {
      if (!form.tier) { showToast('Elegí una membresía'); return }
      if (!form.socioId) { showToast('Elegí un socio'); return }
      if (gramosCargados !== gramosObjetivo) { showToast(`La suma de gramos tiene que ser ${gramosObjetivo}g para la membresía ${form.tier}`); return }
    }
    if (!esInterno && total <= 0) {
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
    const geneticas = filasValidas.map(f => ({ nombre: f.nombre, cantidad: f.cantidad, precio: precioFila(f) }))
    const registro = {
      id: Date.now(),
      fecha: hoyCompleto(),
      miembro,
      socio: esPropio ? miembro : form.socio.trim(),
      geneticas,
      precio: cfg.precioDefaultFila,
      total,
      tipo: tipoRegistro,
      membresia: form.esMembresia ? form.tier : null,
      socioId: form.esMembresia ? (form.socioId || null) : null,
      entregado: esRegalo ? true : form.entregado,
    }
    enCurso.current = true
    setGuardando(true)
    try {
      // Venta repetida (mismo comprador, mismos ítems, mismo total en pocos días): solo ventas
      // a clientes — propio/regalo no tienen total y se cargan distinto.
      if (!forzar && !esInterno && TABLAS_POR_FK[cfg.fkPagos]) {
        const parecidos = await buscarVentasParecidas(cfg.fkPagos, registro)
        if (parecidos.length > 0) { setAvisoDup({ parecidos, para: form }); return }
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
      showToast(esRegalo ? 'Regalo guardado ✓' : (cfg.txtGuardado || `${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} guardado ✓`))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
        Registrando como <strong style={{ color: 'var(--text-primary)' }}>{miembro || '—'}</strong>
      </div>
      <div className="card">
        {permiteMembresia && (
          <div className="form-grid" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '0.5px solid var(--border)' }}>
            <div className="form-group full">
              <div className="toggle-row">
                <span className="toggle-label">¿Es membresía?</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.esMembresia} onChange={e => handleEsMembresia(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
            {form.esMembresia && (
              <div className="form-group full">
                <label className="form-label">Membresía</label>
                <div className="miembro-row">
                  {ORDEN_MEMBRESIAS.map(tier => (
                    <button key={tier} type="button" className={`miembro-btn${form.tier === tier ? ' active' : ''}`} onClick={() => handleTier(tier)}>
                      {tier} · {MEMBRESIAS[tier].gramos}g · {formatPesos(MEMBRESIAS[tier].precio)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="form-grid">
          {!esInterno && (
            <div className="form-group full">
              <label className="form-label">{cfg.labelSocio || 'Socio'}</label>
              {form.esMembresia ? (
                <select className="form-control" value={form.socioId} onChange={e => handleSocioId(e.target.value)}>
                  <option value="">Seleccionar socio...</option>
                  {sociosActivos.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              ) : (
                <input className="form-control" type="text" placeholder={cfg.placeholderSocio || 'Nombre del socio...'} value={form.socio} onChange={e => set('socio', e.target.value)} />
              )}
            </div>
          )}
          {esRegalo && (
            <div className="form-group full">
              <label className="form-label">¿Para quién es el regalo?</label>
              <input className="form-control" type="text" placeholder="Nombre..." value={form.socio} onChange={e => set('socio', e.target.value)} />
            </div>
          )}
          <div className="form-group full">
            <label className="form-label">{cfg.labelFilas || 'Genética'}</label>
            <div className="filas-genetica">
              {form.filas.map(fila => (
                <div key={fila.id} className="fila-genetica">
                  {cfg.geneticas ? (
                    <select className="form-control" value={fila.nombre} onChange={e => setFila(fila.id, 'nombre', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {cfg.geneticas.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : (
                    <input className="form-control" type="text" placeholder="Nombre del insumo..." value={fila.nombre} onChange={e => setFila(fila.id, 'nombre', e.target.value)} />
                  )}
                  <input className="form-control fila-cantidad" type="number" placeholder={cfg.unidad} min="0" value={fila.cantidad} onChange={e => setFila(fila.id, 'cantidad', e.target.value)} />
                  <InputMonto className="form-control fila-cantidad" placeholder={`$/${cfg.unidad}`} value={precioFila(fila)} disabled={esInterno || form.esMembresia} onChange={v => setFila(fila.id, 'precio', v)} />
                  {form.filas.length > 1 && <button className="btn-eliminar-fila" onClick={() => eliminarFila(fila.id)}>✕</button>}
                </div>
              ))}
            </div>
            {!(form.esMembresia && form.tier && form.filas.length >= maxGeneticasMembresia(form.tier)) && (
              <button className="btn-agregar-fila" onClick={agregarFila}>{cfg.txtAgregarFila || `+ Agregar genética al ${cfg.singular}`}</button>
            )}
            {gramosObjetivo != null && (
              <div style={{ fontSize: 11, marginTop: 4, color: gramosCargados === gramosObjetivo ? 'var(--text-secondary)' : '#854F0B' }}>
                {gramosCargados}g cargados de {gramosObjetivo}g de la membresía {form.tier}
              </div>
            )}
          </div>
          <div className="form-group full">
            <div className="total-row">
              <span className="total-label">Total</span>
              <span className="total-value">{formatPesos(total)}</span>
            </div>
          </div>
        </div>
      </div>
      {!esRegalo && (
      <div className="card">
        <div className="toggle-group">
          {!esInterno && (
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
                    <select className="form-control" value={form.cuenta} disabled={opcionesCuenta(form.metodoPago, form.esMembresia).length === 1} onChange={e => set('cuenta', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {opcionesCuenta(form.metodoPago, form.esMembresia).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {form.esMembresia && form.metodoPago === 'Transferencia' && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Las transferencias de membresías van siempre a esta cuenta.</div>
                    )}
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
      )}
      {avisoDup && avisoDup.para === form ? (
        <AvisoDuplicado parecidos={avisoDup.parecidos} guardando={guardando} onGuardarIgual={() => guardar(true)} onCancelar={() => setAvisoDup(null)} />
      ) : (
        <button className="btn-submit" style={{ ...(cfg.btnBg ? { background: cfg.btnBg } : {}), opacity: guardando ? 0.6 : 1 }} disabled={guardando} onClick={() => guardar()}>{esRegalo ? 'Guardar regalo' : `Guardar ${cfg.singular}`}</button>
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Lista de registros (genérico: pedidos o esquejes), agrupada por mes
// en acordeón. Mismo patrón que Gastos, pero acá todos los meses arrancan
// cerrados (ni siquiera el actual se auto-abre): el usuario elige qué
// mes abrir en vez de ver el mes en curso expandido de entrada.
function ListaRegistrosPorMes({ cfg, registros, onActualizar, onEliminar, pagos, miembro, onAgregarPago, onEditarPago, onEliminarPago, target, permiteMembresia, socios }) {
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
    return r.tipo !== 'cliente' ? r.tipo : estadoCobro(r.total, totalCobrado(pagos, r.id, cfg.fkPagos))
  }

  const filtrados = registros.filter(r => {
    if (filtroEstado === 'sin-entregar') return !r.entregado
    if (filtroEstado === 'sin-cobrar') return estadoDe(r) === 'sin-cobrar'
    if (filtroEstado === 'parcial') return estadoDe(r) === 'parcial'
    return true
  })

  const totalVendido = filtrados.filter(r => r.tipo === 'cliente').reduce((s, r) => s + (r.total || 0), 0)
  const sinEntregar = filtrados.filter(r => !r.entregado).length
  const meses = ordenarMesesDesc([...new Set(filtrados.map(r => r.mes).filter(Boolean))])

  return (
    <div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-num">{filtrados.length}</div><div className="stat-lbl">{cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}</div></div>
        <div className="stat-card"><div className="stat-num" style={{ fontSize: 16 }}>{formatPesos(totalVendido)}</div><div className="stat-lbl">Vendido</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: sinEntregar > 0 ? '#854F0B' : undefined }}>{sinEntregar}</div><div className="stat-lbl">Sin entregar</div></div>
      </div>
      <div className="filtros-row" style={{ marginTop: 12 }}>
        {[['sin-entregar', 'Sin entregar'], ['sin-cobrar', 'Sin cobrar'], ['parcial', 'Parcial'], ['todos', 'Todos']].map(([key, label]) => (
          <button key={key} className={`filtro-btn${filtroEstado === key ? ' active' : ''}`} onClick={() => setFiltroEstado(key)}>{label}</button>
        ))}
      </div>
      <div className="pedidos-list" style={{ marginTop: 12 }}>
        {filtrados.length === 0
          ? <div className="empty-state">No hay {cfg.plural} para mostrar.</div>
          : meses.map(mes => {
            const delMes = filtrados.filter(r => r.mes === mes)
            const subtotalMes = delMes.filter(r => r.tipo === 'cliente').reduce((s, r) => s + (r.total || 0), 0)
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
                    <span className="pedido-editar-hint hint-disclosure">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
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
                            <div className="pedido-nombre">{r.tipo === 'cliente' ? r.socio : (r.tipo === 'regalo' ? `Regalo · ${r.socio || 'Sin nombre'}` : 'Consumo propio')}</div>
                            <div className="pedido-sub">{r.geneticas.map(g => `${g.nombre} ${g.cantidad}${cfg.unidad}`).join(' · ')} · {r.fecha} · {r.miembro}</div>
                            <div className="pedido-badges">
                              <span className={`badge ${r.entregado ? 'badge-entregado' : 'badge-no-entregado'}`}>{r.entregado ? 'Entregado' : 'No entregado'}</span>
                              {r.tipo === 'cliente' && (
                                estado === 'sobrepago'
                                  ? <span className="badge badge-sobrepago">⚠ Sobrepago: +{formatPesos(cobrado - r.total)}</span>
                                  : estado === 'pagado'
                                    ? <span className="badge badge-pagado">Pagado</span>
                                    : estado === 'parcial'
                                      ? <span className="badge badge-parcial">Parcial: {formatPesos(cobrado)} de {formatPesos(r.total)}</span>
                                      : <span className="badge badge-sin-cobrar">Sin cobrar</span>
                              )}
                              {r.membresia && <span className="badge badge-pagado">Membresía {r.membresia}</span>}
                            </div>
                          </div>
                          <div className="pedido-right">
                            <span className="pedido-total">{r.tipo !== 'cliente' ? '—' : formatPesos(r.total)}</span>
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
                          {r.tipo === 'cliente' && (
                            <div style={{ gridColumn: '1 / -1', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
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
          permiteMembresia={permiteMembresia}
          socios={socios}
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

function PanelStock({ stock, inicial, cfg, ajustesFallidos, onEditar, onEditarInicial, onAgregarGenetica, onEliminarGenetica }) {
  const [toast, showToast] = useToast()
  const [nuevaGenetica, setNuevaGenetica] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(null)
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

  function pedirBorrar(g) {
    const cant = stock[g] ?? 0
    if (cant !== 0) {
      showToast(`No se puede borrar ${g}: todavía tiene ${cant}${cfg.unidad} en stock. Llevalo a 0 primero.`)
      return
    }
    setConfirmandoBorrar(g)
  }

  async function confirmarBorrar(g) {
    const res = await onEliminarGenetica(g)
    if (res?.ok === false) {
      // El bloqueo por stock ≠ 0 también se valida en la base (trigger), como red de
      // seguridad contra el caso de dos personas usando la app al mismo tiempo con datos
      // desactualizados en su pantalla — ese mensaje llega en res.error.message.
      const msg = (res.error && typeof res.error === 'object' && res.error.message) || null
      showToast(msg || `No se pudo borrar ${g}`)
    } else {
      showToast(`${g}: eliminada del catálogo`)
    }
    setConfirmandoBorrar(null)
  }

  async function agregar() {
    const limpio = nuevaGenetica.trim()
    // agregando evita el doble alta si alguien clickea "+ Agregar" dos veces rápido
    // (o lo toca sin querer en mobile) antes de que vuelva el primer request.
    if (!limpio || agregando) return
    if (cfg.geneticas.some(g => g.toLowerCase() === limpio.toLowerCase())) {
      showToast('Ya existe una genética con ese nombre')
      return
    }
    setAgregando(true)
    const res = await onAgregarGenetica(limpio)
    setAgregando(false)
    if (res?.ok === false) {
      // 23505 = unique_violation: alguien más ya agregó el mismo nombre (o una variante
      // de mayúsculas/minúsculas) mientras esta pantalla tenía el catálogo desactualizado.
      showToast(res.error?.code === '23505' ? 'Ya existe una genética con ese nombre' : `No se pudo agregar ${limpio}`)
      return
    }
    setNuevaGenetica('')
    showToast(`${limpio}: agregada al catálogo`)
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{g}</span>
                    <button className="btn-eliminar-fila" style={{ width: 20, height: 20, fontSize: 10 }} title={`Borrar ${g} del catálogo`} onClick={() => pedirBorrar(g)}>✕</button>
                  </span>
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
                {confirmandoBorrar === g && (
                  <div style={{ marginTop: 6, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#791F1F', flex: 1 }}>¿Borrar {g} del catálogo?</span>
                    <button onClick={() => confirmarBorrar(g)} style={{ padding: '6px 10px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sí, borrar</button>
                    <button onClick={() => setConfirmandoBorrar(null)} style={{ padding: '6px 10px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', alignItems: 'center' }}>
          <span className="form-label">Total</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{totalInicial}{cfg.unidad}</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{totalActual}{cfg.unidad}</span>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
          <input className="form-control" type="text" placeholder="Nueva genética..." value={nuevaGenetica} disabled={agregando} onChange={e => setNuevaGenetica(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()} />
          <button className="btn-submit" style={{ width: 'auto', padding: '0 14px', whiteSpace: 'nowrap', opacity: agregando ? 0.6 : 1 }} disabled={agregando} onClick={agregar}>+ Agregar</button>
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
function PanelDominio({ cfg, registros, miembro, onGuardar, onActualizar, onEliminar, stock, stockInicial, ajustesFallidos, onEditarStock, onEditarInicial, onAgregarGenetica, onEliminarGenetica, pagos, onAgregarPago, onEditarPago, onEliminarPago, target, tipoRegistro = 'cliente', permiteMembresia, socios }) {
  const [stockAbierto, setStockAbierto] = useState(false)
  const seccionTitulo = { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }
  const plural = cfg.plural[0].toUpperCase() + cfg.plural.slice(1)
  const sinStock = cfg.tieneStock !== false ? cfg.geneticas.filter(g => (stock[g] ?? 0) <= 0).length : 0
  return (
    <div>
      <div style={seccionTitulo}>{cfg.tituloNuevo || `Registro de nuevo ${cfg.singular}`}</div>
      <FormRegistro cfg={cfg} onGuardar={onGuardar} miembro={miembro} onAgregarPago={onAgregarPago} tipoRegistro={tipoRegistro} permiteMembresia={permiteMembresia} socios={socios} />

      {cfg.tieneStock !== false && (
        <div style={{ marginTop: 18 }}>
          <div style={seccionTitulo}>Catálogo y stock</div>
          <div
            className="panel-stock-toggle"
            onClick={() => setStockAbierto(o => !o)}
            style={{ '--stock-color': cfg.color, '--stock-bg': cfg.colorLight || 'var(--green-light)', '--stock-border': cfg.colorBorde || 'var(--green-border)' }}
          >
            <div className="panel-stock-icon"><Package size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="panel-stock-titulo">Genéticas y stock</div>
              <div className="panel-stock-sub">
                {cfg.geneticas.length} genéticas · agregar, editar o borrar
                {sinStock > 0 && <span className="panel-stock-alerta"> · {sinStock} sin stock</span>}
              </div>
            </div>
            {stockAbierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
          {stockAbierto && (
            <div style={{ marginTop: 8 }}>
              <PanelStock stock={stock} inicial={stockInicial} cfg={cfg} ajustesFallidos={ajustesFallidos} onEditar={onEditarStock} onEditarInicial={onEditarInicial} onAgregarGenetica={onAgregarGenetica} onEliminarGenetica={onEliminarGenetica} />
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={seccionTitulo}>{cfg.tituloLista || `${plural} registrados`}</div>
        <ListaRegistrosPorMes cfg={cfg} registros={registros} onActualizar={onActualizar} onEliminar={onEliminar} pagos={pagos} miembro={miembro} onAgregarPago={onAgregarPago} onEditarPago={onEditarPago} onEliminarPago={onEliminarPago} target={target} permiteMembresia={permiteMembresia} socios={socios} />
      </div>
    </div>
  )
}

// ─── Tab Ventas: Cosecha / Esquejes / Insumos / Propio / Socios ─
function TabVentas({
  pedidos, stock, stockInicial, onGuardarPedido, onActualizarPedido, onEliminarPedido,
  esquejes, stockEsquejes, stockEsquejesInicial, onGuardarEsqueje, onActualizarEsqueje, onEliminarEsqueje,
  insumos, onGuardarInsumo, onActualizarInsumo, onEliminarInsumo, insumoPagos, onAgregarPagoInsumo, onEditarPagoInsumo, onEliminarPagoInsumo,
  miembro, ajustesFallidos,
  onEditarStock, onEditarStockEsquejes, onEditarInicial, onEditarInicialEsquejes,
  geneticasCosecha, geneticasEsquejes, onAgregarGeneticaCosecha, onEliminarGeneticaCosecha, onAgregarGeneticaEsquejes, onEliminarGeneticaEsquejes,
  pedidoPagos, esquejePagos, onAgregarPagoPedido, onEditarPagoPedido, onEliminarPagoPedido, onAgregarPagoEsqueje, onEditarPagoEsqueje, onEliminarPagoEsqueje,
  socios, onGuardarSocio, onActualizarSocio, onEliminarSocio, onActivarSocio, onDesactivarSocio,
  target,
}) {
  const [tipo, setTipo] = useState(() => target?.tipoRegistro || 'cosecha')
  const cfg = tipo === 'esquejes' ? { ...CFG_ESQUEJES, geneticas: geneticasEsquejes } : { ...CFG_COSECHA, geneticas: geneticasCosecha }
  const activeStyle = tipo === 'esquejes' ? { background: COLOR_ESQUEJES_LIGHT, borderColor: COLOR_ESQUEJES_BORDER, color: COLOR_ESQUEJES } : {}
  const activeStyleInsumos = tipo === 'insumos' ? { background: COLOR_INSUMOS_LIGHT, borderColor: COLOR_INSUMOS_BORDER, color: COLOR_INSUMOS } : {}
  return (
    <div className="content">
      <div className="miembro-row">
        <button className={`miembro-btn${tipo === 'cosecha' ? ' active' : ''}`} onClick={() => setTipo('cosecha')}>Cosecha</button>
        <button className={`miembro-btn${tipo === 'esquejes' ? ' active' : ''}`} style={tipo === 'esquejes' ? activeStyle : {}} onClick={() => setTipo('esquejes')}>Esquejes</button>
        <button className={`miembro-btn${tipo === 'insumos' ? ' active' : ''}`} style={tipo === 'insumos' ? activeStyleInsumos : {}} onClick={() => setTipo('insumos')}>Insumos</button>
        <button className={`miembro-btn${tipo === 'propio' ? ' active' : ''}`} onClick={() => setTipo('propio')}>Propio</button>
        <button className={`miembro-btn${tipo === 'socios' ? ' active' : ''}`} onClick={() => setTipo('socios')}>Socios</button>
      </div>
      {tipo === 'insumos' && (
        <PanelDominio
          cfg={CFG_INSUMOS}
          registros={insumos.filter(r => r.tipo === 'cliente')}
          miembro={miembro}
          onGuardar={onGuardarInsumo}
          onActualizar={onActualizarInsumo}
          onEliminar={onEliminarInsumo}
          pagos={insumoPagos}
          onAgregarPago={onAgregarPagoInsumo}
          onEditarPago={onEditarPagoInsumo}
          onEliminarPago={onEliminarPagoInsumo}
          target={target}
          tipoRegistro="cliente"
          permiteMembresia={false}
        />
      )}
      {(tipo === 'cosecha' || tipo === 'esquejes') && (
        <PanelDominio
          cfg={cfg}
          registros={(tipo === 'cosecha' ? pedidos : esquejes).filter(r => r.tipo === 'cliente')}
          miembro={miembro}
          onGuardar={tipo === 'cosecha' ? onGuardarPedido : onGuardarEsqueje}
          onActualizar={tipo === 'cosecha' ? onActualizarPedido : onActualizarEsqueje}
          onEliminar={tipo === 'cosecha' ? onEliminarPedido : onEliminarEsqueje}
          stock={tipo === 'cosecha' ? stock : stockEsquejes}
          stockInicial={tipo === 'cosecha' ? stockInicial : stockEsquejesInicial}
          ajustesFallidos={ajustesFallidos}
          onEditarStock={tipo === 'cosecha' ? onEditarStock : onEditarStockEsquejes}
          onEditarInicial={tipo === 'cosecha' ? onEditarInicial : onEditarInicialEsquejes}
          onAgregarGenetica={tipo === 'cosecha' ? onAgregarGeneticaCosecha : onAgregarGeneticaEsquejes}
          onEliminarGenetica={tipo === 'cosecha' ? onEliminarGeneticaCosecha : onEliminarGeneticaEsquejes}
          pagos={tipo === 'cosecha' ? pedidoPagos : esquejePagos}
          onAgregarPago={tipo === 'cosecha' ? onAgregarPagoPedido : onAgregarPagoEsqueje}
          onEditarPago={tipo === 'cosecha' ? onEditarPagoPedido : onEditarPagoEsqueje}
          onEliminarPago={tipo === 'cosecha' ? onEliminarPagoPedido : onEliminarPagoEsqueje}
          target={target}
          tipoRegistro="cliente"
          permiteMembresia={tipo === 'cosecha'}
          socios={socios}
        />
      )}
      {tipo === 'propio' && (
        <TabPropio
          pedidos={pedidos} stock={stock} stockInicial={stockInicial}
          onGuardarPedido={onGuardarPedido} onActualizarPedido={onActualizarPedido} onEliminarPedido={onEliminarPedido}
          esquejes={esquejes} stockEsquejes={stockEsquejes} stockEsquejesInicial={stockEsquejesInicial}
          onGuardarEsqueje={onGuardarEsqueje} onActualizarEsqueje={onActualizarEsqueje} onEliminarEsqueje={onEliminarEsqueje}
          miembro={miembro} ajustesFallidos={ajustesFallidos}
          onEditarStock={onEditarStock} onEditarStockEsquejes={onEditarStockEsquejes}
          onEditarInicial={onEditarInicial} onEditarInicialEsquejes={onEditarInicialEsquejes}
          geneticasCosecha={geneticasCosecha} geneticasEsquejes={geneticasEsquejes}
          onAgregarGeneticaCosecha={onAgregarGeneticaCosecha} onEliminarGeneticaCosecha={onEliminarGeneticaCosecha}
          onAgregarGeneticaEsquejes={onAgregarGeneticaEsquejes} onEliminarGeneticaEsquejes={onEliminarGeneticaEsquejes}
          pedidoPagos={pedidoPagos} esquejePagos={esquejePagos}
          onAgregarPagoPedido={onAgregarPagoPedido} onEditarPagoPedido={onEditarPagoPedido} onEliminarPagoPedido={onEliminarPagoPedido}
          onAgregarPagoEsqueje={onAgregarPagoEsqueje} onEditarPagoEsqueje={onEditarPagoEsqueje} onEliminarPagoEsqueje={onEliminarPagoEsqueje}
        />
      )}
      {tipo === 'socios' && (
        <TabSocios
          socios={socios} pedidos={pedidos} pedidoPagos={pedidoPagos} miembro={miembro}
          onGuardarSocio={onGuardarSocio} onActualizarSocio={onActualizarSocio} onEliminarSocio={onEliminarSocio}
          onActivarSocio={onActivarSocio} onDesactivarSocio={onDesactivarSocio}
          onActualizarPedido={onActualizarPedido} onEliminarPedido={onEliminarPedido}
          onAgregarPagoPedido={onAgregarPagoPedido} onEditarPagoPedido={onEditarPagoPedido} onEliminarPagoPedido={onEliminarPagoPedido}
          geneticasCosecha={geneticasCosecha}
        />
      )}
    </div>
  )
}

// ─── Tab Propio: Consumo propio (solo cosecha) + Regalo (cosecha/esquejes) ──
function TabPropio({
  pedidos, stock, stockInicial, onGuardarPedido, onActualizarPedido, onEliminarPedido,
  esquejes, stockEsquejes, stockEsquejesInicial, onGuardarEsqueje, onActualizarEsqueje, onEliminarEsqueje,
  miembro, ajustesFallidos,
  onEditarStock, onEditarStockEsquejes, onEditarInicial, onEditarInicialEsquejes,
  geneticasCosecha, geneticasEsquejes, onAgregarGeneticaCosecha, onEliminarGeneticaCosecha, onAgregarGeneticaEsquejes, onEliminarGeneticaEsquejes,
  pedidoPagos, esquejePagos, onAgregarPagoPedido, onEditarPagoPedido, onEliminarPagoPedido, onAgregarPagoEsqueje, onEditarPagoEsqueje, onEliminarPagoEsqueje,
}) {
  const [tipoPropio, setTipoPropio] = useState('propio') // 'propio' | 'regalo'
  const [dominio, setDominio] = useState('cosecha') // solo relevante si tipoPropio === 'regalo'
  const dominioEfectivo = tipoPropio === 'propio' ? 'cosecha' : dominio
  const esCosecha = dominioEfectivo === 'cosecha'
  const cfg = esCosecha ? { ...CFG_COSECHA, geneticas: geneticasCosecha } : { ...CFG_ESQUEJES, geneticas: geneticasEsquejes }
  return (
    <div>
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="form-label" style={{ marginBottom: 8 }}>Tipo de registro</div>
        <div className="segmented-row">
          <button className={`segmented-btn${tipoPropio === 'propio' ? ' active' : ''}`} onClick={() => setTipoPropio('propio')}>Consumo propio</button>
          <button className={`segmented-btn${tipoPropio === 'regalo' ? ' active' : ''}`} onClick={() => setTipoPropio('regalo')}>Regalo</button>
        </div>
        {tipoPropio === 'regalo' && (
          <>
            <div className="form-label" style={{ marginTop: 14, marginBottom: 8 }}>Producto</div>
            <div className="segmented-row segmented-row-sm">
              <button className={`segmented-btn${dominio === 'cosecha' ? ' active' : ''}`} style={dominio === 'cosecha' ? { color: 'var(--green-dark)' } : {}} onClick={() => setDominio('cosecha')}>Cosecha</button>
              <button className={`segmented-btn${dominio === 'esquejes' ? ' active' : ''}`} style={dominio === 'esquejes' ? { color: COLOR_ESQUEJES } : {}} onClick={() => setDominio('esquejes')}>Esquejes</button>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 18 }}>
        <PanelDominio
          cfg={cfg}
          registros={(esCosecha ? pedidos : esquejes).filter(r => r.tipo === tipoPropio)}
          miembro={miembro}
          onGuardar={esCosecha ? onGuardarPedido : onGuardarEsqueje}
          onActualizar={esCosecha ? onActualizarPedido : onActualizarEsqueje}
          onEliminar={esCosecha ? onEliminarPedido : onEliminarEsqueje}
          stock={esCosecha ? stock : stockEsquejes}
          stockInicial={esCosecha ? stockInicial : stockEsquejesInicial}
          ajustesFallidos={ajustesFallidos}
          onEditarStock={esCosecha ? onEditarStock : onEditarStockEsquejes}
          onEditarInicial={esCosecha ? onEditarInicial : onEditarInicialEsquejes}
          onAgregarGenetica={esCosecha ? onAgregarGeneticaCosecha : onAgregarGeneticaEsquejes}
          onEliminarGenetica={esCosecha ? onEliminarGeneticaCosecha : onEliminarGeneticaEsquejes}
          pagos={esCosecha ? pedidoPagos : esquejePagos}
          onAgregarPago={esCosecha ? onAgregarPagoPedido : onAgregarPagoEsqueje}
          onEditarPago={esCosecha ? onEditarPagoPedido : onEditarPagoEsqueje}
          onEliminarPago={esCosecha ? onEliminarPagoPedido : onEliminarPagoEsqueje}
          tipoRegistro={tipoPropio}
          permiteMembresia={false}
        />
      </div>
    </div>
  )
}

// ─── Tab Socios: padrón de socios con Reprocann vinculado a la ONG +
// historial de membresías compradas (derivado de pedidos.socio_id/membresia,
// no se duplica precio/método de pago/estado de cobro en ningún lado nuevo).
function TabSocios({ socios, pedidos, pedidoPagos, miembro, onGuardarSocio, onActualizarSocio, onEliminarSocio, onActivarSocio, onDesactivarSocio, onActualizarPedido, onEliminarPedido, onAgregarPagoPedido, onEditarPagoPedido, onEliminarPagoPedido, geneticasCosecha }) {
  const [nuevo, setNuevo] = useState({ nombre: '', fechaRegistroOng: '' })
  const [toast, showToast] = useToast()
  const [abiertos, setAbiertos] = useState(() => new Set())
  const [editandoSocio, setEditandoSocio] = useState(null)
  const [formEdit, setFormEdit] = useState(null)
  const [confirmandoElim, setConfirmandoElim] = useState(null)
  const [editandoPedido, setEditandoPedido] = useState(null)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(null)
  const [filtroActivo, setFiltroActivo] = useState('activos')
  const [procesandoEstado, setProcesandoEstado] = useState(null)

  async function guardarNuevo(forzar = false) {
    if (guardandoNuevo) return
    const limpio = nuevo.nombre.trim()
    if (!limpio) { showToast('Ingresá el nombre del socio'); return }
    // A diferencia de las genéticas, acá dos personas reales distintas pueden compartir nombre:
    // se avisa pero nunca se bloquea el guardado.
    if (!forzar) {
      const existente = socios.find(s => s.nombre.toLowerCase() === limpio.toLowerCase())
      if (existente) { setConfirmarDuplicado(existente.nombre); return }
    }
    setConfirmarDuplicado(null)
    setGuardandoNuevo(true)
    const res = await onGuardarSocio({ nombre: limpio, fechaRegistroOng: nuevo.fechaRegistroOng || null })
    setGuardandoNuevo(false)
    if (!res?.ok) { showToast('No se pudo guardar. Intentá de nuevo.'); return }
    setNuevo({ nombre: '', fechaRegistroOng: '' })
    showToast('Socio guardado ✓')
  }

  // Desactivar reemplaza al borrado para un socio con historial: preserva el registro (por si
  // vuelve a sumarse) en vez de perder para siempre a quién perteneció cada membresía. El borrado
  // real (eliminar) queda solo disponible para un alta sin ninguna compra todavía.
  async function cambiarEstado(s, activo) {
    if (procesandoEstado) return
    setProcesandoEstado(s.id)
    const res = await (activo ? onActivarSocio(s) : onDesactivarSocio(s))
    setProcesandoEstado(null)
    if (res?.ok !== false) {
      // Cambiar de estado saca al socio de su grupo de filtro actual — vuelve a aparecer
      // colapsado, como cualquier fila, en vez de quedar abierto en su nueva posición.
      setAbiertos(prev => { const next = new Set(prev); next.delete(s.id); return next })
    }
    showToast(res?.ok === false ? 'No se pudo actualizar' : (activo ? `${s.nombre}: reactivado ✓` : `${s.nombre}: desactivado`))
  }

  function toggle(id) {
    setAbiertos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function abrirEdicion(s) {
    setEditandoSocio(s.id)
    setFormEdit({ nombre: s.nombre, fechaRegistroOng: s.fechaRegistroOng || '' })
  }

  async function guardarEdicion(s) {
    if (!formEdit.nombre.trim()) { showToast('El nombre no puede estar vacío'); return }
    const res = await onActualizarSocio({ ...s, nombre: formEdit.nombre.trim(), fechaRegistroOng: formEdit.fechaRegistroOng || null })
    if (!res?.ok) { showToast('No se pudo guardar. Intentá de nuevo.'); return }
    setEditandoSocio(null)
    showToast('Socio actualizado ✓')
  }

  async function eliminar(s) {
    await onEliminarSocio(s)
    setConfirmandoElim(null)
  }

  const sociosOrdenados = [...socios].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const activos = sociosOrdenados.filter(s => s.activo !== false)
  const inactivos = sociosOrdenados.filter(s => s.activo === false)
  const sinReprocann = activos.filter(s => !s.fechaRegistroOng).length
  const sociosFiltrados = filtroActivo === 'activos' ? activos : filtroActivo === 'inactivos' ? inactivos : sociosOrdenados

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Registrar nuevo socio</div>
      <div className="card">
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Nombre</label>
            <input className="form-control" type="text" placeholder="Nombre del socio..." value={nuevo.nombre} onChange={e => setNuevo(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="form-group full">
            <label className="form-label">Fecha de registro en la ONG</label>
            <input className="form-control" type="date" value={nuevo.fechaRegistroOng} onChange={e => setNuevo(f => ({ ...f, fechaRegistroOng: e.target.value }))} />
          </div>
        </div>
      </div>
      <button className="btn-submit" style={{ opacity: guardandoNuevo ? 0.6 : 1 }} disabled={guardandoNuevo} onClick={() => guardarNuevo()}>Guardar socio</button>
      {confirmarDuplicado && (
        <div style={{ marginTop: 8, background: '#FAEEDA', border: '0.5px solid #E8C77E', borderRadius: 'var(--radius-md)', padding: 10 }}>
          <div style={{ fontSize: 12, color: '#633806', marginBottom: 8 }}>Ya existe un socio llamado {confirmarDuplicado} — ¿es la misma persona?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => guardarNuevo(true)} style={{ flex: 1, padding: '7px', background: '#854F0B', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Guardar igual</button>
            <button onClick={() => setConfirmarDuplicado(null)} style={{ flex: 1, padding: '7px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Padrón de socios</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {activos.length} activo{activos.length !== 1 ? 's' : ''}
          {sinReprocann > 0 && <span style={{ color: '#854F0B', fontWeight: 600 }}> · {sinReprocann} sin Reprocann</span>}
        </div>
        <div className="filtros-row" style={{ marginBottom: 10 }}>
          {[['activos', 'Activos'], ['inactivos', `Inactivos (${inactivos.length})`], ['todos', 'Todos']].map(([key, label]) => (
            <button key={key} className={`filtro-btn${filtroActivo === key ? ' active' : ''}`} onClick={() => setFiltroActivo(key)}>{label}</button>
          ))}
        </div>
        {sociosFiltrados.length === 0 ? (
          <div className="empty-state">No hay socios para mostrar.</div>
        ) : (
          <div className="pedidos-list">
            {sociosFiltrados.map(s => {
              const historial = pedidos.filter(p => p.socioId === s.id && p.membresia).sort((a, b) => b.id - a.id)
              const abierto = abiertos.has(s.id)
              const inactivo = s.activo === false
              return (
                <div key={s.id}>
                  <div className="pedido-card" onClick={() => toggle(s.id)} style={{ cursor: 'pointer', opacity: inactivo ? 0.65 : 1 }}>
                    <div>
                      <div className="pedido-nombre">
                        {s.nombre}
                        {inactivo && <span className="badge badge-no-entregado" style={{ marginLeft: 6 }}>Inactivo</span>}
                      </div>
                      <div className="pedido-sub">
                        {s.fechaRegistroOng ? `Reprocann desde ${formatFechaDateISO(s.fechaRegistroOng)}` : 'Sin fecha de registro en la ONG'} · {historial.length} membresía{historial.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="pedido-right">
                      <span className="pedido-editar-hint hint-disclosure">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
                    </div>
                  </div>
                  {abierto && (
                    <div style={{ marginTop: 8, marginLeft: 12 }} onClick={e => e.stopPropagation()}>
                      {editandoSocio === s.id ? (
                        <div className="card">
                          <div className="form-grid">
                            <div className="form-group full">
                              <label className="form-label">Nombre</label>
                              <input className="form-control" type="text" value={formEdit.nombre} onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
                            </div>
                            <div className="form-group full">
                              <label className="form-label">Fecha de registro en la ONG</label>
                              <input className="form-control" type="date" value={formEdit.fechaRegistroOng} onChange={e => setFormEdit(f => ({ ...f, fechaRegistroOng: e.target.value }))} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button className="btn-submit" style={{ flex: 1 }} onClick={() => guardarEdicion(s)}>Guardar cambios</button>
                            <button onClick={() => setEditandoSocio(null)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                          <button onClick={() => abrirEdicion(s)} style={btnLinkStyle('var(--text-secondary)')}>Editar datos</button>
                          {inactivo ? (
                            <button onClick={() => cambiarEstado(s, true)} disabled={procesandoEstado === s.id} style={btnLinkStyle('var(--green-dark)')}>Reactivar socio</button>
                          ) : historial.length > 0 ? (
                            <button onClick={() => cambiarEstado(s, false)} disabled={procesandoEstado === s.id} style={btnLinkStyle('#854F0B')}>Desactivar socio</button>
                          ) : confirmandoElim === s.id ? (
                            <>
                              <span style={{ fontSize: 12, color: '#791F1F' }}>¿Eliminar socio?</span>
                              <button onClick={() => eliminar(s)} style={btnLinkStyle('#791F1F')}>Sí, eliminar</button>
                              <button onClick={() => setConfirmandoElim(null)} style={btnLinkStyle('var(--text-secondary)')}>Cancelar</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmandoElim(s.id)} style={btnLinkStyle('#791F1F')}>Eliminar socio</button>
                          )}
                        </div>
                      )}

                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Historial de membresías</div>
                      {historial.length === 0 ? (
                        <div className="empty-state">Todavía no compró ninguna membresía.</div>
                      ) : (
                        <div className="pedidos-list">
                          {historial.map(p => {
                            const pagosDelRegistro = pagosDe(pedidoPagos, p.id, 'pedido_id')
                            const cobrado = pagosDelRegistro.reduce((s2, pg) => s2 + (parseFloat(pg.monto) || 0), 0)
                            const estado = estadoCobro(p.total, cobrado)
                            return (
                              <div className="pedido-card" key={p.id} onClick={() => setEditandoPedido(p)} style={{ cursor: 'pointer' }}>
                                <div>
                                  <div className="pedido-nombre">Membresía {p.membresia}</div>
                                  <div className="pedido-sub">{p.geneticas.map(g => `${g.nombre} ${g.cantidad}g`).join(' · ')} · {p.fecha}</div>
                                  <div className="pedido-badges">
                                    <span className={`badge ${p.entregado ? 'badge-entregado' : 'badge-no-entregado'}`}>{p.entregado ? 'Entregado' : 'No entregado'}</span>
                                    {estado === 'sobrepago'
                                      ? <span className="badge badge-sobrepago">⚠ Sobrepago: +{formatPesos(cobrado - p.total)}</span>
                                      : estado === 'pagado'
                                        ? <span className="badge badge-pagado">Pagado</span>
                                        : estado === 'parcial'
                                          ? <span className="badge badge-parcial">Parcial: {formatPesos(cobrado)} de {formatPesos(p.total)}</span>
                                          : <span className="badge badge-sin-cobrar">Sin cobrar</span>
                                    }
                                  </div>
                                </div>
                                <div className="pedido-right">
                                  <span className="pedido-total">{formatPesos(p.total)}</span>
                                  <span className="pedido-editar-hint">Tocar para editar</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editandoPedido && (
        <ModalEditarRegistro
          cfg={{ ...CFG_COSECHA, geneticas: geneticasCosecha }}
          registro={editandoPedido}
          pagos={pedidoPagos}
          miembro={miembro}
          onAgregarPago={onAgregarPagoPedido}
          onEditarPago={onEditarPagoPedido}
          onEliminarPago={onEliminarPagoPedido}
          onGuardar={actualizado => { onActualizarPedido(actualizado, editandoPedido); setEditandoPedido(null) }}
          onEliminar={r => { onEliminarPedido(r, editandoPedido); setEditandoPedido(null) }}
          onCerrar={() => setEditandoPedido(null)}
          permiteMembresia
          socios={socios}
        />
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
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
  const [guardando, setGuardando] = useState(false)
  const [avisoDup, setAvisoDup] = useState(null) // { parecidos, para: form } — ver AvisoDuplicado
  const enCurso = useRef(false)
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

  async function guardarGasto(forzar = false) {
    if (enCurso.current) return
    if (!form.descripcion.trim() || !form.categoria || !parseFloat(form.monto) || !form.fecha) {
      showToast('Completá descripción, categoría, monto y fecha')
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
    // El mes lo deriva prepararGasto() a partir de la fecha.
    const nuevoGasto = { descripcion: form.descripcion.trim(), categoria: form.categoria, monto: montoTotal, fecha: form.fecha, locacion, miembro: miembro || null, cuenta: form.dividido ? null : (form.cuenta || null), divisiones: divisionesFinal, presupuesto_id: form.presupuesto_id ? Number(form.presupuesto_id) : null, cuenta_estimada: false }
    enCurso.current = true
    setGuardando(true)
    // Se busca en las dos Hormis (la consulta va a la base, no a la lista filtrada de esta
    // pantalla): también atrapa el mismo gasto cargado antes en la Hormi equivocada.
    if (!forzar) {
      const parecidos = await buscarGastosParecidos(nuevoGasto, gastos)
      if (parecidos.length > 0) {
        enCurso.current = false
        setGuardando(false)
        setAvisoDup({ parecidos, para: form })
        return
      }
    }
    const res = await onNuevoGasto(nuevoGasto)
    enCurso.current = false
    setGuardando(false)
    if (res?.ok) {
      setForm({ descripcion: '', categoria: '', monto: '', fecha: '', cuenta: '', presupuesto_id: '', dividido: false, divisiones: [] })
      setMostrarForm(false)
      showToast('Gasto registrado ✓')
    } else showToast(res?.msg || 'Error al guardar')
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
          {avisoDup && avisoDup.para === form ? (
            <AvisoDuplicado parecidos={avisoDup.parecidos} guardando={guardando} onGuardarIgual={() => guardarGasto(true)} onCancelar={() => setAvisoDup(null)} />
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-submit" onClick={() => guardarGasto()} disabled={guardando} style={{ flex: 1 }}>{guardando ? 'Guardando...' : 'Guardar gasto'}</button>
              <button onClick={() => setMostrarForm(false)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
            </div>
          )}
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
                        <div style={{ minWidth: 0 }}>
                          <div className="pedido-nombre" style={{ overflowWrap: 'anywhere' }}>{g.descripcion}</div>
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
            if (res?.ok) { showToast('Gasto actualizado ✓'); setEditando(null) }
            return res
          }}
          onEliminar={async g => {
            const res = await onEliminarGasto(g)
            if (res?.ok) { showToast('Gasto eliminado ✓'); setEditando(null) }
            return res
          }}
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

// Sin año — para alertas del agente de Finanzas, donde el año casi siempre es
// el actual y solo agrega ruido.
function formatFechaISOSinAnio(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
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

// Los gastos vinculados siempre están en pesos (el flujo de Gastos no cambia por esto) — si el
// presupuesto es en USD, cada gasto se convierte con la cotización del DÍA en que se cargó ese
// gasto puntual (no la de hoy), para que un presupuesto viejo no quede distorsionado por la
// devaluación acumulada desde entonces.
function gastoDePresupuesto(p, gastos, cotizaciones) {
  const gastosDelPresupuesto = gastos.filter(g => g.presupuesto_id === p.id)
  if (p.moneda !== 'USD') return gastosDelPresupuesto.reduce((s, g) => s + (g.monto || 0), 0)
  return gastosDelPresupuesto.reduce((s, g) => {
    const cot = cotizacionParaFecha(g.fecha, cotizaciones)
    return s + (cot ? (g.monto || 0) / cot.promedio : 0)
  }, 0)
}

// El monto asignado original nunca se pisa — los aportes de capital extra (comisión
// directiva) quedan como movimientos aparte en presupuesto_aportes, así se conserva
// el historial de cuánto se sumó, cuándo y por qué. Un aporte siempre está en la misma moneda
// que su presupuesto (no se guarda una moneda propia por aporte, para no poder desalinearse).
function totalAsignado(p, aportes) {
  return (p.monto_asignado || 0) + (aportes || []).filter(a => a.presupuesto_id === p.id).reduce((s, a) => s + (a.monto || 0), 0)
}

function estadoPresupuesto(p, gastos, aportes, cotizaciones) {
  if (p.cerrado) return 'Cerrado'
  if (gastoDePresupuesto(p, gastos, cotizaciones) >= totalAsignado(p, aportes)) return 'Agotado'
  if (p.fecha_limite && p.fecha_limite < hoyISO()) return 'Vencido'
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

// Libro mayor unificado de una cuenta: todo lo que le pega desde cualquier pestaña (Ventas,
// Gastos, la caja de ahorro en dólares) más las validaciones de saldo, en una sola línea de
// tiempo — para ver de un vistazo de dónde viene cada número, cuándo y quién lo cargó.
// `presupuesto_aportes` queda afuera a propósito: no mueve plata de ninguna cuenta real.
function movimientosDeCuenta(nombre, { pedidoPagos, pedidos, esquejePagos, esquejes, insumoPagos, insumos, gastos, dolaresMovimientos, cuentasValidaciones, capitalMovimientos, capitalCambios, esDolar }) {
  const items = []

  function agregarPagos(pagos, registros, fk, tipoRegistro, pestana) {
    pagos.filter(pg => pg.cuenta === nombre).forEach(pg => {
      const registro = registros.find(r => r.id === pg[fk])
      items.push({
        id: `pago-${tipoRegistro}-${pg.id}`, tipo: 'ingreso', pestana, monto: pg.monto || 0,
        fecha: pg.fecha ? new Date(pg.fecha) : null, fechaLabel: formatFechaISOCorta(pg.fecha),
        quien: pg.creado_por || 'Sin autor registrado', objetivo: objetivoPago(tipoRegistro, pg, registro),
      })
    })
  }
  agregarPagos(pedidoPagos, pedidos, 'pedido_id', 'cosecha', 'Ventas · Cosecha')
  agregarPagos(esquejePagos, esquejes, 'esqueje_id', 'esquejes', 'Ventas · Esquejes')
  agregarPagos(insumoPagos, insumos, 'insumo_id', 'insumos', 'Ventas · Insumos')

  ;(capitalMovimientos || []).filter(c => c.cuenta === nombre).forEach(c => {
    items.push({
      id: `capital-${c.id}`, tipo: c.tipo === 'devolucion' ? 'egreso' : 'ingreso',
      pestana: c.tipo === 'devolucion' ? `Capital · devolución a ${c.inversor}` : `Capital · aporte de ${c.inversor}`,
      monto: Number(c.monto) || 0, fecha: c.fecha ? new Date(c.fecha) : null, fechaLabel: formatFechaDateISO(c.fecha),
      quien: c.creado_por || 'Sin autor registrado', objetivo: { tab: 'finanzas', subTab: 'capital' },
    })
  })
  // Un cambio a pesos aparece en las dos puntas: sale de la cuenta en dólares, entra a la de pesos.
  ;(capitalCambios || []).filter(c => c.cuenta_origen === nombre || c.cuenta_destino === nombre).forEach(c => {
    const aporte = (capitalMovimientos || []).find(a => Number(a.id) === Number(c.aporte_id))
    const sale = c.cuenta_origen === nombre
    items.push({
      id: `cambio-${c.id}-${sale ? 'sale' : 'entra'}`, tipo: sale ? 'egreso' : 'ingreso',
      pestana: `Capital · cambio a pesos${aporte ? ` (aporte de ${aporte.inversor})` : ''}`,
      monto: Number(sale ? c.monto_usd : c.monto_ars) || 0, fecha: c.fecha ? new Date(c.fecha) : null, fechaLabel: formatFechaDateISO(c.fecha),
      quien: c.creado_por || 'Sin autor registrado', objetivo: { tab: 'finanzas', subTab: 'capital' },
    })
  })

  gastos.forEach(g => {
    montosPorCuenta(g, 'monto').filter(m => m.cuenta === nombre).forEach(m => {
      items.push({
        id: `gasto-${g.id}`, tipo: 'egreso', pestana: 'Gastos', monto: m.monto,
        fecha: parseFechaDP(g.fecha), fechaLabel: g.fecha || '—',
        quien: g.miembro || 'Sin autor registrado', objetivo: objetivoGasto(g),
      })
    })
  })

  if (esDolar) {
    dolaresMovimientos.filter(m => m.cuenta === nombre).forEach(m => {
      items.push({
        id: `dolar-${m.id}`, tipo: m.tipo === 'egreso' ? 'egreso' : 'ingreso', pestana: 'Caja de ahorro en dólares', monto: m.monto || 0,
        fecha: m.fecha ? new Date(m.fecha) : null, fechaLabel: formatFechaDateISO(m.fecha),
        quien: m.creado_por || 'Sin autor registrado', objetivo: null, dolarMovimiento: m,
      })
    })
  }

  ;[...cuentasValidaciones].filter(v => v.cuenta === nombre).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach((v, i) => {
    items.push({
      id: `validacion-${v.id}`, tipo: 'validacion', pestana: 'Validación de saldo',
      fecha: v.fecha_corte_nueva ? new Date(v.fecha_corte_nueva) : null, fechaLabel: formatFechaDateISO(v.fecha_corte_nueva),
      quien: v.editado_por || v.validado_por || 'Sin autor registrado', objetivo: null,
      validacion: v, esUltimaValidacion: i === 0,
    })
  })

  return items.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0))
}

function IconoCuenta({ nombre, size = 34 }) {
  // Billetera = efectivo; el color lo da la moneda (azul dólares), así la caja en dólares no se
  // confunde con la de pesos.
  const esEfectivo = nombre === CUENTA_EFECTIVO || nombre === CUENTA_EFECTIVO_DOLARES
  const esDolar = CUENTAS_DOLARES.includes(nombre)
  const Icono = esEfectivo ? Wallet : Landmark
  const bg = esDolar ? '#EAF0FB' : esEfectivo ? '#FFF8ED' : '#E1F5EE'
  const color = esDolar ? '#33538F' : esEfectivo ? '#854F0B' : '#0F6E56'
  return (
    <div className="cuenta-icono" style={{ width: size, height: size, background: bg }}>
      <Icono size={Math.round(size * 0.5)} color={color} strokeWidth={2} />
    </div>
  )
}

const btnLinkStyle = color => ({ background: 'none', border: 'none', padding: 0, fontSize: 12, color, fontWeight: 500, cursor: 'pointer' })

function TarjetaPresupuesto({ p, gastos, aportes, cotizaciones, onAlternarCerrado, onAportar, onEliminarAporte, onEditar, mostrarLocacion }) {
  const [formAbierto, setFormAbierto] = useState(null) // null | 'aportar' | 'editar'
  const [formAporte, setFormAporte] = useState({ monto: '', motivo: '', fecha: hoyISO() })
  const [formEditar, setFormEditar] = useState({ nombre: p.nombre, fecha_limite: p.fecha_limite || '', descripcion: p.descripcion || '' })

  const esUSD = p.moneda === 'USD'
  const formatMonto = esUSD ? formatDolares : formatPesos
  const aportesDelPresupuesto = (aportes || []).filter(a => a.presupuesto_id === p.id)
  const asignado = totalAsignado(p, aportes)
  const gastado = gastoDePresupuesto(p, gastos, cotizaciones)
  const restante = asignado - gastado
  const estado = estadoPresupuesto(p, gastos, aportes, cotizaciones)
  const necesitaAporte = estado === 'Agotado' && !p.cerrado
  const colorEstado = estado === 'Vencido' || estado === 'Agotado' ? '#791F1F' : estado === 'Cerrado' ? 'var(--text-secondary)' : 'var(--green-dark)'
  const colorBarra = estado === 'Vencido' || estado === 'Agotado' ? '#791F1F' : estado === 'Cerrado' ? '#c2c2ba' : '#1D9E75'
  const pct = asignado > 0 ? Math.min(100, Math.max(0, (gastado / asignado) * 100)) : 0
  const palabrasDescripcion = contarPalabras(formEditar.descripcion)
  const excedePalabras = palabrasDescripcion > MAX_PALABRAS_PRESUPUESTO

  function abrirForm(nombre) {
    setFormAporte({ monto: '', motivo: '', fecha: hoyISO() })
    setFormEditar({ nombre: p.nombre, fecha_limite: p.fecha_limite || '', descripcion: p.descripcion || '' })
    setFormAbierto(prev => prev === nombre ? null : nombre)
  }

  async function confirmarAporte() {
    if (!parseFloat(formAporte.monto)) return
    await onAportar(p, { monto: parseFloat(formAporte.monto), motivo: formAporte.motivo.trim() || null, fecha: formAporte.fecha })
    setFormAbierto(null)
  }

  async function confirmarEditar() {
    if (!formEditar.nombre.trim() || excedePalabras) return
    await onEditar(p, { nombre: formEditar.nombre.trim(), fecha_limite: formEditar.fecha_limite || null, descripcion: formEditar.descripcion.trim() || null })
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
          {p.descripcion && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>{p.descripcion}</div>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: colorEstado }}>{necesitaAporte ? 'Necesita ampliación' : estado}</div>
      </div>
      <div className="progreso-bar">
        <div className="progreso-fill" style={{ width: `${pct}%`, background: colorBarra }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px', marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Asignado</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{formatMonto(asignado)}</div>
          {aportesDelPresupuesto.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--green-dark)', marginTop: 1 }}>{formatMonto(p.monto_asignado)} + {formatMonto(asignado - p.monto_asignado)} ampliado</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Gastado{esUSD ? ' (equiv.)' : ''}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#791F1F' }}>{formatMonto(gastado)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Restante</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: restante < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatMonto(restante)}</div>
        </div>
      </div>

      {aportesDelPresupuesto.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="form-label">Ampliaciones</div>
          {aportesDelPresupuesto.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatFechaDateISO(a.fecha)} · <strong style={{ color: 'var(--text-primary)' }}>{formatMonto(a.monto)}</strong>{a.motivo ? ` · ${a.motivo}` : ''}{a.creado_por ? ` · ${a.creado_por}` : ''}
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
          <button onClick={() => abrirForm('aportar')} style={btnLinkStyle('var(--green-dark)')}>+ Ampliar presupuesto</button>
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
              <label className="form-label">Monto a sumar ({esUSD ? 'US$' : '$'})</label>
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
            <button className="btn-submit" onClick={confirmarAporte} style={{ flex: 1 }}>Guardar ampliación</button>
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
              <label className="form-label">
                Descripción breve (opcional){excedePalabras && <span style={{ color: '#791F1F' }}> · máximo {MAX_PALABRAS_PRESUPUESTO} palabras</span>}
              </label>
              <input
                className="form-control" type="text" placeholder="Ej: inyección en dólares para el terreno de Hormi 2.0"
                value={formEditar.descripcion} onChange={e => setFormEditar(f => ({ ...f, descripcion: e.target.value }))}
                style={excedePalabras ? { borderColor: '#791F1F' } : undefined}
              />
              <div style={{ fontSize: 11, color: excedePalabras ? '#791F1F' : 'var(--text-secondary)', textAlign: 'right' }}>{palabrasDescripcion}/{MAX_PALABRAS_PRESUPUESTO} palabras</div>
            </div>
            <div className="form-group full">
              <label className="form-label">Fecha límite (opcional)</label>
              <input className="form-control" type="date" value={formEditar.fecha_limite} onChange={e => setFormEditar(f => ({ ...f, fecha_limite: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-submit" onClick={confirmarEditar} style={{ flex: 1 }} disabled={excedePalabras}>Guardar cambios</button>
            <button onClick={() => setFormAbierto(null)} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Libro mayor unificado de una cuenta (movimientosDeCuenta): ingresos/egresos de todas las
// pestañas + validaciones de saldo, en una sola línea de tiempo. Compartido entre la card de
// pesos y la de dólares. Reemplaza al viejo "Ver historial de validaciones" (solo validaciones)
// y al "Historial de movimientos" propio de las cuentas en dólares (solo dolares_movimientos) —
// misma data, un solo lugar, sin duplicar la lista en la card.
function DisclosureMovimientosCuenta({ movimientos, formatMonto, onRevisar, onEditarValidacion, onEditarMovimientoDolar, onEliminarMovimientoDolar }) {
  const [abierto, setAbierto] = useState(false)
  const [editandoValidacionId, setEditandoValidacionId] = useState(null)
  const [inputValor, setInputValor] = useState('')
  const [inputFecha, setInputFecha] = useState('')
  const [editandoDolarId, setEditandoDolarId] = useState(null)
  const [formDolar, setFormDolar] = useState(null)
  const [guardando, setGuardando] = useState(false)
  if (movimientos.length === 0) return null

  function abrirEditarValidacion(v) {
    setInputValor(String(v.saldo_validado ?? 0))
    setInputFecha(v.fecha_corte_nueva)
    setEditandoValidacionId(v.id)
  }
  async function confirmarEditarValidacion(v) {
    if (guardando) return
    setGuardando(true)
    await onEditarValidacion(v, inputValor, inputFecha)
    setGuardando(false)
    setEditandoValidacionId(null)
  }

  function abrirEditarDolar(m) {
    setFormDolar({ tipo: m.tipo, monto: String(m.monto), concepto: m.concepto || '', fecha: m.fecha })
    setEditandoDolarId(m.id)
  }
  async function confirmarEditarDolar(id) {
    if (guardando || !parseFloat(formDolar.monto)) return
    setGuardando(true)
    await onEditarMovimientoDolar(id, { tipo: formDolar.tipo, monto: parseFloat(formDolar.monto), concepto: formDolar.concepto.trim() || null, fecha: formDolar.fecha })
    setGuardando(false)
    setEditandoDolarId(null)
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
      <button className="btn-disclosure" onClick={() => setAbierto(v => !v)} style={{ width: '100%' }}>
        <span>{abierto ? 'Ocultar movimientos' : `Ver todos los movimientos (${movimientos.length})`}</span>
        {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {movimientos.map(m => (
            <div key={m.id} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {m.tipo === 'validacion' ? (
                editandoValidacionId === m.validacion.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <InputMonto placeholder="Saldo real validado" value={inputValor} onChange={setInputValor} permiteNegativo style={{ flex: 1 }} />
                      <input className="form-control" type="date" value={inputFecha} onChange={e => setInputFecha(e.target.value)} style={{ flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={() => confirmarEditarValidacion(m.validacion)} disabled={guardando}>Guardar</button>
                      <button onClick={() => setEditandoValidacionId(null)} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.fechaLabel} · <em>Validación de saldo</em> · Calculado {formatMonto(m.validacion.saldo_calculado)} → Validado {formatMonto(m.validacion.saldo_validado)} ·{' '}
                    <strong style={{ color: m.validacion.diferencia < 0 ? '#791F1F' : m.validacion.diferencia > 0 ? 'var(--green-dark)' : 'var(--text-secondary)' }}>
                      {m.validacion.diferencia === 0 ? 'sin diferencia' : `${m.validacion.diferencia > 0 ? '+' : ''}${formatMonto(m.validacion.diferencia)}`}
                    </strong>
                    {m.validacion.validado_por ? ` · ${m.validacion.validado_por}` : ''}
                    {m.validacion.editado_en ? ` · editado por ${m.validacion.editado_por || 'alguien'} el ${formatFechaHoraISO(m.validacion.editado_en)}` : ''}
                    {m.esUltimaValidacion && onEditarValidacion && (
                      <> · <button onClick={() => abrirEditarValidacion(m.validacion)} style={{ ...btnLinkStyle('var(--green-dark)'), fontSize: 11 }}>Editar</button></>
                    )}
                  </>
                )
              ) : m.dolarMovimiento && editandoDolarId === m.dolarMovimiento.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="form-control" value={formDolar.tipo} onChange={e => setFormDolar(f => ({ ...f, tipo: e.target.value }))} style={{ flex: 1 }}>
                      <option value="ingreso">Compra / depósito</option>
                      <option value="egreso">Retiro</option>
                    </select>
                    <InputMonto value={formDolar.monto} onChange={v => setFormDolar(f => ({ ...f, monto: v }))} style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-control" type="date" value={formDolar.fecha} onChange={e => setFormDolar(f => ({ ...f, fecha: e.target.value }))} style={{ flex: 1 }} />
                    <input className="form-control" type="text" placeholder="Concepto (opcional)" value={formDolar.concepto} onChange={e => setFormDolar(f => ({ ...f, concepto: e.target.value }))} style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={() => confirmarEditarDolar(m.dolarMovimiento.id)} disabled={guardando}>Guardar</button>
                    <button onClick={() => setEditandoDolarId(null)} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  {m.fechaLabel} · {m.pestana} ·{' '}
                  <strong style={{ color: m.tipo === 'egreso' ? '#791F1F' : 'var(--green-dark)' }}>
                    {m.tipo === 'egreso' ? '-' : '+'}{formatMonto(m.monto)}
                  </strong>
                  {m.dolarMovimiento?.concepto ? ` · ${m.dolarMovimiento.concepto}` : ''}
                  {` · ${m.quien}`}
                  {m.objetivo && onRevisar && (
                    <> · <button onClick={() => onRevisar(m.objetivo)} style={{ ...btnLinkStyle('var(--green-dark)'), fontSize: 11 }}>Revisar</button></>
                  )}
                  {m.dolarMovimiento && onEditarMovimientoDolar && (
                    <> · <button onClick={() => abrirEditarDolar(m.dolarMovimiento)} style={{ ...btnLinkStyle('var(--green-dark)'), fontSize: 11 }}>Editar</button></>
                  )}
                  {m.dolarMovimiento && onEliminarMovimientoDolar && (
                    <> · <button onClick={() => onEliminarMovimientoDolar(m.dolarMovimiento.id)} style={{ ...btnLinkStyle('#791F1F'), fontSize: 11 }}>×</button></>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Cuentas en dólares: sin pedidos/gastos que las alimenten, el saldo es
// saldo inicial validado + historial de movimientos manuales (compras/retiros),
// igual patrón que los aportes de capital de un presupuesto.
function TarjetaCuentaDolar({ r, movimientos, onValidarSaldo, onEditarValidacion, onAgregarMovimiento, onEditarMovimientoDolar, onEliminarMovimiento, onRevisar }) {
  const [formAbierto, setFormAbierto] = useState(null) // null | 'saldo' | 'movimiento'
  const [inputSaldo, setInputSaldo] = useState('')
  const [inputCorte, setInputCorte] = useState('')
  const [formMov, setFormMov] = useState({ tipo: 'ingreso', monto: '', concepto: '', fecha: hoyISO() })
  const [guardandoSaldo, setGuardandoSaldo] = useState(false)

  function abrirValidarSaldo() {
    setInputSaldo(String(r.saldo ?? 0))
    setInputCorte(hoyISO())
    setFormAbierto('saldo')
  }

  function abrirMovimiento() {
    setFormMov({ tipo: 'ingreso', monto: '', concepto: '', fecha: hoyISO() })
    setFormAbierto('movimiento')
  }

  async function confirmarSaldo() {
    if (guardandoSaldo) return
    setGuardandoSaldo(true)
    await onValidarSaldo(r.nombre, inputSaldo, inputCorte)
    setGuardandoSaldo(false)
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
          <div className="form-label" style={{ marginTop: 2 }}>{r.nombre === CUENTA_EFECTIVO_DOLARES ? 'Efectivo en dólares' : 'Cuenta en dólares'}</div>
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

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
        <button onClick={abrirMovimiento} style={btnLinkStyle('#33538F')}>+ Movimiento</button>
        <button onClick={abrirValidarSaldo} style={btnLinkStyle('var(--text-secondary)')}>Validar saldo real</button>
      </div>

      {formAbierto === 'saldo' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Calculado por el sistema: <strong>{formatDolares(r.saldo)}</strong> — pisalo con lo que contaste real.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <InputMonto placeholder="Saldo real validado (US$)" value={inputSaldo} onChange={setInputSaldo} permiteNegativo style={{ flex: 1 }} />
            <input className="form-control" type="date" value={inputCorte} onChange={e => setInputCorte(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            Desde esta fecha se cuentan los movimientos nuevos — todo lo anterior queda afuera del saldo.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={confirmarSaldo} disabled={guardandoSaldo}>Guardar</button>
            <button onClick={() => setFormAbierto(null)} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
          </div>
        </div>
      )}

      <DisclosureMovimientosCuenta movimientos={movimientos} formatMonto={formatDolares} onRevisar={onRevisar} onEditarValidacion={onEditarValidacion} onEditarMovimientoDolar={onEditarMovimientoDolar} onEliminarMovimientoDolar={onEliminarMovimiento} />

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

// ─── Capital: aportes y devoluciones ────────────────────────────
// Plata REAL que entra (aporte de un socio/inversor) o sale (devolución) de una cuenta: suma o
// resta en el saldo de esa cuenta, en pesos o en la caja de dólares, respetando la fecha de
// corte como cualquier otro movimiento. Distinto del "+ Ampliar presupuesto" de un presupuesto
// (presupuesto_aportes), que solo amplía lo asignado y no toca ninguna cuenta.
const LOCACIONES_CAPITAL = [{ valor: '', label: 'General' }, { valor: 'Hormi 1.0', label: 'Hormi 1.0' }, { valor: 'Hormi 2.0', label: 'Hormi 2.0' }]

// Cómo entró (o salió) la plata: en efectivo va siempre a la caja de esa moneda; por
// transferencia, a una cuenta bancaria de esa moneda (mismo criterio que Ventas).
const METODOS_CAPITAL = [{ valor: 'efectivo', label: 'Efectivo' }, { valor: 'transferencia', label: 'Transferencia' }]
function cuentasCapital(metodo, moneda) {
  if (metodo === 'efectivo') return [moneda === 'USD' ? CUENTA_EFECTIVO_DOLARES : CUENTA_EFECTIVO]
  if (metodo === 'transferencia') return moneda === 'USD' ? CUENTAS_DOLARES_BANCARIAS : CUENTAS_BANCARIAS
  return []
}
// Al cambiar método o moneda: una sola opción se elige sola; si la cuenta que estaba ya no
// corresponde, se limpia (un aporte en dólares apuntando a una cuenta en pesos no sumaría en
// ningún saldo).
function cuentaCapitalPara(metodo, moneda, cuentaPrevia) {
  const opciones = cuentasCapital(metodo, moneda)
  if (opciones.length === 1) return opciones[0]
  return opciones.includes(cuentaPrevia) ? cuentaPrevia : ''
}
// Movimientos cargados antes de existir el campo (o desde una pestaña vieja): se deduce de la cuenta.
function metodoDeCapital(c) {
  if (c.metodo) return c.metodo
  return c.cuenta === CUENTA_EFECTIVO || c.cuenta === CUENTA_EFECTIVO_DOLARES ? 'efectivo' : 'transferencia'
}

// Retorno prometido: "30% anual", "2,5% mensual".
function formatTasa(tasa, periodo) {
  return `${Number(tasa).toLocaleString('es-AR', { maximumFractionDigits: 2 })}% ${periodo === 'mensual' ? 'mensual' : 'anual'}`
}

// Cotización y % de retorno: se guarda lo tipeado y se interpreta con parseDecimal (src/capital.js)
// — InputMonto no sirve acá porque descarta los decimales y muestra "$".
function InputDecimal({ value, onChange, placeholder }) {
  return <input className="form-control" type="text" inputMode="decimal" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ''))} />
}

// Aportes que se pueden elegir en una devolución: los marcados "hay que devolverlo", el más viejo
// primero. Los ya devueltos quedan afuera, salvo el que la devolución ya tiene (al editarla).
function aportesParaDevolver(movimientos, hoy, aporteActualId) {
  return movimientos.filter(c => c.tipo === 'aporte' && c.a_devolver)
    .map(a => resumenAporte(a, movimientos, hoy))
    .filter(r => r.estado !== 'devuelto' || String(r.aporte.id) === String(aporteActualId))
    .sort((x, y) => String(x.aporte.fecha).localeCompare(String(y.aporte.fecha)) || new Date(x.aporte.created_at) - new Date(y.aporte.created_at))
}

function FormCapital({ inicial, esEdicion, incrustado, inversores, capitalMovimientos, capitalCambios = [], cotizaciones, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [avisoDup, setAvisoDup] = useState(null) // { parecidos, para: form } — ver AvisoDuplicado
  const enCurso = useRef(false)
  // Si alguien escribió la cotización a mano, cambiar la fecha ya no se la pisa con la del blue.
  const cotizacionTocada = useRef(!!inicial.cotizacion)
  const idLista = useId()
  const hoy = hoyISO()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const esAporte = form.tipo === 'aporte'
  const cuentas = cuentasCapital(form.metodo, form.moneda)
  const formatMonto = form.moneda === 'USD' ? formatDolares : formatPesos
  const cotHoy = cotizaciones[0] || null

  // Al editar, este mismo movimiento no cuenta (ni como aporte elegible ni como devolución ya hecha).
  const otros = useMemo(() => capitalMovimientos.filter(c => c.id !== form.id), [capitalMovimientos, form.id])
  const opcionesAporte = useMemo(() => (esAporte ? [] : aportesParaDevolver(otros, hoy, inicial.aporte_id)), [esAporte, otros, hoy, inicial.aporte_id])
  const elegido = opcionesAporte.find(r => String(r.aporte.id) === String(form.aporte_id)) || null
  const aporte = elegido?.aporte || null
  const fmtAporte = aporte?.moneda === 'USD' ? formatDolares : formatPesos
  const monedaDistinta = !esAporte && !!aporte && form.moneda !== aporte.moneda
  const cotDia = cotizacionParaFechaISO(form.fecha, cotizaciones)
  const devolucionesDeEste = esEdicion && inicial.tipo === 'aporte' ? capitalMovimientos.filter(c => c.tipo === 'devolucion' && String(c.aporte_id) === String(form.id)).length : 0
  const cambiosDeEste = esEdicion && inicial.tipo === 'aporte' ? resumenCambios({ id: form.id, monto: 0 }, capitalCambios) : null

  const aporteDe = id => capitalMovimientos.find(c => c.tipo === 'aporte' && String(c.id) === String(id)) || null
  // Devolución en otra moneda que su aporte: la cotización arranca en el blue promedio de ese día.
  function conCotizacion(f) {
    if (f.tipo !== 'devolucion' || cotizacionTocada.current) return f
    const a = aporteDe(f.aporte_id)
    if (!a || f.moneda === a.moneda) return { ...f, cotizacion: '' }
    const c = cotizacionParaFechaISO(f.fecha, cotizaciones)
    return { ...f, cotizacion: c ? String(Number(c.promedio)) : '' }
  }
  function setTipo(tipo) {
    setForm(f => conCotizacion({ ...f, tipo, a_devolver: tipo === 'aporte' ? f.a_devolver : false, aporte_id: tipo === 'aporte' ? '' : f.aporte_id }))
  }
  function setMoneda(moneda) { setForm(f => conCotizacion({ ...f, moneda, cuenta: cuentaCapitalPara(f.metodo, moneda, f.cuenta) })) }
  function setMetodo(metodo) { setForm(f => ({ ...f, metodo, cuenta: cuentaCapitalPara(metodo, f.moneda, f.cuenta) })) }
  function setFecha(fecha) { setForm(f => conCotizacion({ ...f, fecha })) }
  function setCotizacion(v) { cotizacionTocada.current = true; set('cotizacion', v) }
  // Elegir el aporte trae su inversor y su moneda (se puede pagar en la otra).
  function elegirAporte(id) {
    const a = aporteDe(id)
    setForm(f => {
      const moneda = a ? a.moneda : f.moneda
      return conCotizacion({ ...f, aporte_id: id, inversor: a ? a.inversor : '', moneda, cuenta: cuentaCapitalPara(f.metodo, moneda, f.cuenta) })
    })
  }
  function setADevolver(v) { setForm(f => ({ ...f, a_devolver: v, periodo_tasa: f.periodo_tasa || 'anual' })) }

  const montoNum = parseFloat(form.monto) || 0
  const tasaNum = parseDecimal(form.tasa_retorno)
  const cotNum = parseDecimal(form.cotizacion)
  const equivalente = aporte && montoNum ? equivalenteDevolucion({ monto: montoNum, moneda: form.moneda, cotizacion: monedaDistinta ? cotNum : null }, aporte) : 0
  const pactadoBorrador = esAporte && form.a_devolver && montoNum && form.fecha_devolucion
    ? montoNum + interesPactado({ ...form, monto: montoNum, a_devolver: true, tasa_retorno: tasaNum > 0 ? tasaNum : null })
    : null

  async function guardar(forzar = false) {
    if (enCurso.current) return
    const inversor = esAporte ? form.inversor.trim() : (aporte?.inversor || '').trim()
    const monto = parseFloat(form.monto)
    if (!esAporte && !aporte) { setError('Elegí qué aporte se devuelve.'); return }
    if (!inversor) { setError('Escribí quién aporta.'); return }
    if (!monto || monto <= 0) { setError('Ingresá un monto válido.'); return }
    if (!form.metodo) { setError(esAporte ? 'Elegí cómo se recibió la plata: efectivo o transferencia.' : 'Elegí cómo se devolvió la plata: efectivo o transferencia.'); return }
    // También frena una cuenta vieja que ya no corresponde al método/moneda (ej. al editar).
    if (!cuentas.includes(form.cuenta)) { setError(esAporte ? 'Elegí la cuenta a la que entró la plata.' : 'Elegí la cuenta de la que salió la plata.'); return }
    if (!form.fecha) { setError('Elegí la fecha.'); return }
    const conRetorno = esAporte && !!form.a_devolver
    if (conRetorno) {
      if (!form.fecha_devolucion) { setError('Elegí la fecha de devolución.'); return }
      if (form.fecha_devolucion < form.fecha) { setError('La fecha de devolución no puede ser anterior al aporte.'); return }
      if (String(form.tasa_retorno).trim() && !(tasaNum >= 0)) { setError('Revisá el % de retorno: tiene que ser un número, ej. 30 o 2,5.'); return }
    }
    // Mismo criterio que la base (trigger capital_movimientos_validar), avisado antes de mandar.
    if (devolucionesDeEste > 0) {
      const original = capitalMovimientos.find(c => c.id === form.id)
      if (!esAporte || !form.a_devolver) { setError(`Este aporte tiene ${devolucionesDeEste === 1 ? 'una devolución cargada' : `${devolucionesDeEste} devoluciones cargadas`}: para ${!esAporte ? 'pasarlo a devolución' : 'apagar "Hay que devolverlo"'} primero borralas o pasalas a otro aporte.`); return }
      if (original && original.moneda !== form.moneda) { setError('Este aporte tiene devoluciones cargadas: para cambiarle la moneda primero borralas.'); return }
    }
    if (cambiosDeEste && cambiosDeEste.cambios.length > 0) {
      const n = cambiosDeEste.cambios.length
      if (!esAporte || form.moneda !== 'USD') { setError(`Este aporte tiene ${n === 1 ? 'un cambio a pesos cargado' : `${n} cambios a pesos cargados`}: para ${!esAporte ? 'pasarlo a devolución' : 'pasarlo a pesos'} primero borralos.`); return }
      if (monto + 0.005 < cambiosDeEste.usd) { setError(`Ya se cambiaron ${formatDolares(cambiosDeEste.usd)} de este aporte a pesos: el monto no puede ser menor.`); return }
    }
    if (monedaDistinta && !(cotNum > 0)) { setError('Poné la cotización con la que se pagó (pesos por dólar).'); return }
    setError('')
    const mov = {
      tipo: form.tipo, inversor, monto, moneda: form.moneda, metodo: form.metodo, cuenta: form.cuenta, fecha: form.fecha,
      locacion: form.locacion || null, a_devolver: conRetorno, motivo: form.motivo.trim() || null,
      tasa_retorno: conRetorno && tasaNum > 0 ? tasaNum : null,
      periodo_tasa: conRetorno && tasaNum > 0 ? form.periodo_tasa : null,
      fecha_devolucion: conRetorno ? form.fecha_devolucion : null,
      aporte_id: esAporte ? null : Number(aporte.id),
      cotizacion: monedaDistinta ? cotNum : null,
      // "Dado por devuelto" solo existe en un aporte a devolver; si deja de serlo, se limpia.
      ...(conRetorno ? {} : { saldado_en: null, saldado_por: null }),
    }
    enCurso.current = true
    setGuardando(true)
    try {
      if (!esEdicion && !forzar) {
        const parecidos = await buscarCapitalParecido(mov, capitalMovimientos)
        if (parecidos.length > 0) { setAvisoDup({ parecidos, para: form }); return }
      }
      const res = await onGuardar(mov)
      if (!res?.ok) setError(res?.msg || 'No se pudo guardar. Revisá la conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <div className={`${incrustado ? 'form-incrustado' : 'card'} form-capital`}>
      <div className="form-grid">
        <div className="form-group full">
          <label className="form-label">Tipo</label>
          <div className="miembro-row" style={{ marginBottom: 0 }}>
            <button type="button" className={`miembro-btn${esAporte ? ' active' : ''}`} onClick={() => setTipo('aporte')}>Aporte</button>
            <button type="button" className={`miembro-btn${!esAporte ? ' active' : ''}`} onClick={() => setTipo('devolucion')}>Devolución</button>
          </div>
        </div>
        {esAporte ? (
          <div className="form-group full">
            <label className="form-label">Quién aporta</label>
            <input className="form-control" type="text" list={idLista} placeholder="Ej: Bruno" value={form.inversor} onChange={e => set('inversor', e.target.value)} />
            <datalist id={idLista}>{inversores.map(n => <option key={n} value={n} />)}</datalist>
          </div>
        ) : (
          <div className="form-group full">
            <label className="form-label">Qué aporte se devuelve</label>
            <select className="form-control" value={String(form.aporte_id || '')} onChange={e => elegirAporte(e.target.value)}>
              <option value="">{opcionesAporte.length ? 'Seleccionar...' : 'No hay aportes para devolver'}</option>
              {opcionesAporte.map(r => {
                const f = r.aporte.moneda === 'USD' ? formatDolares : formatPesos
                return <option key={r.aporte.id} value={String(r.aporte.id)}>{r.aporte.inversor} · {formatFechaDateISO(r.aporte.fecha)} · {f(r.capital)} · pendiente {f(r.pendiente)}</option>
              })}
            </select>
          </div>
        )}
        <div className="form-group full">
          <label className="form-label">{esAporte ? 'Moneda' : 'Moneda en que se paga'}</label>
          <div className="miembro-row" style={{ marginBottom: 0 }}>
            {['ARS', 'USD'].map(m => (
              <button type="button" key={m} className={`miembro-btn${form.moneda === m ? ' active' : ''}`} onClick={() => setMoneda(m)}>{m === 'ARS' ? 'Pesos' : 'Dólares'}</button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Monto ({form.moneda === 'USD' ? 'US$' : '$'})</label>
          <InputMonto value={form.monto} onChange={v => set('monto', v)} />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input className="form-control" type="date" value={form.fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        {monedaDistinta && (
          <div className="form-group full">
            <label className="form-label">Cotización (pesos por dólar)</label>
            <InputDecimal value={form.cotizacion} onChange={setCotizacion} />
            {cotDia && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Blue promedio del {formatFechaDateISO(cotDia.fecha)}: {formatPesos(cotDia.promedio)}
                {!(Math.abs(cotNum - Number(cotDia.promedio)) <= 0.005) && (
                  <> · <button type="button" onClick={() => { cotizacionTocada.current = false; setForm(f => conCotizacion(f)) }} style={{ ...btnLinkStyle('var(--green-dark)'), fontSize: 11 }}>Usar esa</button></>
                )}
              </div>
            )}
          </div>
        )}
        <div className="form-group full">
          <label className="form-label">{esAporte ? 'Cómo se recibió' : 'Cómo se devolvió'}</label>
          <div className="miembro-row" style={{ marginBottom: 0 }}>
            {METODOS_CAPITAL.map(m => (
              <button type="button" key={m.valor} className={`miembro-btn${form.metodo === m.valor ? ' active' : ''}`} onClick={() => setMetodo(m.valor)}>{m.label}</button>
            ))}
          </div>
        </div>
        {form.metodo && (
          <div className="form-group full">
            <label className="form-label">{esAporte ? 'Cuenta a la que entró' : 'Cuenta de la que salió'}</label>
            <select className="form-control" value={form.cuenta} disabled={cuentas.length === 1} onChange={e => set('cuenta', e.target.value)}>
              <option value="">Seleccionar...</option>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div className="form-group full">
          <label className="form-label">Hormi</label>
          <div className="miembro-row" style={{ marginBottom: 0 }}>
            {LOCACIONES_CAPITAL.map(l => (
              <button type="button" key={l.label} className={`miembro-btn${form.locacion === l.valor ? ' active' : ''}`} onClick={() => set('locacion', l.valor)}>{l.label}</button>
            ))}
          </div>
        </div>
        {esAporte && (
          <div className="form-group full">
            <div className="toggle-row">
              <span className="toggle-label">Hay que devolverlo</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!form.a_devolver} onChange={e => setADevolver(e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        )}
        {esAporte && form.a_devolver && (
          <>
            <div className="form-group">
              <label className="form-label">% de retorno</label>
              <InputDecimal value={form.tasa_retorno} onChange={v => set('tasa_retorno', v)} placeholder="Ej: 30" />
            </div>
            <div className="form-group">
              <label className="form-label">Período</label>
              <div className="miembro-row" style={{ marginBottom: 0 }}>
                {['anual', 'mensual'].map(p => (
                  <button type="button" key={p} className={`miembro-btn${form.periodo_tasa === p ? ' active' : ''}`} onClick={() => set('periodo_tasa', p)}>{p === 'anual' ? 'Anual' : 'Mensual'}</button>
                ))}
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">Fecha de devolución</label>
              <input className="form-control" type="date" value={form.fecha_devolucion} onChange={e => set('fecha_devolucion', e.target.value)} />
            </div>
            {pactadoBorrador !== null && (
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                A devolver el {formatFechaDateISO(form.fecha_devolucion)}: <strong style={{ color: 'var(--text-primary)' }}>{formatMonto(pactadoBorrador)}</strong>
                {pactadoBorrador - montoNum > TOLERANCIA_CAPITAL ? ` (${formatMonto(montoNum)} + ${formatMonto(pactadoBorrador - montoNum)} de interés)` : ' (solo el capital)'}
                {form.moneda === 'USD' && cotHoy ? ` · ≈ ${formatPesos(pactadoBorrador * cotHoy.promedio)} al blue de hoy` : ''}
              </div>
            )}
          </>
        )}
        <div className="form-group full">
          <label className="form-label">Motivo (opcional)</label>
          <input className="form-control" type="text" placeholder={esAporte ? 'Ej: invernadero Hormi 2.0' : 'Ej: primera cuota'} value={form.motivo} onChange={e => set('motivo', e.target.value)} />
        </div>
      </div>
      {elegido && (() => {
        const excede = equivalente > elegido.pendiente + TOLERANCIA_CAPITAL
        return (
          <div style={{ fontSize: 11, marginTop: 8, color: excede ? '#791F1F' : 'var(--text-secondary)' }}>
            {monedaDistinta && equivalente > 0 ? `Descuenta ${fmtAporte(equivalente)} de la deuda. ` : ''}
            {excede
              ? `⚠ Esto supera lo pendiente de devolverle a ${aporte.inversor} (${fmtAporte(elegido.pendiente)}).`
              : `Pendiente de devolverle a ${aporte.inversor}: ${fmtAporte(elegido.pendiente)}${aporte.moneda === 'USD' && cotHoy && elegido.pendiente > TOLERANCIA_CAPITAL ? ` (≈ ${formatPesos(elegido.pendiente * cotHoy.promedio)} al blue de hoy)` : ''}.`}
          </div>
        )
      })()}
      {error && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 8 }}>{error}</div>}
      {avisoDup && avisoDup.para === form ? (
        <AvisoDuplicado parecidos={avisoDup.parecidos} guardando={guardando} onGuardarIgual={() => guardar(true)} onCancelar={() => setAvisoDup(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-submit" style={{ flex: 1 }} disabled={guardando} onClick={() => guardar()}>
            {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : esAporte ? 'Guardar aporte' : 'Guardar devolución'}
          </button>
          <button onClick={onCancelar} disabled={guardando} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

// Cuenta en pesos donde cae, de entrada, un cambio que sale de una cuenta en dólares: el efectivo
// va a la caja en pesos; un banco, a la cuenta en pesos del mismo dueño ("NaranjaX (Dólar) - Nico"
// → "NaranjaX - Nico"). Siempre se puede elegir otra.
function cuentaPesosPara(cuentaDolares) {
  if (cuentaDolares === CUENTA_EFECTIVO_DOLARES) return CUENTA_EFECTIVO
  const pesos = String(cuentaDolares || '').replace(' (Dólar)', '')
  return CUENTAS.includes(pesos) ? pesos : ''
}

// Cambio a pesos de un aporte en dólares: UN registro (capital_cambios) que resta US$ de la
// cuenta de origen y suma $ en la de destino, así las dos patas se mueven juntas o ninguna.
function FormCambio({ inicial, esEdicion, aporte, capitalCambios, cotizaciones, resumen, resumenDolares, onConsultarAporte, onGuardar, onCancelar, onYaNoExiste }) {
  const [form, setForm] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [avisoDup, setAvisoDup] = useState(null) // { parecidos, para: form } — ver AvisoDuplicado
  const enCurso = useRef(false)
  // Mientras nadie elija "Entra a" a mano, sigue a "Sale de".
  const destinoTocado = useRef(!!esEdicion)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  function setOrigen(cuenta) { setForm(f => ({ ...f, cuenta_origen: cuenta, cuenta_destino: destinoTocado.current ? f.cuenta_destino : cuentaPesosPara(cuenta) })) }
  function setDestino(cuenta) { destinoTocado.current = true; set('cuenta_destino', cuenta) }

  // Lo que queda según esta pantalla; al guardar se vuelve a mirar en la base. Al editar, este cambio no cuenta.
  const queda = resumenCambios(aporte, capitalCambios.filter(c => c.id !== form.id)).sinCambiar
  const usd = parseFloat(form.monto_usd) || 0
  const ars = parseFloat(form.monto_ars) || 0
  const cotizacion = usd > 0 && ars > 0 ? ars / usd : null
  const blue = cotizacionParaFechaISO(form.fecha, cotizaciones)
  const bluePromedio = blue ? Number(blue.promedio) : null
  const arsAlBlue = bluePromedio && usd > 0 ? Math.round(usd * bluePromedio) : null

  // Avisos que no frenan: puede haber un cambio real a otro precio, o plata que ya estaba contada.
  const avisos = []
  if (cotizacion && cotizacionLejosDelBlue(cotizacion, bluePromedio)) {
    avisos.push(`A ${formatPesos(cotizacion)} por dólar está muy lejos del blue de ese día (${formatPesos(bluePromedio)}). ¿Se comió un cero?`)
  }
  const origen = resumenDolares.find(r => r.nombre === form.cuenta_origen)
  const destino = resumen.find(r => r.nombre === form.cuenta_destino)
  if (origen && usd > 0 && form.fecha && esDesdeCorteISO(form.fecha, origen.info.fecha_corte)) {
    // Al editar, el saldo de hoy ya tiene restado este mismo cambio si contaba en esa cuenta.
    const original = esEdicion ? capitalCambios.find(c => c.id === form.id) : null
    const yaRestado = original && original.cuenta_origen === form.cuenta_origen && esDesdeCorteISO(original.fecha, origen.info.fecha_corte) ? Number(original.monto_usd) : 0
    const despues = origen.saldo + yaRestado - usd
    if (despues < -TOLERANCIA_CAPITAL) avisos.push(`${form.cuenta_origen} quedaría en ${formatDolares(despues)}.`)
  }
  ;[origen, destino].filter(r => r && form.fecha && !esDesdeCorteISO(form.fecha, r.info.fecha_corte)).forEach(r => {
    avisos.push(`La fecha es anterior a la última validación de ${r.nombre} (${formatFechaDateISO(r.info.fecha_corte)}): no va a mover su saldo. Está bien si esa plata ya estaba contada.`)
  })

  async function guardar(forzar = false) {
    if (enCurso.current) return
    if (!form.fecha) { setError('Elegí la fecha del cambio.'); return }
    if (form.fecha < aporte.fecha) { setError(`La fecha no puede ser anterior al aporte (${formatFechaDateISO(aporte.fecha)}).`); return }
    if (!(usd > 0)) { setError('Poné cuántos dólares se cambiaron.'); return }
    if (!(ars > 0)) { setError('Poné cuántos pesos se recibieron.'); return }
    if (usd > queda + 0.005) { setError(`Del aporte quedan ${formatDolares(queda)} sin cambiar.`); return }
    if (!CUENTAS_DOLARES.includes(form.cuenta_origen)) { setError('Elegí de qué cuenta en dólares salieron.'); return }
    if (!CUENTAS.includes(form.cuenta_destino)) { setError('Elegí a qué cuenta en pesos entraron.'); return }
    setError('')
    enCurso.current = true
    setGuardando(true)
    try {
      // El tope se vuelve a mirar en la base: otro puede haber cargado un cambio de este aporte
      // mientras esta pantalla estaba abierta. Si la consulta falla, el trigger igual lo frena.
      const base = await onConsultarAporte(aporte.id)
      if (base.ok) {
        if (!base.aporte) { setError('Este aporte ya no existe (puede que otro lo haya borrado). Recargá la página.'); return }
        // La consulta ya lo sacó de la pantalla (y con él, este form): avisa el panel.
        if (esEdicion && !base.cambios.some(c => c.id === form.id)) { onYaNoExiste(); return }
        const quedaEnBase = resumenCambios(base.aporte, base.cambios.filter(c => c.id !== form.id)).sinCambiar
        if (usd > quedaEnBase + 0.005) { setError(`Del aporte quedan ${formatDolares(quedaEnBase)} sin cambiar: alguien lo modificó mientras tenías esto abierto.`); return }
      }
      // ¿Ya está cargado? Mismo aporte, mismos dólares, ±3 días — contra la base (cubre también
      // el guardado cuya respuesta se perdió y se reintenta). Solo avisa: puede haber dos cambios iguales.
      if (!esEdicion && !forzar) {
        const delAporte = base.ok ? base.cambios : capitalCambios.filter(c => Number(c.aporte_id) === Number(aporte.id))
        const parecidos = delAporte.filter(c => cambiosParecidos({ aporte_id: aporte.id, monto_usd: usd, fecha: form.fecha }, c))
          .map(c => `Cambio de ${formatDolares(c.monto_usd)} → ${formatPesos(c.monto_ars)} · ${formatFechaDateISO(c.fecha)} · a ${c.cuenta_destino}${cargadoPorTexto(c.creado_por)}`)
        if (parecidos.length > 0) { setAvisoDup({ parecidos, para: form }); return }
      }
      const res = await onGuardar({
        fecha: form.fecha, monto_usd: usd, monto_ars: ars,
        cuenta_origen: form.cuenta_origen, cuenta_destino: form.cuenta_destino, motivo: form.motivo.trim() || null,
      })
      if (!res?.ok) setError(res?.msg || 'No se pudo guardar. Revisá la conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  const ayuda = { fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }
  return (
    <div className="form-incrustado form-cambio">
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input className="form-control" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">US$ a cambiar</label>
          <InputMonto value={form.monto_usd} onChange={v => set('monto_usd', v)} />
          <div style={{ ...ayuda, color: usd > queda + 0.005 ? '#791F1F' : ayuda.color }}>Quedan {formatDolares(queda)}</div>
        </div>
        <div className="form-group full">
          <label className="form-label">Pesos recibidos</label>
          <InputMonto value={form.monto_ars} onChange={v => set('monto_ars', v)} />
          {(cotizacion || arsAlBlue) && (
            <div style={ayuda}>
              {cotizacion ? `A ${formatPesos(cotizacion)} por dólar` : ''}
              {arsAlBlue && arsAlBlue !== ars && (
                <>{cotizacion ? ' · ' : ''}<button type="button" onClick={() => set('monto_ars', String(arsAlBlue))} style={{ ...btnLinkStyle('var(--green-dark)'), fontSize: 11 }}>
                  Usar blue promedio ({formatPesos(bluePromedio)}{blue.fecha !== form.fecha ? `, del ${formatFechaDateISO(blue.fecha)}` : ''})
                </button></>
              )}
              {arsAlBlue && arsAlBlue === ars ? ' · blue promedio' : ''}
            </div>
          )}
        </div>
        <div className="form-group full">
          <label className="form-label">Sale de</label>
          <select className="form-control" value={form.cuenta_origen} onChange={e => setOrigen(e.target.value)}>
            <option value="">Seleccionar...</option>
            {CUENTAS_DOLARES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group full">
          <label className="form-label">Entra a</label>
          <select className="form-control" value={form.cuenta_destino} onChange={e => setDestino(e.target.value)}>
            <option value="">Seleccionar...</option>
            {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group full">
          <label className="form-label">Destino (opcional)</label>
          <input className="form-control" type="text" placeholder="Ej: obra Hormi 2.0" value={form.motivo} onChange={e => set('motivo', e.target.value)} />
        </div>
      </div>
      {avisos.length > 0 && (
        <div className="avisos-cambio" style={{ fontSize: 11, color: '#854F0B', marginTop: 8, lineHeight: 1.5 }}>
          {avisos.map((a, i) => <div key={i}>⚠ {a}</div>)}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 8 }}>{error}</div>}
      {avisoDup && avisoDup.para === form ? (
        <AvisoDuplicado parecidos={avisoDup.parecidos} guardando={guardando} onGuardarIgual={() => guardar(true)} onCancelar={() => setAvisoDup(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-submit" style={{ flex: 1 }} disabled={guardando} onClick={() => guardar()}>
            {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar cambio'}
          </button>
          <button onClick={onCancelar} disabled={guardando} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

// Estado del aporte: azul activo, ámbar si vence en 7 días o menos, rojo vencido, verde
// devuelto, gris si no hay que devolverlo.
function EstadoAporte({ r }) {
  const d = r.diasParaVencer
  const [clase, texto] = r.estado === 'no_se_devuelve' ? ['badge-param-sin-dato', 'No se devuelve']
    : r.estado === 'devuelto' ? ['badge-pagado', 'Devuelto']
    : r.estado === 'vencido' ? ['badge-sin-cobrar', 'Vencido']
    : d !== null && d <= 7 ? ['badge-parcial', d === 0 ? 'Activo · vence hoy' : `Activo · vence en ${d} ${d === 1 ? 'día' : 'días'}`]
    : ['badge-activo', 'Activo']
  return <span className={`badge ${clase} estado-aporte`}>{texto}</span>
}

// Confirmación dentro de una tarjeta: roja para borrar, ámbar para "dar por devuelto".
function ConfirmacionCapital({ texto, siLabel, onSi, onNo, deshabilitado, ambar }) {
  const color = ambar ? '#854F0B' : '#791F1F'
  return (
    <div style={{ marginTop: 8, background: ambar ? '#FFF8ED' : '#FCEBEB', border: `0.5px solid ${ambar ? '#E8C77E' : '#791F1F'}`, borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color, flex: 1 }}>{texto}</span>
      {onSi && <button onClick={onSi} disabled={deshabilitado} style={{ padding: '6px 10px', background: color, color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{siLabel}</button>}
      <button onClick={onNo} disabled={deshabilitado} style={{ padding: '6px 10px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
    </div>
  )
}

// Formularios de Capital armados con los datos del panel (ctx) y sus acciones (acc).
const porFechaCapital = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || new Date(a.created_at) - new Date(b.created_at)
const vacioCapital = (tipo, aporte, hoy) => ({
  tipo, inversor: aporte?.inversor || '', monto: '', moneda: aporte?.moneda || 'ARS', metodo: '', cuenta: '', fecha: hoy, locacion: aporte?.locacion || '',
  a_devolver: false, motivo: '', tasa_retorno: '', periodo_tasa: 'anual', fecha_devolucion: '', aporte_id: aporte ? String(aporte.id) : '', cotizacion: '',
})
const inicialEdicionCapital = c => ({
  id: c.id, tipo: c.tipo, inversor: c.inversor, monto: String(c.monto), moneda: c.moneda || 'ARS', metodo: metodoDeCapital(c), cuenta: c.cuenta,
  fecha: c.fecha, locacion: c.locacion || '', a_devolver: !!c.a_devolver, motivo: c.motivo || '',
  tasa_retorno: c.tasa_retorno != null ? String(Number(c.tasa_retorno)) : '', periodo_tasa: c.periodo_tasa || 'anual', fecha_devolucion: c.fecha_devolucion || '',
  aporte_id: c.aporte_id != null ? String(c.aporte_id) : '', cotizacion: c.cotizacion != null ? String(Number(c.cotizacion)) : '',
})
const vacioCambio = (a, hoy) => ({
  fecha: hoy, monto_usd: '', monto_ars: '', cuenta_origen: CUENTAS_DOLARES.includes(a.cuenta) ? a.cuenta : '',
  cuenta_destino: cuentaPesosPara(a.cuenta), motivo: a.motivo || '',
})
const inicialCambio = c => ({
  id: c.id, fecha: c.fecha, monto_usd: String(Number(c.monto_usd)), monto_ars: String(Number(c.monto_ars)),
  cuenta_origen: c.cuenta_origen, cuenta_destino: c.cuenta_destino, motivo: c.motivo || '',
})
function formMovimientoCapital(ctx, inicial, { key, ...props }) {
  return <FormCapital key={key} inicial={inicial} inversores={ctx.inversores} capitalMovimientos={ctx.capitalMovimientos} capitalCambios={ctx.capitalCambios} cotizaciones={ctx.cotizacionesDolar} {...props} />
}
function formEdicionCapital(ctx, acc, c, incrustado) {
  return formMovimientoCapital(ctx, inicialEdicionCapital(c), { key: c.id, esEdicion: true, incrustado, onGuardar: mov => acc.guardarEdicion(c.id, mov), onCancelar: acc.cerrarEdicion })
}
function formCambioCapital(ctx, acc, aporte, cambio) {
  return (
    <FormCambio
      key={cambio ? `cambio-${cambio.id}` : `cambio-nuevo-${aporte.id}`} esEdicion={!!cambio} inicial={cambio ? inicialCambio(cambio) : vacioCambio(aporte, ctx.hoy)}
      aporte={aporte} capitalCambios={ctx.capitalCambios} cotizaciones={ctx.cotizacionesDolar} resumen={ctx.resumenPesos} resumenDolares={ctx.resumenDolares}
      onConsultarAporte={ctx.onConsultarAporte} onGuardar={acc.guardarCambio} onCancelar={acc.cerrarCambio} onYaNoExiste={acc.cambioYaNoExiste}
    />
  )
}

const ACCIONES_CAPITAL = ['abrirNuevo', 'abrirEdicion', 'abrirCambio', 'pedirBorrar', 'pedirBorrarCambio', 'pedirSaldar', 'cancelarConfirmacion', 'guardarNuevo', 'guardarEdicion',
  'guardarCambio', 'confirmarBorrar', 'confirmarBorrarCambio', 'saldar', 'cerrarNuevo', 'cerrarEdicion', 'cerrarCambio', 'cambioYaNoExiste']
const ESTILO_SECCION_CAPITAL = { gridColumn: '1 / -1', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }
const ESTILO_FILA_CAPITAL = { marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 10px', alignItems: 'center' }
const ESTILO_LINEA_CAPITAL = { gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-secondary)', overflowWrap: 'anywhere', lineHeight: 1.5 }
function BotonBorrarCapital({ titulo, onClick }) {
  return <button className="btn-eliminar-fila" style={{ width: 22, height: 22, fontSize: 10 }} title={titulo} onClick={onClick}>✕</button>
}

function FilaDevolucionCapital({ d, aporte, editando, confirmando, enCurso, acc, ctx }) {
  if (editando) return formEdicionCapital(ctx, acc, d, true)
  const fmt = d.moneda === 'USD' ? formatDolares : formatPesos
  const fmtAporte = aporte?.moneda === 'USD' ? formatDolares : formatPesos
  return (
    <div className="fila-devolucion">
      <div style={ESTILO_FILA_CAPITAL}>
        <span className="cifra-tabular" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {aporte ? '' : `A ${d.inversor} · `}{formatFechaDateISO(d.fecha)} · <span style={{ color: '#791F1F' }}>-{fmt(d.monto)}</span>
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => acc.abrirEdicion(d.id)} style={btnLinkStyle('var(--text-secondary)')}>Editar</button>
          <BotonBorrarCapital titulo="Borrar devolución" onClick={() => acc.pedirBorrar(d.id)} />
        </span>
        <span style={ESTILO_LINEA_CAPITAL}>
          {d.cuenta}{aporte && d.cotizacion != null ? ` · a ${formatPesos(d.cotizacion)} = ${fmtAporte(equivalenteDevolucion(d, aporte))}` : ''}{d.creado_por ? ` · cargado por ${d.creado_por}` : ''}
          {d.motivo ? <span style={{ fontStyle: 'italic' }}> · {d.motivo}</span> : null}
        </span>
      </div>
      {confirmando && (
        <ConfirmacionCapital texto={`¿Borrar esta devolución? Deja de contar en el saldo de ${d.cuenta}.`} siLabel="Sí, borrar" onSi={() => acc.confirmarBorrar(d.id)} onNo={acc.cancelarConfirmacion} deshabilitado={enCurso} />
      )}
    </div>
  )
}

function FilaCambioCapital({ c, aporte, abierto, confirmando, enCurso, acc, ctx }) {
  if (abierto) return formCambioCapital(ctx, acc, aporte, c)
  const cotizacion = Number(c.monto_ars) / Number(c.monto_usd)
  const blue = cotizacionParaFechaISO(c.fecha, ctx.cotizacionesDolar)
  const lejos = blue && cotizacionLejosDelBlue(cotizacion, Number(blue.promedio))
  return (
    <div className="fila-cambio">
      <div style={ESTILO_FILA_CAPITAL}>
        <span className="cifra-tabular" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {formatFechaDateISO(c.fecha)} · {formatDolares(c.monto_usd)} → {formatPesos(c.monto_ars)}
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => acc.abrirCambio(aporte.id, c.id)} style={btnLinkStyle('var(--text-secondary)')}>Editar</button>
          <BotonBorrarCapital titulo="Borrar cambio" onClick={() => acc.pedirBorrarCambio(c.id)} />
        </span>
        <span style={ESTILO_LINEA_CAPITAL}>
          <span style={lejos ? { color: '#854F0B', fontWeight: 600 } : undefined}>{lejos ? '⚠ ' : ''}a {formatPesos(cotizacion)}{blue ? ` (blue ${formatPesos(blue.promedio)})` : ''}</span>
          {c.cuenta_origen !== aporte.cuenta ? ` · salió de ${c.cuenta_origen}` : ''} · entró a {c.cuenta_destino}{c.creado_por ? ` · cargado por ${c.creado_por}` : ''}
          {c.motivo ? <span style={{ fontStyle: 'italic' }}> · {c.motivo}</span> : null}
        </span>
      </div>
      {confirmando && (
        <ConfirmacionCapital texto={`¿Borrar este cambio? Deja de contar en ${c.cuenta_origen} y en ${c.cuenta_destino}.`} siLabel="Sí, borrar" onSi={() => acc.confirmarBorrarCambio(c.id)} onNo={acc.cancelarConfirmacion} deshabilitado={enCurso} />
      )}
    </div>
  )
}

// Memo: con cientos de aportes, abrir un form o una confirmación redibuja solo la tarjeta que
// la tiene (el resto recibe las mismas props: datos precalculados, ids en null y acc estable).
const TarjetaAporte = memo(function TarjetaAporte({ a, datos, editandoId, confirmandoBorrar, confirmandoBorrarCambio, confirmandoSaldar, devolucionAbierta, cambioAbierto, enCurso, acc, ctx }) {
  if (editandoId === a.id) return formEdicionCapital(ctx, acc, a, false)
  const { r, rc, devoluciones } = datos
  const fmt = a.moneda === 'USD' ? formatDolares : formatPesos
  const linkSec = btnLinkStyle('var(--text-secondary)')
  const colgados = [
    devoluciones.length === 1 ? 'una devolución' : devoluciones.length > 1 ? `${devoluciones.length} devoluciones` : '',
    !rc || rc.cambios.length === 0 ? '' : rc.cambios.length === 1 ? 'un cambio a pesos' : `${rc.cambios.length} cambios a pesos`,
  ].filter(Boolean)
  return (
    <div className="pedido-card fila-capital tarjeta-aporte" style={{ cursor: 'default' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="pedido-nombre">Aporte de {a.inversor}</span>
          <EstadoAporte r={r} />
        </div>
        <div className="pedido-sub">
          {formatFechaDateISO(a.fecha)} · {a.cuenta}{a.locacion ? ` · ${a.locacion}` : ''}{a.creado_por ? ` · cargado por ${a.creado_por}` : ''}
        </div>
        {a.motivo && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic', overflowWrap: 'anywhere' }}>{a.motivo}</div>}
        {a.a_devolver && (
          <div className="devolucion-aporte" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
            <div>
              {Number(a.tasa_retorno) > 0 ? formatTasa(a.tasa_retorno, a.periodo_tasa) : 'Sin interés'} · {a.fecha_devolucion
                ? `${r.diasParaVencer < 0 ? 'venció el' : 'vence'} ${formatFechaDateISO(a.fecha_devolucion)}`
                : <span style={{ color: '#854F0B', fontWeight: 600 }}>falta la fecha de devolución</span>}
            </div>
            <div>
              A devolver {fmt(r.pactado)} · devuelto {fmt(r.devuelto)} ·{' '}
              <strong style={{ color: r.estado === 'devuelto' ? 'var(--green-dark)' : '#791F1F' }}>{r.estado === 'devuelto' ? 'Devuelto ✓' : `pendiente ${fmt(r.pendiente)}`}</strong>
              {a.moneda === 'USD' && ctx.cotHoy && r.pendiente > TOLERANCIA_CAPITAL ? ` (≈ ${formatPesos(r.pendiente * ctx.cotHoy.promedio)} hoy)` : ''}
            </div>
            {a.saldado_en && (
              <div>Dado por devuelto por {a.saldado_por || 'alguien'} el {formatFechaHoraISO(a.saldado_en).split(' ')[0]}{r.quedabanAlSaldar > TOLERANCIA_CAPITAL ? ` (quedaban ${fmt(r.quedabanAlSaldar)})` : ''}</div>
            )}
          </div>
        )}
      </div>
      <div className="pedido-right">
        <span className="pedido-total" style={{ color: 'var(--green-dark)' }}>+{fmt(a.monto)}</span>
      </div>
      <div className="acciones-aporte" style={{ gridColumn: '1 / -1', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => acc.abrirEdicion(a.id)} style={linkSec}>Editar</button>
        {a.a_devolver && r.estado !== 'devuelto' && (
          <button onClick={() => acc.abrirNuevo('devolucion', a)} style={btnLinkStyle('var(--green-dark)')}>+ Devolución</button>
        )}
        {a.a_devolver && (a.saldado_en
          ? <button onClick={() => acc.saldar(a, false)} disabled={enCurso} style={linkSec}>Reabrir</button>
          : r.estado !== 'devuelto' && <button onClick={() => acc.pedirSaldar(a.id)} style={linkSec}>Dar por devuelto</button>)}
        <span style={{ marginLeft: 'auto' }}><BotonBorrarCapital titulo="Borrar aporte" onClick={() => acc.pedirBorrar(a.id)} /></span>
      </div>
      {(confirmandoSaldar || confirmandoBorrar === a.id) && (
        <div style={{ gridColumn: '1 / -1' }}>
          {confirmandoSaldar && (
            <ConfirmacionCapital ambar texto={`¿Dar por devuelto? Quedan ${fmt(r.pendiente)} sin devolver y dejan de figurar como pendiente.`} siLabel="Sí" onSi={() => acc.saldar(a, true)} onNo={acc.cancelarConfirmacion} deshabilitado={enCurso} />
          )}
          {confirmandoBorrar === a.id && (colgados.length > 0
            ? <ConfirmacionCapital texto={`Para borrar este aporte primero hay que borrar lo que tiene cargado: ${colgados.join(' y ')}.`} onNo={acc.cancelarConfirmacion} deshabilitado={enCurso} />
            : <ConfirmacionCapital texto={`¿Borrar este aporte? Deja de contar en el saldo de ${a.cuenta}.`} siLabel="Sí, borrar" onSi={() => acc.confirmarBorrar(a.id)} onNo={acc.cancelarConfirmacion} deshabilitado={enCurso} />)}
        </div>
      )}
      {(devoluciones.length > 0 || devolucionAbierta) && (
        <div className="devoluciones-aporte" style={ESTILO_SECCION_CAPITAL}>
          <div className="form-label">Devoluciones</div>
          {devoluciones.map(d => (
            <FilaDevolucionCapital key={d.id} d={d} aporte={a} editando={editandoId === d.id} confirmando={confirmandoBorrar === d.id} enCurso={enCurso} acc={acc} ctx={ctx} />
          ))}
          {devolucionAbierta && formMovimientoCapital(ctx, vacioCapital('devolucion', a, ctx.hoy), { key: `dev-${a.id}`, incrustado: true, onGuardar: acc.guardarNuevo, onCancelar: acc.cerrarNuevo })}
        </div>
      )}
      {rc && (
        <div className="cambios-aporte" style={ESTILO_SECCION_CAPITAL}>
          <div className="form-label">Cambio a pesos</div>
          <div className="resumen-cambios cifra-tabular" style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {rc.cambios.length === 0
              ? `Todavía sin cambiar · ${formatDolares(rc.sinCambiar)}`
              : <>Cambiado {formatDolares(rc.usd)} → {formatPesos(rc.ars)} (a {formatPesos(rc.cotizacion)}) · {rc.sinCambiar > TOLERANCIA_CAPITAL
                ? `quedan ${formatDolares(rc.sinCambiar)} sin cambiar`
                : <strong style={{ color: 'var(--green-dark)' }}>todo cambiado ✓</strong>}</>}
          </div>
          {rc.cambios.map(c => (
            <FilaCambioCapital key={c.id} c={c} aporte={a} abierto={cambioAbierto === c.id} confirmando={confirmandoBorrarCambio === c.id} enCurso={enCurso} acc={acc} ctx={ctx} />
          ))}
          {cambioAbierto === 'nuevo'
            ? formCambioCapital(ctx, acc, a, null)
            : rc.sinCambiar > TOLERANCIA_CAPITAL && <button className="btn-agregar-fila" style={{ marginTop: 8 }} onClick={() => acc.abrirCambio(a.id)}>+ Registrar cambio a pesos</button>}
        </div>
      )}
    </div>
  )
})

function PanelCapital({ capitalMovimientos, capitalCambios, cotizacionesDolar, miembro, resumen: resumenPesos, resumenDolares, onGuardar, onActualizar, onEliminar, onGuardarCambio, onActualizarCambio, onEliminarCambio, onConsultarAporte }) {
  const [toast, showToast] = useToast()
  const [nuevo, setNuevo] = useState(null) // null | { tipo, aporteId? } — con aporteId, la devolución se abre dentro de ese aporte
  const [editandoId, setEditandoId] = useState(null)
  const [formCambio, setFormCambio] = useState(null) // null | { aporteId, cambioId } — cambioId null = cambio nuevo
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(null)
  const [confirmandoBorrarCambio, setConfirmandoBorrarCambio] = useState(null)
  const [confirmandoSaldar, setConfirmandoSaldar] = useState(null)
  // Borrar / dar por devuelto: el ref corta los clicks en ráfaga (el estado recién se ve en el
  // próximo render); el estado deshabilita los botones.
  const [enCurso, setEnCurso] = useState(false)
  const enCursoRef = useRef(false)

  const hoy = hoyISO()
  const cotHoy = cotizacionesDolar[0] || null
  const cotHoyVieja = String(cotHoy?.fuente || '').startsWith('fallback')
  const resumen = useMemo(() => resumenCapitalPorInversor(capitalMovimientos, hoy), [capitalMovimientos, hoy])
  const totales = moneda => resumen.filter(r => r.moneda === moneda).reduce((s, r) => ({
    aportado: s.aportado + r.aportado, devuelto: s.devuelto + r.devuelto, pendiente: s.pendiente + r.pendiente,
  }), { aportado: 0, devuelto: 0, pendiente: 0 })
  const monedas = ['ARS', ...(capitalMovimientos.some(c => c.moneda === 'USD') ? ['USD'] : [])]
  const inversores = useMemo(() => [...new Map([...MIEMBROS, ...capitalMovimientos.map(c => String(c.inversor || '').trim())].filter(Boolean).map(n => [normalizarTexto(n), n])).values()], [capitalMovimientos])

  // El más viejo arriba; cada aporte lleva adentro sus devoluciones y sus cambios a pesos. Se
  // agrupa una sola vez por aporte (no un filtro por tarjeta) y se recalcula solo si cambian los datos.
  const { aportes, datosDe, duenoDe, sueltas, sinCambiarUSD } = useMemo(() => {
    const agrupar = (lista, ok) => lista.reduce((m, x) => { if (ok(x)) { const k = String(x.aporte_id); m.set(k, [...(m.get(k) || []), x]) } return m }, new Map())
    const devs = agrupar(capitalMovimientos, c => c.tipo === 'devolucion' && c.aporte_id != null)
    const cams = agrupar(capitalCambios, () => true)
    const aportes = capitalMovimientos.filter(c => c.tipo === 'aporte').sort(porFechaCapital)
    const datosDe = new Map(), duenoDe = new Map() // duenoDe: "mov:<id>" / "cambio:<id>" → id del aporte
    aportes.forEach(a => {
      const k = String(a.id)
      const r = resumenAporte(a, devs.get(k) || [], hoy)
      datosDe.set(k, { r, rc: a.moneda === 'USD' ? resumenCambios(a, cams.get(k) || []) : null, devoluciones: [...r.devoluciones].sort(porFechaCapital) })
      duenoDe.set(`mov:${k}`, k)
      ;(devs.get(k) || []).forEach(d => duenoDe.set(`mov:${d.id}`, k))
      ;(cams.get(k) || []).forEach(c => duenoDe.set(`cambio:${c.id}`, k))
    })
    // La base exige que toda devolución tenga su aporte; si esta pantalla no lo tiene, la
    // devolución se muestra suelta igual, para no esconder plata.
    const sueltas = capitalMovimientos.filter(c => c.tipo === 'devolucion' && !datosDe.has(String(c.aporte_id))).sort(porFechaCapital)
    const sinCambiarUSD = aportes.reduce((s, a) => s + (datosDe.get(String(a.id)).rc?.sinCambiar || 0), 0)
    return { aportes, datosDe, duenoDe, sueltas, sinCambiarUSD }
  }, [capitalMovimientos, capitalCambios, hoy])

  // Un solo formulario o confirmación abierto a la vez.
  function cerrarTodo() { setNuevo(null); setEditandoId(null); setFormCambio(null); setConfirmandoBorrar(null); setConfirmandoBorrarCambio(null); setConfirmandoSaldar(null) }
  function cancelarConfirmacion() { setConfirmandoBorrar(null); setConfirmandoBorrarCambio(null); setConfirmandoSaldar(null) }
  async function guardarNuevo(mov) {
    const res = await onGuardar(mov)
    if (res?.ok) { setNuevo(null); showToast(mov.tipo === 'aporte' ? 'Aporte registrado ✓' : 'Devolución registrada ✓') }
    return res
  }
  async function guardarEdicion(id, mov) {
    const res = await onActualizar(id, mov)
    if (res?.ok) { setEditandoId(null); showToast('Movimiento actualizado ✓') }
    return res
  }
  async function guardarCambio(cambio) {
    const { aporteId, cambioId } = formCambio
    const res = cambioId ? await onActualizarCambio(cambioId, cambio) : await onGuardarCambio({ ...cambio, aporte_id: aporteId })
    if (res?.ok) { setFormCambio(null); showToast(cambioId ? 'Cambio actualizado ✓' : 'Cambio a pesos registrado ✓') }
    return res
  }
  async function conGuard(fn) {
    if (enCursoRef.current) return
    enCursoRef.current = true
    setEnCurso(true)
    try { await fn() } finally { enCursoRef.current = false; setEnCurso(false) }
  }
  const confirmarBorrar = id => conGuard(async () => {
    const res = await onEliminar(id)
    setConfirmandoBorrar(null)
    showToast(res?.ok ? 'Movimiento eliminado' : (res?.msg || 'No se pudo eliminar'))
  })
  const confirmarBorrarCambio = id => conGuard(async () => {
    const res = await onEliminarCambio(id)
    setConfirmandoBorrarCambio(null)
    showToast(res?.ok ? (res.yaNoEstaba ? 'Ese cambio ya lo había borrado otra persona' : 'Cambio eliminado') : (res?.msg || 'No se pudo eliminar'))
  })
  // "Dar por devuelto" a mano (cuando se cerró con otro número) y su vuelta atrás.
  const saldar = (c, dar) => conGuard(async () => {
    const res = await onActualizar(c.id, dar ? { saldado_en: new Date().toISOString(), saldado_por: miembro || null } : { saldado_en: null, saldado_por: null })
    setConfirmandoSaldar(null)
    showToast(res?.ok ? (dar ? 'Dado por devuelto ✓' : 'Vuelve a figurar como pendiente') : (res?.msg || 'No se pudo guardar'))
  })

  // Acciones con identidad fija para las tarjetas (memo): cada llamada va a la versión del último render.
  const acciones = {
    abrirNuevo: (tipo, aporte) => { cerrarTodo(); setNuevo({ tipo, aporteId: aporte?.id ?? null }) },
    abrirEdicion: id => { cerrarTodo(); setEditandoId(id) },
    abrirCambio: (aporteId, cambioId = null) => { cerrarTodo(); setFormCambio({ aporteId, cambioId }) },
    pedirBorrar: id => { cancelarConfirmacion(); setConfirmandoBorrar(id) },
    pedirBorrarCambio: id => { cancelarConfirmacion(); setConfirmandoBorrarCambio(id) },
    pedirSaldar: id => { cancelarConfirmacion(); setConfirmandoSaldar(id) },
    cancelarConfirmacion, guardarNuevo, guardarEdicion, guardarCambio, confirmarBorrar, confirmarBorrarCambio, saldar,
    cerrarNuevo: () => setNuevo(null), cerrarEdicion: () => setEditandoId(null), cerrarCambio: () => setFormCambio(null),
    cambioYaNoExiste: () => { setFormCambio(null); showToast('Ese cambio ya no existe: lo borró otra persona') },
  }
  const accionesRef = useRef(acciones)
  useLayoutEffect(() => { accionesRef.current = acciones })
  const acc = useMemo(() => Object.fromEntries(ACCIONES_CAPITAL.map(k => [k, (...args) => accionesRef.current[k](...args)])), [])
  const ctx = useMemo(() => ({ inversores, capitalMovimientos, capitalCambios, cotizacionesDolar, resumenPesos, resumenDolares, cotHoy, hoy, onConsultarAporte }),
    [inversores, capitalMovimientos, capitalCambios, cotizacionesDolar, resumenPesos, resumenDolares, cotHoy, hoy, onConsultarAporte])

  // A qué tarjeta pertenece cada form/confirmación abierto: las demás reciben null y no se redibujan.
  const dueno = clave => (clave == null ? null : duenoDe.get(clave) ?? null)
  const editandoEn = dueno(editandoId != null ? `mov:${editandoId}` : null)
  const borrarEn = dueno(confirmandoBorrar != null ? `mov:${confirmandoBorrar}` : null)
  const borrarCambioEn = dueno(confirmandoBorrarCambio != null ? `cambio:${confirmandoBorrarCambio}` : null)
  const cambioEn = formCambio ? String(formCambio.aporteId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {monedas.map(moneda => {
        const t = totales(moneda)
        const fmt = moneda === 'USD' ? formatDolares : formatPesos
        return (
          <div key={moneda}>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-num cifra-tabular" style={{ fontSize: 15, color: 'var(--green-dark)' }}>{fmt(t.aportado)}</div><div className="stat-lbl">Aportado{moneda === 'USD' ? ' (US$)' : ''}</div></div>
              <div className="stat-card"><div className="stat-num cifra-tabular" style={{ fontSize: 15 }}>{fmt(t.devuelto)}</div><div className="stat-lbl">Devuelto{moneda === 'USD' ? ' (US$)' : ''}</div></div>
              <div className="stat-card"><div className="stat-num cifra-tabular" style={{ fontSize: 15, color: t.pendiente > TOLERANCIA_CAPITAL ? '#791F1F' : undefined }}>{fmt(t.pendiente)}</div><div className="stat-lbl">Pendiente{moneda === 'USD' ? ' (US$)' : ''}</div></div>
            </div>
            {moneda === 'USD' && (
              <div className="cifra-tabular" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                <div className="kpi-sin-cambiar">Sin cambiar a pesos: <strong style={{ color: 'var(--text-primary)' }}>{formatDolares(sinCambiarUSD)}</strong></div>
                {cotHoy && t.pendiente > TOLERANCIA_CAPITAL && (
                  <div>
                    Pendiente ≈ {formatPesos(t.pendiente * cotHoy.promedio)} al blue promedio de hoy ({formatPesos(cotHoy.promedio)})
                    {cotHoyVieja && <span style={{ color: '#854F0B' }}> · sin actualizar hoy</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {resumen.length > 0 && (
        <div className="card resumen-capital">
          <div className="form-label" style={{ marginBottom: 10 }}>Por inversor</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resumen.map(r => {
              const fmt = r.moneda === 'USD' ? formatDolares : formatPesos
              return (
                <div key={`${r.inversor}|${r.moneda}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.inversor}{r.moneda === 'USD' ? ' · dólares' : ''}</span>
                    {r.pactado > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: r.pendiente > TOLERANCIA_CAPITAL ? '#791F1F' : 'var(--green-dark)' }}>
                        {r.pendiente > TOLERANCIA_CAPITAL ? `Pendiente ${fmt(r.pendiente)}` : 'Devuelto todo ✓'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Aportó {fmt(r.aportado)}{r.pactado > 0 ? ` · a devolver ${fmt(r.pactado)}` : ''}{r.devuelto > 0 ? ` · devuelto ${fmt(r.devuelto)}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {nuevo && !nuevo.aporteId
        ? formMovimientoCapital(ctx, vacioCapital(nuevo.tipo, null, hoy), { key: nuevo.tipo, onGuardar: acc.guardarNuevo, onCancelar: acc.cerrarNuevo })
        : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-agregar-fila" style={{ flex: 1 }} onClick={() => acc.abrirNuevo('aporte')}>+ Registrar aporte</button>
            <button className="btn-agregar-fila" style={{ flex: 1 }} onClick={() => acc.abrirNuevo('devolucion')}>+ Registrar devolución</button>
          </div>
        )}

      <div className="pedidos-list">
        {aportes.length === 0 && sueltas.length === 0 && <div className="empty-state">Todavía no hay aportes cargados.</div>}
        {aportes.map(a => {
          const k = String(a.id)
          return (
            <TarjetaAporte
              key={a.id} a={a} datos={datosDe.get(k)} acc={acc} ctx={ctx} enCurso={enCurso}
              editandoId={editandoEn === k ? editandoId : null}
              confirmandoBorrar={borrarEn === k ? confirmandoBorrar : null}
              confirmandoBorrarCambio={borrarCambioEn === k ? confirmandoBorrarCambio : null}
              confirmandoSaldar={confirmandoSaldar != null && String(confirmandoSaldar) === k}
              devolucionAbierta={nuevo?.aporteId != null && String(nuevo.aporteId) === k}
              cambioAbierto={cambioEn === k ? (formCambio.cambioId ?? 'nuevo') : null}
            />
          )
        })}
        {sueltas.length > 0 && (
          <div className="card devoluciones-sueltas">
            <div className="form-label">Devoluciones sin su aporte</div>
            {sueltas.map(d => (
              <FilaDevolucionCapital key={d.id} d={d} aporte={null} editando={editandoId === d.id} confirmando={confirmandoBorrar === d.id} enCurso={enCurso} acc={acc} ctx={ctx} />
            ))}
          </div>
        )}
      </div>
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function TabFinanzas({ pedidos, esquejes, insumos, miembro, gastos, presupuestos, setPresupuestos, aportes, setAportes, gastosFijos, setGastosFijos, pedidoPagos, esquejePagos, insumoPagos, cuentas, setCuentas, dolaresMovimientos, setDolaresMovimientos, cuentasValidaciones, setCuentasValidaciones, cotizacionesDolar, onActualizarCotizacion, resumen, resumenDolares, hallazgosFinanzas, onRevisar, capitalMovimientos, onGuardarCapital, onActualizarCapital, onEliminarCapital, capitalCambios, onGuardarCambioCapital, onActualizarCambioCapital, onEliminarCambioCapital, onConsultarAporte, duplicadosDescartados, onDescartarDuplicado, onRestaurarDuplicado }) {
  const [subTab, setSubTab] = useState('general')
  const [editandoSaldo, setEditandoSaldo] = useState(null)
  const [inputSaldo, setInputSaldo] = useState('')
  const [inputCorte, setInputCorte] = useState('')
  const [guardandoSaldo, setGuardandoSaldo] = useState(false)
  const [verDetalleCuentas, setVerDetalleCuentas] = useState(false)
  const [verDetalleDolares, setVerDetalleDolares] = useState(false)
  const [verPresupuestosGeneral, setVerPresupuestosGeneral] = useState(false)
  const [alertasAbiertas, setAlertasAbiertas] = useState(new Set())
  const [verDescartados, setVerDescartados] = useState(false)
  const [descartando, setDescartando] = useState(null) // clave en curso (guard de doble click)
  const [toast, showToast] = useToast()

  // Por clave estable (no por índice): al descartar un duplicado la lista se corre y, por
  // índice, quedaría abierta la alerta de al lado sin que nadie la haya tocado.
  const claveHallazgo = h => h.descartar || `${h.titulo}|${h.mensaje}`
  function toggleAlerta(k) {
    setAlertasAbiertas(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  // Un "Revisar" que apunta a otra sub-pestaña de Finanzas (ej. un movimiento de Capital) se
  // resuelve acá adentro; el resto sale a la pestaña correspondiente como siempre.
  function revisar(objetivo) {
    if (objetivo?.tab === 'finanzas') { setSubTab(objetivo.subTab || 'general'); return }
    onRevisar(objetivo)
  }

  async function marcarNoDuplicado(clave) {
    if (descartando) return
    setDescartando(clave)
    const res = await onDescartarDuplicado(clave)
    setDescartando(null)
    showToast(res?.ok ? 'Marcado como no duplicado ✓' : 'No se pudo guardar. Probá de nuevo.')
  }

  async function volverARevisar(clave) {
    if (descartando) return
    setDescartando(clave)
    const res = await onRestaurarDuplicado(clave)
    setDescartando(null)
    showToast(res?.ok ? 'Vuelve a aparecer en Registros a revisar' : 'No se pudo guardar. Probá de nuevo.')
  }

  const totalGeneral = resumen.reduce((s, r) => s + r.saldo, 0)

  // Presupuestos activos (no cerrados) de ambas locaciones, para los KPIs generales.
  // "Asignado" es un compromiso de gasto planeado — aportar capital a un presupuesto no
  // mueve plata de ninguna cuenta (aportarCapital solo inserta en presupuesto_aportes),
  // así que no se puede restar el asignado completo del total de cuentas sin contar dos
  // veces lo que ya se gastó (eso sí bajó las cuentas, vía los gastos vinculados).
  const presupuestosActivosGeneral = useMemo(() => presupuestos.filter(p => !p.cerrado), [presupuestos])
  // KPIs de "ahora mismo": un presupuesto en USD se convierte a pesos con la cotización de HOY
  // antes de sumarlo al total general — mezclar montos crudos de distinta moneda daría un
  // número sin sentido. Distinto del "gastado" de cada presupuesto puntual (gastoDePresupuesto),
  // que usa la cotización del día de cada gasto, no la de hoy.
  const cotizacionHoy = cotizacionesDolar[0] || null
  const totalPresupuestosAsignados = useMemo(
    () => presupuestosActivosGeneral.reduce((s, p) => s + valorEnPesos(totalAsignado(p, aportes), p.moneda, cotizacionHoy), 0),
    [presupuestosActivosGeneral, aportes, cotizacionHoy]
  )
  const totalPresupuestosRestante = useMemo(
    () => presupuestosActivosGeneral.reduce((s, p) => s + valorEnPesos(totalAsignado(p, aportes) - gastoDePresupuesto(p, gastos, cotizacionesDolar), p.moneda, cotizacionHoy), 0),
    [presupuestosActivosGeneral, aportes, gastos, cotizacionesDolar, cotizacionHoy]
  )
  const balanceTrasPresupuestos = totalGeneral - totalPresupuestosRestante

  // Presupuestos activos con fecha límite dentro de los próximos 7 días y todavía con
  // saldo por gastar — alerta informativa de vencimiento próximo.
  const presupuestosPorVencer = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    return presupuestosActivosGeneral
      .map(p => {
        const restante = totalAsignado(p, aportes) - gastoDePresupuesto(p, gastos, cotizacionesDolar)
        if (!p.fecha_limite || restante <= 0) return null
        const [y, m, d] = p.fecha_limite.split('-').map(Number)
        const limite = new Date(y, m - 1, d)
        const dias = Math.round((limite - hoy) / 86400000)
        if (dias < 0 || dias > 7) return null
        return { p, restante: valorEnPesos(restante, p.moneda, cotizacionHoy), dias }
      })
      .filter(Boolean)
      .sort((a, b) => a.dias - b.dias)
  }, [presupuestosActivosGeneral, aportes, gastos, cotizacionesDolar, cotizacionHoy])
  const totalRestantePorVencer = presupuestosPorVencer.reduce((s, x) => s + x.restante, 0)
  const faltaCobertura = totalRestantePorVencer - totalGeneral

  const totalDolares = resumenDolares.reduce((s, r) => s + r.saldo, 0)

  // Ancla el saldo Y deja una fila en cuentas_validaciones (lo que el sistema calculaba justo
  // antes vs. lo que se cargó como real) en una sola transacción de base de datos (RPC
  // `registrar_validacion_saldo`) — las dos escrituras se hacían antes como dos requests
  // separadas sin chequear la segunda, así que un fallo en el insert del historial podía
  // pasar desapercibido con la cuenta ya actualizada y un toast de "éxito" engañoso.
  async function actualizarSaldoCuenta(nombre, valorStr, corteStr) {
    const valor = parseFloat(valorStr)
    if (isNaN(valor)) { showToast('Ingresá un número válido'); return }
    if (!corteStr) { showToast('Elegí una fecha de corte'); return }
    const existente = cuentas.find(c => c.nombre === nombre)
    const previa = resumen.find(r => r.nombre === nombre) || resumenDolares.find(r => r.nombre === nombre)
    const saldoCalculado = previa ? previa.saldo : 0
    const { data, error } = await supabase.rpc('registrar_validacion_saldo', {
      p_nombre: nombre,
      p_moneda: CUENTAS_DOLARES.includes(nombre) ? 'USD' : 'ARS',
      p_fecha_corte_anterior: existente?.fecha_corte || null,
      p_fecha_corte_nueva: corteStr,
      p_saldo_calculado: saldoCalculado,
      p_saldo_validado: valor,
      p_validado_por: miembro || null,
    })
    if (error || !data) { showToast('Error al guardar'); return }
    setCuentasValidaciones(prev => [data, ...prev])
    setCuentas(prev => {
      const nuevaFila = { nombre, saldo_inicial: valor, fecha_corte: corteStr, validado: true, actualizado_por: miembro || null, actualizado_en: data.created_at }
      return existente ? prev.map(c => c.nombre === nombre ? { ...c, ...nuevaFila } : c) : [...prev, nuevaFila]
    })
    showToast('Saldo inicial validado ✓')
  }

  // Corrige un error de tipeo en la ÚLTIMA validación de una cuenta (la única editable — es
  // la que ancla el saldo actual). No genera un evento nuevo como actualizarSaldoCuenta: pisa
  // los datos de esa fila y deja editado_por/editado_en como rastro, mismo patrón que
  // actualizado_por/actualizado_en en el resto de la app. Misma razón que arriba para usar un
  // RPC (`corregir_validacion_saldo`): las dos escrituras (historial + ancla) tienen que ser
  // atómicas, si no el saldo mostrado puede quedar desincronizado del historial sin ningún aviso.
  async function corregirValidacion(fila, valorStr, fechaStr) {
    const valor = parseFloat(valorStr)
    if (isNaN(valor)) { showToast('Ingresá un número válido'); return }
    if (!fechaStr) { showToast('Elegí una fecha de corte'); return }
    const { data, error } = await supabase.rpc('corregir_validacion_saldo', {
      p_id: fila.id, p_saldo_validado: valor, p_fecha_corte_nueva: fechaStr, p_editado_por: miembro || null,
    })
    if (error || !data) { showToast('Error al guardar'); return }
    setCuentasValidaciones(prev => prev.map(v => v.id === fila.id ? { ...v, ...data } : v))
    setCuentas(prev => prev.map(c => c.nombre === fila.cuenta ? { ...c, saldo_inicial: valor, fecha_corte: fechaStr, actualizado_por: miembro || null, actualizado_en: data.editado_en } : c))
    showToast('Validación corregida ✓')
  }

  async function guardarSaldoInicial(nombre) {
    if (guardandoSaldo) return
    setGuardandoSaldo(true)
    await actualizarSaldoCuenta(nombre, inputSaldo, inputCorte)
    setGuardandoSaldo(false)
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

  // El guard de doble-submit vive en DisclosureMovimientosCuenta (mismo patrón que
  // corregirValidacion), no hace falta duplicarlo acá.
  async function editarMovimientoDolares(id, cambios) {
    const { error } = await supabase.from('dolares_movimientos').update(cambios).eq('id', id)
    if (!error) { setDolaresMovimientos(prev => prev.map(m => m.id === id ? { ...m, ...cambios } : m)); showToast('Movimiento actualizado ✓') }
    else showToast('Error al guardar')
  }

  // Punto de color en la pestaña de una locación cuando tiene presupuesto activo —
  // rojo si alguno está Agotado/Vencido, verde si están bien, nada si no hay ninguno.
  function colorPresupuestoLocacion(locacion) {
    const activos = presupuestos.filter(p => p.locacion === locacion && !p.cerrado)
    if (activos.length === 0) return null
    const hayProblema = activos.some(p => {
      const estado = estadoPresupuesto(p, gastos, aportes, cotizacionesDolar)
      return estado === 'Agotado' || estado === 'Vencido'
    })
    return hayProblema ? '#791F1F' : 'var(--green-dark)'
  }

  return (
    <div className="content">
      <div className="miembro-row" style={{ marginBottom: 14 }}>
        {['general', 'Hormi 1.0', 'Hormi 2.0', 'capital'].map(st => {
          const colorPunto = st.startsWith('Hormi') ? colorPresupuestoLocacion(st) : null
          return (
            <button key={st} className={`miembro-btn${subTab === st ? ' active' : ''}`} onClick={() => setSubTab(st)}>
              {st === 'general' ? 'General' : st === 'capital' ? 'Capital' : st}
              {colorPunto && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colorPunto, marginLeft: 6 }} />}
            </button>
          )
        })}
      </div>
      {subTab === 'capital' && (
        <PanelCapital
          capitalMovimientos={capitalMovimientos} capitalCambios={capitalCambios} cotizacionesDolar={cotizacionesDolar} miembro={miembro} resumen={resumen} resumenDolares={resumenDolares}
          onGuardar={onGuardarCapital} onActualizar={onActualizarCapital} onEliminar={onEliminarCapital}
          onGuardarCambio={onGuardarCambioCapital} onActualizarCambio={onActualizarCambioCapital} onEliminarCambio={onEliminarCambioCapital} onConsultarAporte={onConsultarAporte}
        />
      )}
      {subTab.startsWith('Hormi') && (
        <PanelFinanzasHormi locacion={subTab} pedidos={pedidos} esquejes={esquejes} gastos={gastos} presupuestos={presupuestos} setPresupuestos={setPresupuestos} aportes={aportes} setAportes={setAportes} gastosFijos={gastosFijos} setGastosFijos={setGastosFijos} totalCuentas={totalGeneral} miembro={miembro} pedidoPagos={pedidoPagos} esquejePagos={esquejePagos} cotizacionesDolar={cotizacionesDolar} />
      )}
      {subTab === 'general' && (
      <>
      <div className="stats-row-2x2">
        <div className="stat-card">
          <Wallet size={16} color={totalGeneral < 0 ? '#791F1F' : '#1D9E75'} style={{ marginBottom: 4 }} />
          <div className="stat-num" style={{ fontSize: 16, color: totalGeneral < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(totalGeneral)}</div>
          <div className="stat-lbl">Total todas las cuentas</div>
        </div>
        <div className="stat-card">
          <Target size={16} color="#7B4F9E" style={{ marginBottom: 4 }} />
          <div className="stat-num" style={{ fontSize: 16, color: '#7B4F9E' }}>{formatPesos(totalPresupuestosAsignados)}</div>
          <div className="stat-lbl">Presupuestos asignados</div>
        </div>
        <div className="stat-card">
          <Wallet size={16} color={balanceTrasPresupuestos < 0 ? '#791F1F' : '#1D9E75'} style={{ marginBottom: 4 }} />
          <div className="stat-num" style={{ fontSize: 16, color: balanceTrasPresupuestos < 0 ? '#791F1F' : 'var(--green-dark)' }}>{formatPesos(balanceTrasPresupuestos)}</div>
          <div className="stat-lbl">Balance tras presupuestos</div>
        </div>
        <div className="stat-card">
          <Landmark size={16} color={totalDolares < 0 ? '#791F1F' : '#33538F'} style={{ marginBottom: 4 }} />
          <div className="cifra-tabular stat-num" style={{ fontSize: 16, color: totalDolares < 0 ? '#791F1F' : '#33538F' }}>{formatDolares(totalDolares)}</div>
          <div className="stat-lbl">Ahorro en dólares</div>
        </div>
      </div>
      {cotizacionesDolar[0] && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>
            Dólar blue ({formatFechaDateISO(cotizacionesDolar[0].fecha)}): compra {formatPesos(cotizacionesDolar[0].compra)} · venta {formatPesos(cotizacionesDolar[0].venta)} · promedio {formatPesos(cotizacionesDolar[0].promedio)}
            {String(cotizacionesDolar[0].fuente || '').startsWith('fallback') && <span style={{ color: '#854F0B' }}> · sin actualizar hoy</span>}
          </span>
          <button onClick={onActualizarCotizacion} style={btnLinkStyle('var(--green-dark)')}>Actualizar</button>
        </div>
      )}
      {presupuestosPorVencer.length > 0 && (
        <div className="card" style={{ marginTop: 14, background: '#FFF8ED', borderColor: '#E8C77E' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Target size={15} color="#854F0B" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.5 }}>
              <strong>Presupuestos por vencer</strong>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {presupuestosPorVencer.map(({ p, restante, dias }) => (
              <div key={p.id} style={{ fontSize: 12, color: '#854F0B', paddingTop: 8, borderTop: '0.5px solid #E8C77E' }}>
                {dias === 0 ? 'Hoy vence' : dias === 1 ? 'Mañana vence' : `En ${dias} días vence`} <strong>{p.nombre}</strong> ({p.locacion}) · quedan {formatPesos(restante)} por gastar
              </div>
            ))}
          </div>
        </div>
      )}
      {faltaCobertura > 0 && (
        <div className="card" style={{ marginTop: 14, background: '#FCEBEB', borderColor: '#791F1F' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <TriangleAlert size={15} color="#791F1F" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#791F1F', lineHeight: 1.5 }}>
              <strong>Atención:</strong> las cuentas no alcanzan para cubrir los presupuestos que vencen pronto. Tenés {formatPesos(totalGeneral)} y hacen falta {formatPesos(totalRestantePorVencer)} (faltan {formatPesos(faltaCobertura)}).
            </div>
          </div>
        </div>
      )}
      {(() => {
        const hayError = hallazgosFinanzas.some(h => h.severidad === 'error')
        const hayAlgo = hallazgosFinanzas.length > 0
        const colorFondo = hayError ? '#FCEBEB' : hayAlgo ? '#FFF8ED' : 'var(--bg-card)'
        const colorBorde = hayError ? '#791F1F' : hayAlgo ? '#E8C77E' : 'var(--border)'
        const colorTitulo = hayError ? '#791F1F' : '#854F0B'
        return (
          <div className="card" style={{ marginTop: 14, background: colorFondo, borderColor: colorBorde }}>
            {hayAlgo ? (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <TriangleAlert size={15} color={colorTitulo} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: colorTitulo, lineHeight: 1.5 }}>
                    <strong>Registros a revisar</strong> · {hallazgosFinanzas.length}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 10 }}>
                  {hallazgosFinanzas.map((h, i) => {
                    const color = h.severidad === 'error' ? '#791F1F' : '#854F0B'
                    const k = claveHallazgo(h)
                    const abierta = alertasAbiertas.has(k)
                    return (
                      <div key={k} className="alerta-finanzas" style={{ paddingTop: 8, marginTop: i === 0 ? 0 : 6, borderTop: `0.5px solid ${h.severidad === 'error' ? '#e8b4b4' : '#E8C77E'}` }}>
                        <div onClick={() => toggleAlerta(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <span style={{ fontSize: 12, color }}><strong>{h.responsable}</strong> · {h.titulo}</span>
                          {abierta ? <ChevronUp size={14} color={color} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} color={color} style={{ flexShrink: 0 }} />}
                        </div>
                        {abierta && (
                          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color }}>{h.mensaje}</span>
                            {(h.objetivo || h.descartar) && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                                {h.objetivo && <button onClick={() => revisar(h.objetivo)} style={btnLinkStyle(color)}>Revisar</button>}
                                {h.descartar && (
                                  <button onClick={() => marcarNoDuplicado(h.descartar)} disabled={!!descartando} style={{ ...btnLinkStyle('var(--text-secondary)'), whiteSpace: 'nowrap', opacity: descartando === h.descartar ? 0.5 : 1 }}>
                                    No es duplicado
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Registros a revisar</strong> · Sin registros a validar.
              </div>
            )}
            {/* Lo marcado "No es duplicado" se puede deshacer: si alguien se equivocó, vuelve a la lista. */}
            {duplicadosDescartados.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
                <button onClick={() => setVerDescartados(v => !v)} style={{ ...btnLinkStyle('var(--text-secondary)'), display: 'flex', alignItems: 'center', gap: 4 }}>
                  Marcados como no duplicados ({duplicadosDescartados.length}) {verDescartados ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {verDescartados && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {duplicadosDescartados.map(d => (
                      <div key={d.clave} className="fila-descartado" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          {describirDescartado(d.clave, { gastos, pedidos, esquejes, insumos, pedidoPagos, esquejePagos, insumoPagos, capitalMovimientos, capitalCambios }, { pesos: formatPesos, dolares: formatDolares, fechaISO: formatFechaISOSinAnio })}
                          {d.descartado_por ? ` · lo marcó ${d.descartado_por}` : ''}
                        </span>
                        <button onClick={() => volverARevisar(d.clave)} disabled={!!descartando} style={{ ...btnLinkStyle('var(--green-dark)'), fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>Volver a revisar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
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
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Calculado por el sistema: <strong>{formatPesos(r.saldo)}</strong> — pisalo con lo que contaste real.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <InputMonto placeholder="Saldo real validado" value={inputSaldo} onChange={setInputSaldo} permiteNegativo style={{ flex: 1 }} />
                  <input className="form-control" type="date" value={inputCorte} onChange={e => setInputCorte(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Desde esta fecha se cuentan los movimientos nuevos — todo lo anterior queda afuera del saldo (sigue disponible en Pedidos/Gastos).
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-submit" style={{ width: 'auto', padding: '0 14px' }} onClick={() => guardarSaldoInicial(r.nombre)} disabled={guardandoSaldo}>Guardar</button>
                  <button onClick={() => { setEditandoSaldo(null); setInputSaldo(''); setInputCorte('') }} style={{ padding: '0 12px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setEditandoSaldo(r.nombre); setInputSaldo(String(r.saldo ?? 0)); setInputCorte(hoyISO()) }} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--green-dark)', fontWeight: 500, cursor: 'pointer' }}>
                Validar saldo real
              </button>
            )}
            <DisclosureMovimientosCuenta
              movimientos={movimientosDeCuenta(r.nombre, { pedidoPagos, pedidos, esquejePagos, esquejes, insumoPagos, insumos, gastos, dolaresMovimientos, cuentasValidaciones, capitalMovimientos, capitalCambios, esDolar: false })}
              formatMonto={formatPesos} onRevisar={revisar} onEditarValidacion={corregirValidacion}
            />
          </div>
        ))}
      </div>
      )}
      <button className="btn-disclosure" onClick={() => setVerDetalleDolares(v => !v)}>
        <span>{verDetalleDolares ? 'Ocultar cuentas en dólares' : `Ver detalle cuentas en dólares (${resumenDolares.length})`}</span>
        {verDetalleDolares ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {verDetalleDolares && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {resumenDolares.map(r => (
          <TarjetaCuentaDolar
            key={r.nombre}
            r={r}
            movimientos={movimientosDeCuenta(r.nombre, { pedidoPagos, pedidos, esquejePagos, esquejes, insumoPagos, insumos, gastos, dolaresMovimientos, cuentasValidaciones, capitalMovimientos, capitalCambios, esDolar: true })}
            onValidarSaldo={actualizarSaldoCuenta}
            onEditarValidacion={corregirValidacion}
            onAgregarMovimiento={agregarMovimientoDolares}
            onEditarMovimientoDolar={editarMovimientoDolares}
            onEliminarMovimiento={eliminarMovimientoDolares}
            onRevisar={revisar}
          />
        ))}
      </div>
      )}
      {presupuestosActivosGeneral.length > 0 && (
        <div>
          <button className="btn-disclosure" onClick={() => setVerPresupuestosGeneral(v => !v)}>
            <span>{verPresupuestosGeneral ? 'Ocultar presupuestos activos' : `Ver presupuestos activos (${presupuestosActivosGeneral.length})`}</span>
            {verPresupuestosGeneral ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {verPresupuestosGeneral && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {presupuestosActivosGeneral.map(p => (
              <TarjetaPresupuesto key={p.id} p={p} gastos={gastos} aportes={aportes} cotizaciones={cotizacionesDolar} mostrarLocacion />
            ))}
          </div>
          )}
        </div>
      )}
      </div>
      </>
      )}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

function PanelFinanzasHormi({ locacion, pedidos, esquejes, gastos, presupuestos, setPresupuestos, aportes, setAportes, gastosFijos, setGastosFijos, totalCuentas, miembro, pedidoPagos, esquejePagos, cotizacionesDolar }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', monto_asignado: '', fecha_asignacion: hoyISO(), fecha_limite: '', moneda: 'ARS', descripcion: '' })
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
    if (contarPalabras(form.descripcion) > MAX_PALABRAS_PRESUPUESTO) {
      showToast(`La descripción no puede superar las ${MAX_PALABRAS_PRESUPUESTO} palabras`)
      return
    }
    const nuevoPresupuesto = {
      nombre: form.nombre.trim(),
      locacion,
      monto_asignado: parseFloat(form.monto_asignado),
      fecha_asignacion: form.fecha_asignacion || hoyISO(),
      fecha_limite: form.fecha_limite || null,
      moneda: form.moneda,
      descripcion: form.descripcion.trim() || null,
      creado_por: miembro || null,
    }
    const { data, error } = await supabase.from('presupuestos').insert(nuevoPresupuesto).select().single()
    if (!error && data) {
      setPresupuestos(prev => [data, ...prev])
      setForm({ nombre: '', monto_asignado: '', fecha_asignacion: hoyISO(), fecha_limite: '', moneda: 'ARS', descripcion: '' })
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
    if (!error && data) { setAportes(prev => [data, ...prev]); showToast('Presupuesto ampliado ✓') }
    else showToast('Error al guardar')
  }

  async function eliminarAporte(id) {
    const { error } = await supabase.from('presupuesto_aportes').delete().eq('id', id)
    if (!error) setAportes(prev => prev.filter(a => a.id !== id))
    else showToast('Error al eliminar')
  }

  async function editarPresupuesto(p, { nombre, fecha_limite, descripcion }) {
    const { error } = await supabase.from('presupuestos').update({ nombre, fecha_limite, descripcion }).eq('id', p.id)
    if (!error) setPresupuestos(prev => prev.map(x => x.id === p.id ? { ...x, nombre, fecha_limite, descripcion } : x))
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
              <label className="form-label">Moneda</label>
              <div className="miembro-row" style={{ marginBottom: 0 }}>
                {['ARS', 'USD'].map(m => (
                  <button type="button" key={m} className={`miembro-btn${form.moneda === m ? ' active' : ''}`} onClick={() => setForm(f => ({ ...f, moneda: m }))}>{m === 'ARS' ? 'Pesos' : 'Dólares'}</button>
                ))}
              </div>
              {form.moneda === 'USD' && cotizacionesDolar[0] && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Dólar blue hoy: compra {formatPesos(cotizacionesDolar[0].compra)} · venta {formatPesos(cotizacionesDolar[0].venta)} · promedio {formatPesos(cotizacionesDolar[0].promedio)}
                </div>
              )}
            </div>
            <div className="form-group full">
              <label className="form-label">Nombre / proyecto</label>
              <input className="form-control" type="text" placeholder="Ej: LED" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="form-group full">
              <label className="form-label">
                Descripción breve (opcional){contarPalabras(form.descripcion) > MAX_PALABRAS_PRESUPUESTO && <span style={{ color: '#791F1F' }}> · máximo {MAX_PALABRAS_PRESUPUESTO} palabras</span>}
              </label>
              <input
                className="form-control" type="text" placeholder="Ej: inyección en dólares para el terreno de Hormi 2.0"
                value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                style={contarPalabras(form.descripcion) > MAX_PALABRAS_PRESUPUESTO ? { borderColor: '#791F1F' } : undefined}
              />
              <div style={{ fontSize: 11, color: contarPalabras(form.descripcion) > MAX_PALABRAS_PRESUPUESTO ? '#791F1F' : 'var(--text-secondary)', textAlign: 'right' }}>{contarPalabras(form.descripcion)}/{MAX_PALABRAS_PRESUPUESTO} palabras</div>
            </div>
            <div className="form-group">
              <label className="form-label">Monto asignado ({form.moneda === 'USD' ? 'US$' : '$'})</label>
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
            <button className="btn-submit" onClick={guardarPresupuesto} style={{ flex: 1 }} disabled={contarPalabras(form.descripcion) > MAX_PALABRAS_PRESUPUESTO}>Guardar presupuesto</button>
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
              <TarjetaPresupuesto key={p.id} p={p} gastos={gastos} aportes={aportes} cotizaciones={cotizacionesDolar} onAlternarCerrado={alternarCerrado} onAportar={aportarCapital} onEliminarAporte={eliminarAporte} onEditar={editarPresupuesto} />
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
  // El objetivo de "Revisar" (desde Finanzas) se usa una sola vez: si no, al volver a
  // esa locación se reabriría solo el modal del gasto.
  const [objetivo, setObjetivo] = useState(target)
  const gastosFiltrados = gastos.filter(g => g.locacion === locacion)
  return (
    <div className="content">
      <div className="miembro-row">
        {['Hormi 1.0', 'Hormi 2.0'].map(loc => (
          <button key={loc} className={`miembro-btn${locacion === loc ? ' active' : ''}`} onClick={() => { setLocacion(loc); setObjetivo(null) }}>{loc}</button>
        ))}
      </div>
      {/* key={locacion}: cada Hormi arranca con el formulario vacío. Sin esto, un gasto a medio
          cargar (con su presupuesto) viajaba a la otra locación — así pasó con el gasto 449. */}
      <PanelGastos
        key={locacion}
        locacion={locacion}
        gastos={gastosFiltrados}
        miembro={miembro}
        presupuestos={presupuestos}
        onNuevoGasto={onGuardarGasto}
        onActualizarGasto={onActualizarGasto}
        onEliminarGasto={onEliminarGasto}
        target={objetivo}
      />
    </div>
  )
}

// ─── Tab Stock (insumos de cultivo) ────────────────────────────
function TabStock({ insumosStock, insumosStockMovimientos, onAgregarItem, onEliminarItem, onEditarMinimo, onEditarActual, onRegistrarMovimiento }) {
  const [categoria, setCategoria] = useState(CATEGORIAS_STOCK_INSUMOS[0])
  const items = insumosStock.filter(i => i.categoria === categoria)
  const conteoPorCategoria = {}
  insumosStock.forEach(i => { conteoPorCategoria[i.categoria] = (conteoPorCategoria[i.categoria] || 0) + 1 })
  return (
    <div className="content">
      {/* 7 categorías: mismo criterio que el filtro de Gastos (10 categorías) — un
          select, no una fila de pills, que a partir de ~5 opciones rompe en varias líneas. */}
      <select className="form-control" value={categoria} onChange={e => setCategoria(e.target.value)}>
        {CATEGORIAS_STOCK_INSUMOS.map(c => (
          <option key={c} value={c}>{c} ({conteoPorCategoria[c] || 0})</option>
        ))}
      </select>
      <PanelInsumosStock
        categoria={categoria}
        items={items}
        movimientos={insumosStockMovimientos}
        onAgregarItem={onAgregarItem}
        onEliminarItem={onEliminarItem}
        onEditarMinimo={onEditarMinimo}
        onEditarActual={onEditarActual}
        onRegistrarMovimiento={onRegistrarMovimiento}
      />
    </div>
  )
}

function PanelInsumosStock({ categoria, items, movimientos, onAgregarItem, onEliminarItem, onEditarMinimo, onEditarActual, onRegistrarMovimiento }) {
  const [toast, showToast] = useToast()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaUnidad, setNuevaUnidad] = useState('unidad')
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(null)
  const [movimientoAbierto, setMovimientoAbierto] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(null)

  async function guardarMinimo(item, nuevoValor) {
    const res = await onEditarMinimo(item.id, nuevoValor)
    showToast(res?.ok === false ? `No se pudo actualizar el mínimo de ${item.nombre}` : `${item.nombre}: mínimo actualizado`)
  }
  async function guardarActual(item, nuevoValor) {
    const res = await onEditarActual(item, nuevoValor)
    showToast(res?.ok === false ? `No se pudo actualizar ${item.nombre}` : `${item.nombre}: stock actualizado`)
  }
  function pedirBorrar(item) {
    if ((item.stock_actual ?? 0) !== 0) {
      showToast(`No se puede borrar ${item.nombre}: todavía tiene ${item.stock_actual}${item.unidad} en stock. Llevalo a 0 primero.`)
      return
    }
    setConfirmandoBorrar(item.id)
  }
  async function confirmarBorrar(item) {
    const res = await onEliminarItem(item)
    showToast(res?.ok === false ? `No se pudo borrar ${item.nombre}` : `${item.nombre}: eliminado del catálogo`)
    setConfirmandoBorrar(null)
  }
  async function agregar() {
    const limpio = nuevoNombre.trim()
    if (!limpio) return
    const res = await onAgregarItem(categoria, limpio, nuevaUnidad.trim() || 'unidad')
    if (res?.ok === false) {
      showToast(res.error === 'duplicado' ? `Ya existe ${limpio} en el catálogo` : `No se pudo agregar ${limpio}`)
      return
    }
    setNuevoNombre('')
    showToast(`${limpio}: agregado al catálogo`)
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingBottom: 12 }}>Sin ítems en {categoria} todavía.</div>
          )}
          {items.map((item, i) => {
            const actual = item.stock_actual ?? 0
            const minimo = item.stock_minimo ?? 0
            const color = actual === 0 ? '#791F1F' : actual < minimo ? '#854F0B' : 'var(--green-dark)'
            const compras = movimientos.filter(m => m.insumo_id === item.id && m.tipo === 'compra').sort((a, b) => a.fecha.localeCompare(b.fecha))
            const frecuenciaTexto = frecuenciaCompra(compras)
            const historialItem = movimientos.filter(m => m.insumo_id === item.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8)
            const expandido = movimientoAbierto === item.id || historialAbierto === item.id || confirmandoBorrar === item.id
            return (
              // Cada ítem es autocontenido (nombre + sus dos números + sus acciones), separado
              // por un divisor — nada depende de un header compartido más arriba en la lista,
              // así nombres largos multilínea no desalinean nada del resto de la fila.
              <div key={item.id} style={{ padding: '14px 0', borderBottom: i < items.length - 1 || expandido ? '0.5px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <button className="btn-eliminar-fila" style={{ width: 22, height: 22, fontSize: 10, marginTop: 2, flexShrink: 0 }} title={`Borrar ${item.nombre} del catálogo`} onClick={() => pedirBorrar(item)}>✕</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>{item.nombre}</div>
                    {frecuenciaTexto && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{frecuenciaTexto}</div>}

                    <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
                      <div>
                        <div className="form-label" style={{ marginBottom: 4 }}>Mínimo</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <CampoStockEditable valor={minimo} color="var(--text-secondary)" onGuardar={v => guardarMinimo(item, v)} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.unidad}</span>
                        </div>
                      </div>
                      <div>
                        <div className="form-label" style={{ marginBottom: 4 }}>Actual</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <CampoStockEditable valor={actual} color={color} onGuardar={v => guardarActual(item, v)} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.unidad}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                      <button onClick={() => setMovimientoAbierto(movimientoAbierto === item.id ? null : item.id)} style={btnLinkStyle('var(--green-dark)')}>
                        {movimientoAbierto === item.id ? 'Cancelar' : '+ Registrar movimiento'}
                      </button>
                      {historialItem.length > 0 && (
                        <button onClick={() => setHistorialAbierto(historialAbierto === item.id ? null : item.id)} style={btnLinkStyle('var(--text-secondary)')}>
                          {historialAbierto === item.id ? 'Ocultar historial' : 'Ver historial'}
                        </button>
                      )}
                    </div>

                    {movimientoAbierto === item.id && (
                      <div style={{ marginTop: 10, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <MovimientoInsumoForm
                          item={item}
                          onGuardar={async payload => {
                            const res = await onRegistrarMovimiento({ insumo: item, ...payload })
                            if (res?.ok !== false) { setMovimientoAbierto(null); showToast('Movimiento registrado ✓') }
                            return res
                          }}
                          onCancelar={() => setMovimientoAbierto(null)}
                        />
                      </div>
                    )}
                    {historialAbierto === item.id && (
                      <div style={{ marginTop: 10, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {historialItem.map(m => (
                          <div key={m.id} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {formatFechaISOCorta(m.fecha)} · {LABEL_TIPO_MOVIMIENTO[m.tipo]} · <strong style={{ color: 'var(--text-primary)' }}>{m.tipo === 'ajuste' && m.cantidad > 0 ? '+' : ''}{m.cantidad}{item.unidad}</strong>
                            {m.precio_unitario ? ` · ${formatPesos(m.precio_unitario)}/${item.unidad}` : ''}
                            {m.miembro ? ` · ${m.miembro}` : ''}
                            {m.nota ? ` · ${m.nota}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                    {confirmandoBorrar === item.id && (
                      <div style={{ marginTop: 10, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#791F1F', flex: 1 }}>¿Borrar {item.nombre} del catálogo?</span>
                        <button onClick={() => confirmarBorrar(item)} style={{ padding: '6px 10px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sí, borrar</button>
                        <button onClick={() => setConfirmandoBorrar(null)} style={{ padding: '6px 10px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
          <input className="form-control" type="text" placeholder="Nuevo insumo..." value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()} style={{ flex: 2.2 }} />
          <input className="form-control" type="text" placeholder="Unidad" value={nuevaUnidad} onChange={e => setNuevaUnidad(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-submit" style={{ width: 'auto', padding: '0 14px', whiteSpace: 'nowrap' }} onClick={agregar}>+ Agregar</button>
        </div>
      </div>
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

// ─── Tareas: pestaña de anotaciones/pendientes del equipo ───────────────────
// Igual que Gastos: cada Hormi tiene sus propias tareas, separadas por un picker
// arriba (no hay un "general" compartido para tareas, todas pertenecen a una locación).
function TabTareas({ tareas, tareasTipos, onAgregarTarea, onMarcarEstado, onEliminarTarea, onAgregarTipo, onEliminarTipo, onEditarTarea }) {
  const [locacion, setLocacion] = useState('Hormi 1.0')
  const tareasFiltradas = tareas.filter(t => t.locacion === locacion)
  return (
    <div className="content">
      <div className="miembro-row">
        {['Hormi 1.0', 'Hormi 2.0'].map(loc => (
          <button key={loc} className={`miembro-btn${locacion === loc ? ' active' : ''}`} onClick={() => setLocacion(loc)}>{loc}</button>
        ))}
      </div>
      <PanelTareas
        locacion={locacion}
        tareas={tareasFiltradas}
        tareasTipos={tareasTipos}
        onAgregarTarea={onAgregarTarea}
        onMarcarEstado={onMarcarEstado}
        onEliminarTarea={onEliminarTarea}
        onAgregarTipo={onAgregarTipo}
        onEliminarTipo={onEliminarTipo}
        onEditarTarea={onEditarTarea}
      />
    </div>
  )
}

function PanelTareas({ locacion, tareas, tareasTipos, onAgregarTarea, onMarcarEstado, onEliminarTarea, onAgregarTipo, onEliminarTipo, onEditarTarea }) {
  const [toast, showToast] = useToast()
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState('')
  const [prioridad, setPrioridad] = useState('media')
  const [asignadoA, setAsignadoA] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verHechas, setVerHechas] = useState(false)
  const [gruposAbiertos, setGruposAbiertos] = useState({})
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(null)

  // El select de tipo depende del catálogo, que llega vacío en el primer render
  // (todavía no cargó) — arranca en la primera opción apenas está disponible.
  useEffect(() => { if (!tipo && tareasTipos.length > 0) setTipo(tareasTipos[0]) }, [tareasTipos, tipo])

  const palabras = contarPalabras(descripcion)
  const excedePalabras = palabras > MAX_PALABRAS_TAREA

  const pendientes = ordenarTareas(tareas.filter(t => t.estado === 'pendiente'))
  const hechas = tareas.filter(t => t.estado === 'hecha')
    .sort((a, b) => new Date(b.resuelto_en || b.created_at) - new Date(a.resuelto_en || a.created_at))

  async function agregar() {
    const limpio = descripcion.trim()
    if (!limpio || excedePalabras || guardando || !tipo) return
    setGuardando(true)
    const res = await onAgregarTarea({ descripcion: limpio, tipo, prioridad, asignado_a: asignadoA || null, fecha_limite: fechaLimite || null, locacion })
    setGuardando(false)
    if (res?.ok === false) { showToast('No se pudo guardar la tarea'); return }
    setDescripcion('')
    setFechaLimite('')
    showToast('Tarea asignada ✓')
  }

  async function cambiarEstado(t, estado) {
    const res = await onMarcarEstado(t.id, estado)
    showToast(res?.ok === false ? 'No se pudo actualizar' : (estado === 'hecha' ? `${t.descripcion}: marcada como hecha` : `${t.descripcion}: reabierta`))
  }

  async function editarTarea(t, cambios) {
    const res = await onEditarTarea(t.id, cambios)
    if (res?.ok === false) showToast('No se pudo guardar la tarea')
    else showToast(cambios.locacion !== t.locacion ? `${cambios.descripcion}: movida a ${cambios.locacion}` : `${cambios.descripcion}: actualizada`)
    return res
  }

  async function confirmarBorrar(t) {
    const res = await onEliminarTarea(t.id)
    showToast(res?.ok === false ? 'No se pudo borrar' : 'Tarea eliminada')
    setConfirmandoBorrar(null)
  }

  const hoy = hoyISO()
  const totalVencidas = pendientes.filter(t => t.fecha_limite && t.fecha_limite < hoy).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={seccionTituloTareas}>Nueva tarea en {locacion}</div>
      <div className="card">
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">
              Descripción{excedePalabras && <span style={{ color: '#791F1F' }}> · máximo {MAX_PALABRAS_TAREA} palabras</span>}
            </label>
            <input
              className="form-control" type="text" placeholder="Ej: comprar bolsas de sustrato"
              value={descripcion} onChange={e => setDescripcion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregar()}
              style={excedePalabras ? { borderColor: '#791F1F' } : undefined}
            />
            <div style={{ fontSize: 11, color: excedePalabras ? '#791F1F' : 'var(--text-secondary)', textAlign: 'right' }}>{palabras}/{MAX_PALABRAS_TAREA} palabras</div>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-control" value={tipo} onChange={e => setTipo(e.target.value)}>
              {tareasTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Asignado a</label>
            <select className="form-control" value={asignadoA} onChange={e => setAsignadoA(e.target.value)}>
              <option value="">Sin asignar</option>
              {MIEMBROS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha límite (opcional)</label>
            <input className="form-control" type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} />
          </div>
          <div className="form-group full">
            <label className="form-label">Prioridad</label>
            <div className="miembro-row">
              {PRIORIDADES_TAREA.map(p => (
                <button key={p.valor} type="button" className={`miembro-btn${prioridad === p.valor ? ' active' : ''}`} onClick={() => setPrioridad(p.valor)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
        <button className="btn-submit" style={{ marginTop: 12 }} disabled={!descripcion.trim() || excedePalabras || guardando || !tipo} onClick={agregar}>+ Asignar tarea</button>
      </div>

      <PanelTiposTarea tipos={tareasTipos} onAgregar={onAgregarTipo} onEliminar={onEliminarTipo} />

      <div style={seccionTituloTareas}>Tareas pendientes</div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-num">{pendientes.length}</div><div className="stat-lbl">Pendientes</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: totalVencidas > 0 ? '#791F1F' : undefined }}>{totalVencidas}</div><div className="stat-lbl">Vencidas</div></div>
        <div className="stat-card"><div className="stat-num">{hechas.length}</div><div className="stat-lbl">Hechas</div></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pendientes.length === 0 && <div className="empty-state">Sin tareas pendientes.</div>}
        {PRIORIDADES_TAREA.map(p => {
          const items = pendientes.filter(t => t.prioridad === p.valor)
          if (items.length === 0) return null
          const vencidasGrupo = items.filter(t => t.fecha_limite && t.fecha_limite < hoy).length
          const abierto = !!gruposAbiertos[p.valor]
          return (
            <div key={p.valor}>
              <div
                className="panel-stock-toggle"
                onClick={() => setGruposAbiertos(g => ({ ...g, [p.valor]: !g[p.valor] }))}
                style={{ '--stock-color': COLOR_PRIORIDAD_TAREA[p.valor], '--stock-bg': FONDO_PRIORIDAD_TAREA[p.valor], '--stock-border': BORDE_PRIORIDAD_TAREA[p.valor] }}
              >
                <div className="panel-stock-icon"><Flag size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="panel-stock-titulo">{p.label} prioridad</div>
                  <div className="panel-stock-sub">
                    {items.length} tarea{items.length === 1 ? '' : 's'} pendiente{items.length === 1 ? '' : 's'}
                    {vencidasGrupo > 0 && <span className="panel-stock-alerta"> · {vencidasGrupo} vencida{vencidasGrupo === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
              {abierto && (
                <div className="pedidos-list" style={{ marginTop: 8 }}>
                  {items.map(t => (
                    <FilaTarea
                      key={t.id} tarea={t} tareasTipos={tareasTipos} confirmando={confirmandoBorrar === t.id}
                      onMarcarHecha={() => cambiarEstado(t, 'hecha')}
                      onEditar={cambios => editarTarea(t, cambios)}
                      onPedirBorrar={() => setConfirmandoBorrar(t.id)}
                      onCancelarBorrar={() => setConfirmandoBorrar(null)}
                      onConfirmarBorrar={() => confirmarBorrar(t)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hechas.length > 0 && (
        <div>
          <div
            className="panel-stock-toggle"
            onClick={() => setVerHechas(v => !v)}
            style={{ '--stock-color': 'var(--green-dark)', '--stock-bg': 'var(--green-light)', '--stock-border': 'var(--green-border)' }}
          >
            <div className="panel-stock-icon"><Check size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="panel-stock-titulo">Tareas hechas</div>
              <div className="panel-stock-sub">{hechas.length} completada{hechas.length === 1 ? '' : 's'}</div>
            </div>
            {verHechas ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
          {verHechas && (
            <div className="pedidos-list" style={{ marginTop: 8 }}>
              {hechas.map(t => (
                <FilaTarea
                  key={t.id} tarea={t} tareasTipos={tareasTipos} hecha confirmando={confirmandoBorrar === t.id}
                  onReabrir={() => cambiarEstado(t, 'pendiente')}
                  onEditar={cambios => editarTarea(t, cambios)}
                  onPedirBorrar={() => setConfirmandoBorrar(t.id)}
                  onCancelarBorrar={() => setConfirmandoBorrar(null)}
                  onConfirmarBorrar={() => confirmarBorrar(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  )
}

const seccionTituloTareas = { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }

// Todo lo que se carga en una tarea se puede corregir después (pendiente o hecha), incluido
// moverla a la otra Hormi — el form de edición es el mismo set de campos que el alta.
function FilaTarea({ tarea, tareasTipos, hecha, confirmando, onMarcarHecha, onReabrir, onEditar, onPedirBorrar, onCancelarBorrar, onConfirmarBorrar }) {
  const [editando, setEditando] = useState(null) // null | copia editable de los campos
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  const hoy = hoyISO()
  const vencida = !hecha && tarea.fecha_limite && tarea.fecha_limite < hoy
  // Si el tipo actual ya no está en el catálogo igual se muestra, para no pisarlo sin querer.
  const opcionesTipo = tareasTipos.includes(tarea.tipo) ? tareasTipos : [tarea.tipo, ...tareasTipos]
  const palabras = editando ? contarPalabras(editando.descripcion) : 0
  const excedePalabras = palabras > MAX_PALABRAS_TAREA
  const setCampo = (k, v) => setEditando(e => ({ ...e, [k]: v }))

  function abrirEditar() {
    setEditando({ descripcion: tarea.descripcion, tipo: tarea.tipo, asignado_a: tarea.asignado_a || '', prioridad: tarea.prioridad, fecha_limite: tarea.fecha_limite || '', locacion: tarea.locacion })
  }

  async function guardar() {
    if (enCurso.current || !editando.descripcion.trim() || excedePalabras) return
    enCurso.current = true
    setGuardando(true)
    const res = await onEditar({
      descripcion: editando.descripcion.trim(), tipo: editando.tipo, asignado_a: editando.asignado_a || null,
      prioridad: editando.prioridad, fecha_limite: editando.fecha_limite || null, locacion: editando.locacion,
    })
    enCurso.current = false
    setGuardando(false)
    if (res?.ok !== false) setEditando(null)
  }

  if (editando) {
    return (
      <div className="card fila-tarea-editando">
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">
              Descripción{excedePalabras && <span style={{ color: '#791F1F' }}> · máximo {MAX_PALABRAS_TAREA} palabras</span>}
            </label>
            <input className="form-control" type="text" value={editando.descripcion} disabled={guardando} onChange={e => setCampo('descripcion', e.target.value)} style={excedePalabras ? { borderColor: '#791F1F' } : undefined} />
            <div style={{ fontSize: 11, color: excedePalabras ? '#791F1F' : 'var(--text-secondary)', textAlign: 'right' }}>{palabras}/{MAX_PALABRAS_TAREA} palabras</div>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-control" value={editando.tipo} disabled={guardando} onChange={e => setCampo('tipo', e.target.value)}>
              {opcionesTipo.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Asignado a</label>
            <select className="form-control" value={editando.asignado_a} disabled={guardando} onChange={e => setCampo('asignado_a', e.target.value)}>
              <option value="">Sin asignar</option>
              {MIEMBROS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha límite (opcional)</label>
            <input className="form-control" type="date" value={editando.fecha_limite} disabled={guardando} onChange={e => setCampo('fecha_limite', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hormi</label>
            <select className="form-control" value={editando.locacion} disabled={guardando} onChange={e => setCampo('locacion', e.target.value)}>
              {['Hormi 1.0', 'Hormi 2.0'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group full">
            <label className="form-label">Prioridad</label>
            <div className="miembro-row" style={{ marginBottom: 0 }}>
              {PRIORIDADES_TAREA.map(p => (
                <button key={p.valor} type="button" className={`miembro-btn${editando.prioridad === p.valor ? ' active' : ''}`} disabled={guardando} onClick={() => setCampo('prioridad', p.valor)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-submit" style={{ flex: 1 }} disabled={guardando || !editando.descripcion.trim() || excedePalabras} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
          <button onClick={() => setEditando(null)} disabled={guardando} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pedido-card" style={{ cursor: 'default', opacity: hecha ? 0.7 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div className="pedido-nombre" style={{ textDecoration: hecha ? 'line-through' : 'none' }}>{tarea.descripcion}</div>
        <div className="pedido-sub">
          {tarea.tipo} · {tarea.asignado_a || 'Sin asignar'}{tarea.creado_por ? ` · cargada por ${tarea.creado_por}` : ''} · cargada {new Date(tarea.created_at).toLocaleDateString('es-AR')}
        </div>
        {tarea.fecha_limite && (
          <div className="pedido-badges">
            <span className={`badge ${vencida ? 'badge-sin-cobrar' : 'badge-parcial'}`}>{vencida ? 'Vencida' : 'Vence'} {formatFechaDateISO(tarea.fecha_limite)}</span>
          </div>
        )}
      </div>
      <div className="pedido-right">
        <span className="badge" style={{ background: FONDO_PRIORIDAD_TAREA[tarea.prioridad], color: COLOR_PRIORIDAD_TAREA[tarea.prioridad] }}>{LABEL_PRIORIDAD_TAREA[tarea.prioridad]}</span>
      </div>
      <div style={{ gridColumn: '1 / -1', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {hecha
          ? <button onClick={onReabrir} style={btnLinkStyle('var(--green-dark)')}>Reabrir</button>
          : <button onClick={onMarcarHecha} style={btnLinkStyle('var(--green-dark)')}>Marcar hecha</button>}
        <button onClick={abrirEditar} style={btnLinkStyle('var(--text-secondary)')}>Editar</button>
        <button className="btn-eliminar-fila" style={{ width: 22, height: 22, fontSize: 10, marginLeft: 'auto' }} title="Borrar tarea" onClick={onPedirBorrar}>✕</button>
      </div>
      {confirmando && (
        <div style={{ gridColumn: '1 / -1', marginTop: 10, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#791F1F', flex: 1 }}>¿Borrar esta tarea?</span>
          <button onClick={onConfirmarBorrar} style={{ padding: '6px 10px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sí, borrar</button>
          <button onClick={onCancelarBorrar} style={{ padding: '6px 10px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

// Catálogo de tipos de tarea: se edita poco, va tucked en un disclosure para no
// competir con el form de alta ni con la lista, que son lo que se usa a diario.
function PanelTiposTarea({ tipos, onAgregar, onEliminar }) {
  const [abierto, setAbierto] = useState(false)
  const [toast, showToast] = useToast()
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(null)

  async function agregar() {
    const limpio = nuevoTipo.trim()
    if (!limpio || agregando) return
    if (tipos.some(t => t.toLowerCase() === limpio.toLowerCase())) { showToast('Ya existe un tipo con ese nombre'); return }
    setAgregando(true)
    const res = await onAgregar(limpio)
    setAgregando(false)
    if (res?.ok === false) { showToast(res.error?.code === '23505' ? 'Ya existe un tipo con ese nombre' : `No se pudo agregar ${limpio}`); return }
    setNuevoTipo('')
    showToast(`${limpio}: agregado al catálogo`)
  }

  async function confirmarBorrar(nombre) {
    const res = await onEliminar(nombre)
    if (res?.ok === false) {
      // El bloqueo por tipo en uso también se valida en la base (trigger), como red de
      // seguridad si dos personas están editando el catálogo a la vez.
      const msg = (res.error && typeof res.error === 'object' && res.error.message) || null
      showToast(msg || `No se pudo borrar ${nombre}`)
    } else {
      showToast(`${nombre}: eliminado del catálogo`)
    }
    setConfirmandoBorrar(null)
  }

  return (
    <div>
      <div
        className="panel-stock-toggle"
        onClick={() => setAbierto(v => !v)}
        style={{ '--stock-color': 'var(--text-secondary)', '--stock-bg': 'var(--bg-secondary)', '--stock-border': 'var(--border-mid)' }}
      >
        <div className="panel-stock-icon"><Tag size={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-stock-titulo">Tipos de tarea</div>
          <div className="panel-stock-sub">{tipos.length} tipos · agregar, editar o borrar</div>
        </div>
        {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      {abierto && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tipos.map(t => (
              <div key={t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{t}</span>
                  <button className="btn-eliminar-fila" style={{ width: 22, height: 22, fontSize: 10 }} title={`Borrar ${t}`} onClick={() => setConfirmandoBorrar(t)}>✕</button>
                </div>
                {confirmandoBorrar === t && (
                  <div style={{ marginTop: 6, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#791F1F', flex: 1 }}>¿Borrar {t} del catálogo?</span>
                    <button onClick={() => confirmarBorrar(t)} style={{ padding: '6px 10px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sí, borrar</button>
                    <button onClick={() => setConfirmandoBorrar(null)} style={{ padding: '6px 10px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
            <input className="form-control" type="text" placeholder="Nuevo tipo..." value={nuevoTipo} disabled={agregando} onChange={e => setNuevoTipo(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()} />
            <button className="btn-submit" style={{ width: 'auto', padding: '0 14px', whiteSpace: 'nowrap', opacity: agregando ? 0.6 : 1 }} disabled={agregando} onClick={agregar}>+ Agregar</button>
          </div>
          <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}

function ModalTareasPendientes({ tareas, onMarcarEstado, onVerTodas, onCerrar }) {
  useEscape(onCerrar)
  const [lista, setLista] = useState(tareas)

  async function marcarHecha(id) {
    setLista(prev => prev.filter(t => t.id !== id))
    await onMarcarEstado(id, 'hecha')
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-titulo">Tareas pendientes</div>
            <div className="modal-sub">{lista.length} {lista.length === 1 ? 'tarea' : 'tareas'} · ordenadas por prioridad</div>
          </div>
          <button className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        {lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--green-dark)', fontSize: 14, fontWeight: 500 }}>Ya no tenés nada pendiente ✓</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {lista.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.descripcion}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t.locacion} · {t.tipo} · {t.asignado_a || 'Sin asignar'}</div>
                </div>
                <span className="badge" style={{ background: FONDO_PRIORIDAD_TAREA[t.prioridad], color: COLOR_PRIORIDAD_TAREA[t.prioridad], flexShrink: 0 }}>{LABEL_PRIORIDAD_TAREA[t.prioridad]}</span>
                <button onClick={() => marcarHecha(t.id)} style={{ ...btnLinkStyle('var(--green-dark)'), flexShrink: 0 }}>Hecha</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn-submit" onClick={onVerTodas}>Ver todas las tareas</button>
      </div>
    </div>
  )
}

// Select de tipo (Compra/Consumo/Baja) con campos condicionales, mismo patrón que
// PagosRegistro: precio/locación solo aparecen para 'compra' (es lo único que genera gasto).
function MovimientoInsumoForm({ item, onGuardar, onCancelar }) {
  const [tipo, setTipo] = useState('compra')
  const [cantidad, setCantidad] = useState('')
  const [precioUnitario, setPrecioUnitario] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [locacion, setLocacion] = useState('Hormi 1.0')
  const [cuenta, setCuenta] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)
  // Una compra con precio genera un gasto: necesita la cuenta de la que salió la plata, igual
  // que un gasto cargado a mano — si no, nunca se descuenta de ninguna cuenta en Finanzas.
  const generaGasto = tipo === 'compra' && parseFloat(precioUnitario) > 0

  async function confirmar() {
    if (enCurso.current) return
    const cant = parseFloat(cantidad)
    if (!cant || cant <= 0) { setError('Ingresá una cantidad válida.'); return }
    if (!fecha) { setError('Elegí la fecha.'); return }
    if (generaGasto && !cuenta) { setError('Elegí la cuenta de la que salió la plata.'); return }
    enCurso.current = true
    setGuardando(true)
    const res = await onGuardar({
      tipo, cantidad: cant,
      precioUnitario: generaGasto ? parseFloat(precioUnitario) : null,
      fecha, locacion: tipo === 'compra' ? locacion : null,
      cuenta: generaGasto ? cuenta : null,
      nota: nota.trim() || null,
    })
    enCurso.current = false
    setGuardando(false)
    if (!res?.ok) setError(res?.msg || 'No se pudo guardar. Intentá de nuevo.')
  }

  return (
    <div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select className="form-control" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="compra">Compra</option>
            <option value="consumo">Consumo</option>
            <option value="baja">Baja (rotura/pérdida)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Cantidad ({item.unidad})</label>
          <input className="form-control" type="number" min="0" inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </div>
        {tipo === 'compra' && (
          <div className="form-group">
            <label className="form-label">Precio unitario ($)</label>
            <InputMonto value={precioUnitario} onChange={setPrecioUnitario} />
          </div>
        )}
        {tipo === 'compra' && (
          <div className="form-group">
            <label className="form-label">Locación</label>
            <select className="form-control" value={locacion} onChange={e => setLocacion(e.target.value)}>
              <option>Hormi 1.0</option>
              <option>Hormi 2.0</option>
            </select>
          </div>
        )}
        {generaGasto && (
          <div className="form-group full">
            <label className="form-label">Cuenta de la que sale</label>
            <select className="form-control" value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">Seleccionar...</option>
              {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input className="form-control" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-group full">
          <label className="form-label">Nota (opcional)</label>
          <input className="form-control" type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Proveedor, motivo..." />
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: '#791F1F', marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-submit" onClick={confirmar} disabled={guardando} style={{ flex: 1 }}>Guardar movimiento</button>
        <button onClick={onCancelar} style={{ padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Tab Cultivo (riegos + ciclos) ─────────────────────────────
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

const LABELS_PARAM = { ec: 'EC', ph: 'pH', ppfd: 'PPFD', vpd: 'VPD', hr: 'HR', temp: 'Temp' }
const ORDEN_GRILLA = ['ec', 'ph', 'temp', 'hr', 'vpd', 'ppfd']

// Grilla 2x3 con los 6 parámetros evaluados por el agente (turba sin CO₂), siempre visibles,
// coloreados según estado y con intensidad de color proporcional a la distancia al objetivo.
function GrillaParametros({ etapa, semana, valores }) {
  if (!semana) return null
  const { filaRef, parametros } = evaluarRegistro(etapa, semana, valores)
  if (!filaRef) {
    return <span className="badge badge-param-sin-dato">Semana {semana} sin tabla de referencia</span>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {ORDEN_GRILLA.map(tipo => {
        const { estado, objetivoTexto, intensidad } = parametros[tipo]
        const { background, color } = colorPorIntensidad(estado, intensidad)
        return (
          <div key={tipo} style={{ background, color, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.8 }}>{LABELS_PARAM[tipo]}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{valores[tipo] || '—'}</div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>{estado === 'sin_dato' ? 'sin dato' : `obj. ${objetivoTexto}`}</div>
          </div>
        )
      })}
    </div>
  )
}

// Compara valores registrados contra la tabla de turba sin CO₂ y muestra los que están fuera de rango.
// Chequeo 100% determinístico (ver src/parametrosTurba.js) — nunca inventa un objetivo si falta la fila de referencia.
function BadgesParametros({ etapa, semana, valores }) {
  if (!semana) return null
  const { filaRef, parametros } = evaluarRegistro(etapa, semana, valores)
  if (!filaRef) {
    return <div className="pedido-badges"><span className="badge badge-param-sin-dato">Semana {semana} sin tabla de referencia</span></div>
  }
  const desvios = Object.entries(parametros).filter(([, v]) => v.estado === 'atencion' || v.estado === 'fuera')
  if (desvios.length === 0) return null
  return (
    <div className="pedido-badges">
      {desvios.map(([tipo, { estado, objetivoTexto }]) => (
        <span key={tipo} className={`badge badge-param-${estado}`} title={`${LABELS_PARAM[tipo]} objetivo: ${objetivoTexto}`}>
          {estado === 'fuera' ? '⚠ ' : '· '}{LABELS_PARAM[tipo]} {valores[tipo]} (obj. {objetivoTexto})
        </span>
      ))}
    </div>
  )
}

function ModalEditarRiego({ riego, fechaInicioCiclo, onGuardar, onEliminar, onCerrar }) {
  useEscape(onCerrar)
  const [form, setForm] = useState({
    semana: riego.semana, fecha: riego.fecha || '',
    ec: riego.ec || '', ph: riego.ph || '', ppfd: riego.ppfd || '',
    pulsos: riego.pulsos || '', tiempoPulso: riego.tiempoPulso || '',
    ml: riego.ml || '', vpd: riego.vpd || '', hr: riego.hr || '',
    temp: riego.temp || '', fertilizantes: riego.fertilizantes || '',
  })
  const [confirmando, setConfirmando] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setFecha = v => setForm(f => ({ ...f, fecha: v, semana: fechaInicioCiclo ? semanaDesdeFecha(v, fechaInicioCiclo) : f.semana }))

  function guardar() {
    if (!form.fecha) return
    onGuardar({ ...riego, ...form })
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-titulo">Editar riego</div>
          <button className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <DatePicker value={form.fecha} onChange={setFecha} />
          </div>
          <div className="form-group">
            <label className="form-label">Semana (automática)</label>
            <input className="form-control" type="number" min="1" value={form.semana} onChange={e => set('semana', parseInt(e.target.value) || 1)} />
          </div>
          {paramsRiego.map(p => (
            <div key={p.key} className="form-group">
              <label className="form-label">{p.label}</label>
              <input className="form-control" type="text" placeholder={p.placeholder} value={form[p.key]} onChange={e => set(p.key, e.target.value)} />
            </div>
          ))}
        </div>
        <button className="btn-submit" style={{ marginTop: 16 }} onClick={guardar}>Guardar cambios</button>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} style={{ width: '100%', marginTop: 8, padding: '10px', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', background: 'transparent', color: '#791F1F', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Eliminar riego
          </button>
        ) : (
          <div style={{ marginTop: 8, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>¿Confirmás la eliminación?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onEliminar(riego.id)} style={{ flex: 1, padding: '9px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, eliminar</button>
              <button onClick={() => setConfirmando(false)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FormCiclo({ modo, cicloInicial, color, onGuardar, onCancelar }) {
  const [fechaInicio, setFechaInicio] = useState(cicloInicial?.fecha_inicio || hoyCompleto())
  const [geneticas, setGeneticas] = useState(cicloInicial?.geneticas || [])
  const [otra, setOtra] = useState('')
  const catalogo = [...new Set([...GENETICAS_CULTIVO, ...geneticas])]

  function toggleGenetica(g) {
    setGeneticas(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }
  function agregarOtra() {
    const val = otra.trim()
    if (val && !geneticas.includes(val)) setGeneticas(prev => [...prev, val])
    setOtra('')
  }

  return (
    <div className="card">
      <div className="form-label" style={{ marginBottom: 10 }}>{modo === 'nuevo' ? 'Empezar ciclo nuevo' : 'Editar ciclo'}</div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Fecha de inicio</label>
        <DatePicker value={fechaInicio} onChange={setFechaInicio} />
      </div>
      <div className="form-group">
        <label className="form-label">Genéticas</label>
        <div className="miembro-row">
          {catalogo.map(g => (
            <button key={g} type="button" className={`miembro-btn${geneticas.includes(g) ? ' active' : ''}`} onClick={() => toggleGenetica(g)}>{g}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input className="form-control" placeholder="Agregar otra genética..." value={otra} onChange={e => setOtra(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarOtra() } }} />
          <button type="button" onClick={agregarOtra} style={{ flexShrink: 0, padding: '0 16px', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--text-secondary)' }}>+</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-submit" style={{ flex: 1, background: color, marginTop: 0 }} onClick={() => fechaInicio && onGuardar({ fechaInicio, geneticas })}>Guardar</button>
        {onCancelar && (
          <button onClick={onCancelar} style={{ flex: 1, background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
        )}
      </div>
    </div>
  )
}

function CicloHeader({ ciclo, esActivo, color, colorLight, colorBorder, onEditar, onCerrar, cerrando, setCerrando }) {
  return (
    <div className="card" style={{ borderColor: colorBorder }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {esActivo ? 'Ciclo activo' : 'Ciclo cerrado'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Iniciado {ciclo.fecha_inicio}{ciclo.fecha_cierre ? ` · cerrado ${ciclo.fecha_cierre}` : ''}
          </div>
        </div>
        {esActivo && <button onClick={onEditar} style={{ background: 'none', border: 'none', color, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Editar</button>}
      </div>
      {ciclo.geneticas?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {ciclo.geneticas.map(g => <span key={g} className="badge" style={{ background: colorLight, color }}>{g}</span>)}
        </div>
      )}
      {esActivo && (
        !cerrando ? (
          <button onClick={() => setCerrando(true)} style={{ width: '100%', marginTop: 12, padding: '9px', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', background: 'transparent', color: '#791F1F', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Cerrar periodo
          </button>
        ) : (
          <div style={{ marginTop: 12, background: '#FCEBEB', border: '0.5px solid #791F1F', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>¿Cerrar este ciclo? Vas a poder ver el historial pero no vas a poder cargar más riegos acá.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCerrar} style={{ flex: 1, padding: '9px', background: '#791F1F', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sí, cerrar</button>
              <button onClick={() => setCerrando(false)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )
      )}
    </div>
  )
}

function TabCultivo() {
  const [etapa, setEtapa] = useState('vegetativo')
  const [riegosVege, setRiegosVege] = useState([])
  const [riegosFlora, setRiegosFlora] = useState([])
  const [ciclos, setCiclos] = useState([])
  const [cicloSeleccionadoId, setCicloSeleccionadoId] = useState(null)
  const [mostrarCiclosCerrados, setMostrarCiclosCerrados] = useState(false)
  const [editandoCiclo, setEditandoCiclo] = useState(false)
  const [cerrandoCiclo, setCerrandoCiclo] = useState(false)
  const [semanaFiltro, setSemanaFiltro] = useState(1)
  const [cicloIdSemanaSync, setCicloIdSemanaSync] = useState(undefined)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ ...riegoVacio(), fecha: hoyCompleto(), semana: 1 })
  const [toast, showToast] = useToast()
  const [riegosAbiertos, setRiegosAbiertos] = useState(new Set())
  const [editando, setEditando] = useState(null)

  function toggleRiego(id) {
    setRiegosAbiertos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  useEffect(() => {
    Promise.all([
      traerTodo(o => supabase.from('riegos').select('*', o).order('created_at', { ascending: false }).order('id')),
      traerTodo(o => supabase.from('ciclos').select('*', o).order('created_at', { ascending: false }).order('id')),
    ]).then(([riegosRes, ciclosRes]) => {
      if (riegosRes.data) {
        setRiegosVege(riegosRes.data.filter(r => r.etapa === 'vegetativo'))
        setRiegosFlora(riegosRes.data.filter(r => r.etapa === 'floracion'))
      }
      if (ciclosRes.data) setCiclos(ciclosRes.data)
    })
  }, [])

  const riegos = etapa === 'vegetativo' ? riegosVege : riegosFlora
  const setRiegos = etapa === 'vegetativo' ? setRiegosVege : setRiegosFlora
  const color = etapa === 'vegetativo' ? 'var(--green-dark)' : '#7B4F9E'
  const colorLight = etapa === 'vegetativo' ? 'var(--green-light)' : '#F3EAF9'
  const colorBorder = etapa === 'vegetativo' ? 'var(--green-border)' : '#D4B8E8'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const cicloActivo = ciclos.find(c => c.etapa === etapa && !c.fecha_cierre) || null
  const ciclosCerrados = ciclos
    .filter(c => c.etapa === etapa && c.fecha_cierre)
    .sort((a, b) => (parseFechaCompleta(b.fecha_inicio) || 0) - (parseFechaCompleta(a.fecha_inicio) || 0))
  const cicloMostrado = (cicloSeleccionadoId && ciclos.find(c => c.id === cicloSeleccionadoId)) || cicloActivo
  const esCicloActivo = !!cicloMostrado && cicloMostrado.id === cicloActivo?.id

  // Semana "de hoy" del ciclo que se está mostrando. Se recalcula durante el render (no en un
  // efecto) cada vez que cambia el ciclo mostrado, y desde ahí queda editable con ‹ ›.
  let semana = semanaFiltro
  if ((cicloMostrado?.id ?? null) !== cicloIdSemanaSync) {
    semana = !cicloMostrado
      ? 1
      : cicloMostrado.id === cicloActivo?.id
        ? semanaDesdeFecha(hoyCompleto(), cicloMostrado.fecha_inicio)
        : Math.max(1, ...riegos.filter(r => r.ciclo_id === cicloMostrado.id).map(r => r.semana || 1))
    setCicloIdSemanaSync(cicloMostrado?.id ?? null)
    setSemanaFiltro(semana)
  }

  function cambiarEtapa(nueva) {
    setEtapa(nueva)
    setCicloSeleccionadoId(null)
    setEditandoCiclo(false)
    setCerrandoCiclo(false)
    setMostrarForm(false)
    setMostrarCiclosCerrados(false)
  }

  function seleccionarCiclo(id) {
    setCicloSeleccionadoId(id)
    setEditandoCiclo(false)
    setCerrandoCiclo(false)
    setMostrarForm(false)
  }

  const setFechaConSemana = v => setForm(f => ({ ...f, fecha: v, semana: cicloMostrado ? semanaDesdeFecha(v, cicloMostrado.fecha_inicio) : f.semana }))

  async function guardarRiego() {
    if (!form.fecha) { showToast('Completá la fecha'); return }
    if (!cicloActivo) { showToast('No hay un ciclo activo'); return }
    const { data, error } = await supabase.from('riegos').insert({
      etapa, semana: form.semana, fecha: form.fecha, ciclo_id: cicloActivo.id,
      ec: form.ec, ph: form.ph, ppfd: form.ppfd,
      pulsos: form.pulsos, tiempo_pulso: form.tiempoPulso,
      ml: form.ml, vpd: form.vpd, hr: form.hr,
      temp: form.temp, fertilizantes: form.fertilizantes,
    }).select().single()
    if (!error && data) {
      const nuevo = { ...data, tiempoPulso: data.tiempo_pulso }
      setRiegos([nuevo, ...riegos])
      setRiegosAbiertos(prev => new Set(prev).add(nuevo.id))
      setForm({ ...riegoVacio(), fecha: hoyCompleto(), semana: form.semana })
      setMostrarForm(false)
      showToast('Riego registrado ✓')
    } else showToast('Error al guardar')
  }

  async function actualizarRiego(actualizado) {
    const { data, error } = await supabase.from('riegos').update({
      semana: actualizado.semana, fecha: actualizado.fecha,
      ec: actualizado.ec, ph: actualizado.ph, ppfd: actualizado.ppfd,
      pulsos: actualizado.pulsos, tiempo_pulso: actualizado.tiempoPulso,
      ml: actualizado.ml, vpd: actualizado.vpd, hr: actualizado.hr,
      temp: actualizado.temp, fertilizantes: actualizado.fertilizantes,
    }).eq('id', actualizado.id).select().single()
    if (!error && data) {
      const editado = { ...data, tiempoPulso: data.tiempo_pulso }
      setRiegos(riegos.map(r => r.id === editado.id ? editado : r))
      setEditando(null)
      showToast('Riego actualizado ✓')
    } else showToast('Error al actualizar')
  }

  async function eliminarRiego(id) {
    const { error } = await supabase.from('riegos').delete().eq('id', id)
    if (!error) {
      setRiegos(riegos.filter(r => r.id !== id))
      setEditando(null)
      showToast('Riego eliminado')
    } else showToast('Error al eliminar')
  }

  async function empezarCiclo({ fechaInicio, geneticas }) {
    const { data, error } = await supabase.from('ciclos').insert({ etapa, fecha_inicio: fechaInicio, fecha_cierre: null, geneticas }).select().single()
    if (!error && data) {
      setCiclos(prev => [data, ...prev])
      setCicloSeleccionadoId(null)
      showToast('Ciclo iniciado ✓')
    } else showToast('Error al iniciar el ciclo')
  }

  async function guardarEdicionCiclo({ fechaInicio, geneticas }) {
    if (!cicloActivo) return
    const { data, error } = await supabase.from('ciclos').update({ fecha_inicio: fechaInicio, geneticas }).eq('id', cicloActivo.id).select().single()
    if (!error && data) {
      setCiclos(prev => prev.map(c => c.id === data.id ? data : c))
      setEditandoCiclo(false)
      showToast('Ciclo actualizado ✓')
    } else showToast('Error al actualizar el ciclo')
  }

  async function cerrarCiclo() {
    if (!cicloActivo) return
    const { data, error } = await supabase.from('ciclos').update({ fecha_cierre: hoyCompleto() }).eq('id', cicloActivo.id).select().single()
    if (!error && data) {
      setCiclos(prev => prev.map(c => c.id === data.id ? data : c))
      setCerrandoCiclo(false)
      showToast('Periodo cerrado ✓')
    } else showToast('Error al cerrar el periodo')
  }

  const riegosFiltrados = riegos.filter(r => r.ciclo_id === cicloMostrado?.id && r.semana === semana)

  return (
    <div className="content">
      <div className="miembro-row">
        <button className={`miembro-btn${etapa === 'vegetativo' ? ' active' : ''}`} onClick={() => cambiarEtapa('vegetativo')}>Vegetativo</button>
        <button className={`miembro-btn${etapa === 'floracion' ? ' active' : ''}`} style={etapa === 'floracion' ? { background: '#F3EAF9', borderColor: '#D4B8E8', color: '#7B4F9E' } : {}} onClick={() => cambiarEtapa('floracion')}>Floración</button>
      </div>

      {cicloMostrado ? (
        editandoCiclo ? (
          <FormCiclo modo="editar" cicloInicial={cicloMostrado} color={color} onGuardar={guardarEdicionCiclo} onCancelar={() => setEditandoCiclo(false)} />
        ) : (
          <CicloHeader
            ciclo={cicloMostrado} esActivo={esCicloActivo} color={color} colorLight={colorLight} colorBorder={colorBorder}
            onEditar={() => setEditandoCiclo(true)} onCerrar={cerrarCiclo} cerrando={cerrandoCiclo} setCerrando={setCerrandoCiclo}
          />
        )
      ) : (
        <FormCiclo modo="nuevo" cicloInicial={null} color={color} onGuardar={empezarCiclo} />
      )}

      {ciclosCerrados.length > 0 && (
        <button onClick={() => setMostrarCiclosCerrados(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: '2px 2px' }}>
          {mostrarCiclosCerrados ? '▴' : '▾'} Ciclos anteriores ({ciclosCerrados.length})
        </button>
      )}
      {mostrarCiclosCerrados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ciclosCerrados.map(c => (
            <div key={c.id} className="pedido-card" style={{ cursor: 'pointer', opacity: cicloMostrado?.id === c.id ? 1 : 0.7 }} onClick={() => seleccionarCiclo(c.id)}>
              <div>
                <div className="pedido-sub">{c.fecha_inicio} — {c.fecha_cierre}</div>
                {c.geneticas?.length > 0 && <div className="pedido-sub" style={{ marginTop: 2 }}>{c.geneticas.join(', ')}</div>}
              </div>
              <span className="pedido-editar-hint">{cicloMostrado?.id === c.id ? 'Viendo ▾' : 'Ver ▾'}</span>
            </div>
          ))}
          {cicloSeleccionadoId && (
            <button onClick={() => seleccionarCiclo(null)} style={{ background: 'none', border: 'none', color, fontSize: 12, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>← Volver al ciclo activo</button>
          )}
        </div>
      )}

      {cicloMostrado && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colorLight, borderRadius: 8, padding: '8px 12px', border: `0.5px solid ${colorBorder}` }}>
          <button onClick={() => setSemanaFiltro(s => Math.max(1, s - 1))} disabled={semana === 1} style={{ background: 'none', border: 'none', fontSize: 22, cursor: semana === 1 ? 'not-allowed' : 'pointer', color: semana === 1 ? 'var(--text-secondary)' : color, opacity: semana === 1 ? 0.4 : 1, padding: '0 8px', lineHeight: 1 }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>Semana {semana}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{riegosFiltrados.length} riego{riegosFiltrados.length !== 1 ? 's' : ''} registrado{riegosFiltrados.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => setSemanaFiltro(s => s + 1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color, padding: '0 8px', lineHeight: 1 }}>›</button>
        </div>
      )}

      {esCicloActivo && (mostrarForm ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="form-label">Nuevo riego — Semana {form.semana}</span>
            <button onClick={() => setMostrarForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <DatePicker value={form.fecha} onChange={setFechaConSemana} />
            </div>
            <div className="form-group">
              <label className="form-label">Semana (automática)</label>
              <input className="form-control" type="number" min="1" value={form.semana} onChange={e => set('semana', parseInt(e.target.value) || 1)} />
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
      ) : (
        <button className="btn-agregar-fila" onClick={() => { setForm(f => ({ ...f, fecha: fechaDeSemana(cicloMostrado.fecha_inicio, semana), semana })); setMostrarForm(true) }}>
          + Registrar riego semana {semana}
        </button>
      ))}

      <div className="pedidos-list">
        {!cicloMostrado
          ? null
          : riegosFiltrados.length === 0
          ? <div className="empty-state">No hay riegos registrados para la semana {semana}.</div>
          : riegosFiltrados.map(r => {
            const abierto = riegosAbiertos.has(r.id)
            return (
              <div key={r.id}>
                <div className="pedido-card" onClick={() => toggleRiego(r.id)} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="pedido-nombre">{r.fecha}</div>
                  </div>
                  <div className="pedido-right">
                    <span className="pedido-editar-hint">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
                  </div>
                </div>
                {abierto && (
                  <div className="pedido-card" onClick={() => setEditando(r)} style={{ cursor: 'pointer', marginTop: 6, marginLeft: 12 }}>
                    <div>
                      <div className="pedido-sub">EC {r.ec || '—'} · pH {r.ph || '—'} · {r.pulsos || '—'} pulsos · {r.ml || '—'}ml</div>
                      {r.fertilizantes && <div className="pedido-sub" style={{ marginTop: 3 }}>{r.fertilizantes}</div>}
                      <BadgesParametros etapa={etapa} semana={r.semana} valores={r} />
                      <span className="pedido-editar-hint">Tocar para editar</span>
                    </div>
                    <div className="pedido-right">
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>VPD {r.vpd || '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.temp || '—'}°C · {r.hr || '—'}%HR</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        }
      </div>
      {riegosFiltrados.length > 0 && (() => {
        const prom = promediarRiegos(riegosFiltrados)
        return (
          <>
            <div className="card" style={{ borderColor: colorBorder, background: colorLight }}>
              <div className="form-label" style={{ marginBottom: 10 }}>Promedio semana {semana}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                {[['EC', prom.ec], ['pH', prom.ph], ['PPFD', prom.ppfd], ['Pulsos', prom.pulsos], ['ML', prom.ml], ['VPD', prom.vpd], ['HR', prom.hr ? prom.hr + '%' : null], ['Temp', prom.temp ? prom.temp + '°C' : null]].map(([label, val]) => val ? (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color }}>{val}</span>
                  </div>
                ) : null)}
              </div>
            </div>
            <div className="card" style={{ marginTop: 10 }}>
              <div className="form-label" style={{ marginBottom: 10 }}>Evaluación vs. tabla — Semana {semana}</div>
              <GrillaParametros etapa={etapa} semana={semana} valores={prom} />
            </div>
          </>
        )
      })()}
      {editando && (
        <ModalEditarRiego
          riego={editando}
          fechaInicioCiclo={ciclos.find(c => c.id === editando.ciclo_id)?.fecha_inicio}
          onGuardar={actualizarRiego}
          onEliminar={eliminarRiego}
          onCerrar={() => setEditando(null)}
        />
      )}
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

// ─── Catálogo de genéticas (geneticas_cosecha/geneticas_esquejes): editable
// desde la app para que el equipo no dependa de un deploy para sumar/sacar una.
async function agregarGeneticaCatalogo(tabla, nombre, listaActual, setFn) {
  const limpio = nombre.trim()
  if (!limpio) return { ok: false, error: 'vacio' }
  if (listaActual.some(g => g.toLowerCase() === limpio.toLowerCase())) return { ok: false, error: 'duplicado' }
  const { error } = await supabase.from(tabla).insert({ nombre: limpio })
  if (error) { console.error('Error agregando genética', tabla, limpio, error); return { ok: false, error } }
  setFn(prev => [...prev, limpio].sort((a, b) => a.localeCompare(b)))
  return { ok: true }
}

async function eliminarGeneticaCatalogo(tabla, nombre, stockActual, setFn) {
  if ((stockActual[nombre] ?? 0) !== 0) return { ok: false, error: 'stock' }
  const { error } = await supabase.from(tabla).delete().eq('nombre', nombre)
  if (error) { console.error('Error eliminando genética', tabla, nombre, error); return { ok: false, error } }
  setFn(prev => prev.filter(g => g !== nombre))
  return { ok: true }
}

// ─── Stock de insumos de cultivo (insumos_stock/insumos_stock_movimientos):
// un solo catálogo con columna `categoria` (no una tabla por categoría como
// genéticas — acá son 7, no 2), editable desde la app sin deploy.
async function agregarInsumoStock(categoria, nombre, unidad, listaActual, setFn) {
  const limpio = nombre.trim()
  if (!limpio) return { ok: false, error: 'vacio' }
  if (listaActual.some(i => i.nombre.toLowerCase() === limpio.toLowerCase())) return { ok: false, error: 'duplicado' }
  const { data, error } = await supabase.from('insumos_stock').insert({ categoria, nombre: limpio, unidad }).select().single()
  if (error || !data) { console.error('Error agregando insumo', categoria, limpio, error); return { ok: false, error } }
  setFn(prev => [...prev, data])
  return { ok: true, data }
}

async function eliminarInsumoStock(insumo, setFn) {
  if ((insumo.stock_actual ?? 0) !== 0) return { ok: false, error: 'stock' }
  const { error } = await supabase.from('insumos_stock').delete().eq('id', insumo.id)
  if (error) { console.error('Error eliminando insumo', insumo.id, error); return { ok: false, error } }
  setFn(prev => prev.filter(i => i.id !== insumo.id))
  return { ok: true }
}

async function editarStockMinimoInsumo(id, nuevoValor, setFn) {
  const { data, error } = await supabase.from('insumos_stock').update({ stock_minimo: nuevoValor }).eq('id', id).select().single()
  if (error || !data) { console.error('Error actualizando mínimo de insumo', id, error); return { ok: false, error } }
  setFn(prev => prev.map(i => i.id === id ? data : i))
  return { ok: true }
}

// Registra un movimiento (compra/consumo/ajuste/baja) y ajusta el stock vivo vía RPC.
// Una compra con precio primero genera el gasto correspondiente en `gastos` (categoría
// según CATEGORIA_GASTO_POR_INSUMO) para dejar el gasto_id ya enlazado en el movimiento.
async function registrarMovimientoInsumo({ insumo, tipo, cantidad, precioUnitario, fecha, miembro, nota, locacion, cuenta }, setInsumosStock, setInsumosStockMovimientos, setGastos) {
  const delta = (tipo === 'consumo' || tipo === 'baja') ? -cantidad : cantidad
  let gastoId = null
  if (tipo === 'compra' && precioUnitario) {
    // Pasa por prepararGasto() como cualquier gasto: la fecha del form (aaaa-mm-dd) queda en
    // el formato único d/m/aaaa y el mes sale de esa fecha, no del día de carga.
    const prep = prepararGasto({
      descripcion: `${insumo.nombre}${nota ? ` — ${nota}` : ''}`,
      categoria: CATEGORIA_GASTO_POR_INSUMO[insumo.categoria] || 'Insumos cultivo',
      monto: cantidad * precioUnitario, fecha, locacion,
      miembro: miembro || null, cuenta: cuenta || null, presupuesto_id: null, cuenta_estimada: false,
    }, [])
    if (!prep.ok) return { ok: false, msg: prep.msg }
    const { data: gasto, error: gastoError } = await supabase.from('gastos').insert(prep.gasto).select().single()
    if (gastoError || !gasto) { console.error('Error generando gasto de compra', gastoError); return { ok: false, error: gastoError } }
    setGastos(prev => [gasto, ...prev])
    gastoId = gasto.id
  }
  const nuevoMovimiento = {
    insumo_id: insumo.id, tipo, cantidad,
    precio_unitario: tipo === 'compra' ? (precioUnitario || null) : null,
    fecha, miembro: miembro || null, nota: nota || null, gasto_id: gastoId,
  }
  const { data: movimiento, error: movError } = await supabase.from('insumos_stock_movimientos').insert(nuevoMovimiento).select().single()
  if (movError || !movimiento) {
    console.error('Error registrando movimiento de insumo', movError)
    // Deshace el gasto recién creado: si no, queda un gasto sin movimiento y al reintentar se duplica.
    if (gastoId) {
      const { error: undoError } = await supabase.from('gastos').delete().eq('id', gastoId)
      if (!undoError) setGastos(prev => prev.filter(g => g.id !== gastoId))
      else return { ok: false, error: movError, msg: 'No se pudo registrar el movimiento y quedó un gasto suelto de esta compra en Gastos: borralo antes de reintentar.' }
    }
    return { ok: false, error: movError }
  }
  setInsumosStockMovimientos(prev => [movimiento, ...prev])
  const { data: nuevoStock, error: rpcError } = await supabase.rpc('ajustar_stock_insumo', { p_insumo_id: insumo.id, p_delta: delta })
  if (rpcError) {
    console.error('Error ajustando stock de insumo', rpcError)
    alert(`Se guardó el movimiento, pero no se pudo ajustar el stock de ${insumo.nombre}. Revisalo manualmente.`)
    // El movimiento (y su gasto) ya quedaron guardados: se cierra el form como éxito para que
    // nadie lo reintente y duplique el movimiento y el gasto.
    return { ok: true }
  }
  if (nuevoStock != null) setInsumosStock(prev => prev.map(i => i.id === insumo.id ? { ...i, stock_actual: Number(nuevoStock) } : i))
  return { ok: true }
}

// Promedio de días entre compras consecutivas — reemplaza un campo manual de
// "frecuencia de compra" que nadie mantendría al día.
function frecuenciaCompra(comprasOrdenadasAsc) {
  if (comprasOrdenadasAsc.length < 2) return null
  const dias = []
  for (let i = 1; i < comprasOrdenadasAsc.length; i++) {
    dias.push((new Date(comprasOrdenadasAsc[i].fecha) - new Date(comprasOrdenadasAsc[i - 1].fecha)) / 86400000)
  }
  const promedio = Math.round(dias.reduce((a, b) => a + b, 0) / dias.length)
  return `Se compra cada ~${promedio} días en promedio`
}

// ─── Mapeo DB (snake_case) ↔ app (camelCase) ──────────────────
// Fuente única de verdad: evita repetir metodoPago/metodo_pago y
// cuentaEstimada/cuenta_estimada por todo el código.
const conAliasPago = row => ({ ...row, metodoPago: row.metodo_pago, fechaCobro: row.fecha_cobro, socioId: row.socio_id })
const conAliasSocio = row => ({ ...row, fechaRegistroOng: row.fecha_registro_ong })

// pagado/metodo_pago/fecha_cobro/cuenta/cuenta_estimada/divisiones/propio ya no se escriben acá:
// el historial de pagos (pedido_pagos/esqueje_pagos) es la única fuente de verdad de ahora en más,
// y "propio" quedó reemplazado por "tipo" (cliente/propio/regalo). Esas columnas quedan en la
// base como respaldo histórico congelado de antes de estos cambios.
const pedidoToDB = p => ({
  fecha: p.fecha, mes: p.mes || mesActual(), miembro: p.miembro, socio: p.socio,
  geneticas: p.geneticas, precio: p.precio, total: p.total, entregado: p.entregado,
  tipo: p.tipo || 'cliente', membresia: p.membresia || null, socio_id: p.socioId || null,
})

const esquejeToDB = e => ({
  fecha: e.fecha, mes: e.mes || mesActual(), miembro: e.miembro, socio: e.socio,
  geneticas: e.geneticas, total: e.total, entregado: e.entregado, tipo: e.tipo || 'cliente',
})

const insumoToDB = i => ({
  fecha: i.fecha, mes: i.mes || mesActual(), miembro: i.miembro, socio: i.socio,
  geneticas: i.geneticas, total: i.total, entregado: i.entregado, tipo: 'cliente',
})

// Único punto por el que pasa todo gasto antes de ir a la base (alta desde Gastos, edición y
// compras de Stock): fecha obligatoria en formato único, mes derivado de esa fecha, y presupuesto
// de la misma locación. Así ninguna pantalla puede guardar un gasto con otro criterio.
function prepararGasto(g, presupuestos) {
  const fecha = normalizarFechaGasto(g.fecha)
  if (!fecha) return { ok: false, msg: 'Elegí la fecha del gasto.' }
  if (g.presupuesto_id) {
    const p = (presupuestos || []).find(x => x.id === Number(g.presupuesto_id))
    if (!p || p.locacion !== g.locacion) return { ok: false, msg: `El presupuesto elegido no es de ${g.locacion}. Elegí otro o "Ninguno".` }
  }
  return { ok: true, gasto: { ...g, fecha, mes: mesDeFecha(fecha) } }
}

// PGRST116 = el update/insert con .single() no devolvió ninguna fila: el gasto ya no existe.
function mensajeErrorGasto(error, accion) {
  if (error?.code === 'PGRST116') return 'Este gasto ya no existe (puede que otro lo haya borrado). Recargá la página.'
  return `No se pudo ${accion}. Revisá la conexión y probá de nuevo.`
}

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
  const [insumos, setInsumos] = useState([])
  const [insumoPagos, setInsumoPagos] = useState([])
  const [gastos, setGastos] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [aportes, setAportes] = useState([])
  const [gastosFijos, setGastosFijos] = useState([])
  const [pedidoPagos, setPedidoPagos] = useState([])
  const [esquejePagos, setEsquejePagos] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [dolaresMovimientos, setDolaresMovimientos] = useState([])
  const [cuentasValidaciones, setCuentasValidaciones] = useState([])
  const [cotizacionesDolar, setCotizacionesDolar] = useState([])
  const [socios, setSocios] = useState([])
  const [stockEsquejes, setStockEsquejes] = useState(STOCK_ESQUEJES_INICIAL)
  const [stockEsquejesInicial, setStockEsquejesInicial] = useState(STOCK_ESQUEJES_INICIAL)
  const [geneticasCosecha, setGeneticasCosecha] = useState(GENETICAS)
  const [geneticasEsquejes, setGeneticasEsquejes] = useState(GENETICAS_ESQUEJES)
  const [stockAjustesFallidos, setStockAjustesFallidos] = useState([])
  const [insumosStock, setInsumosStock] = useState([])
  const [insumosStockMovimientos, setInsumosStockMovimientos] = useState([])
  const [tareas, setTareas] = useState([])
  const [tareasTipos, setTareasTipos] = useState([])
  const [capitalMovimientos, setCapitalMovimientos] = useState([])
  const [capitalCambios, setCapitalCambios] = useState([])
  const [duplicadosDescartados, setDuplicadosDescartados] = useState([])
  const [mostrarModalTareas, setMostrarModalTareas] = useState(false)
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
      const [pedidosRes, stockRes, esquejesRes, stockEsquejesRes, insumosRes, insumoPagosRes, gastosRes, presupuestosRes, aportesRes, gastosFijosRes, pedidoPagosRes, esquejePagosRes, cuentasRes, dolaresMovimientosRes, cuentasValidacionesRes, cotizacionesDolarRes, sociosRes, geneticasCosechaRes, geneticasEsquejesRes, insumosStockRes, insumosStockMovimientosRes, tareasRes, tareasTiposRes, capitalRes, capitalCambiosRes, descartadosRes] = await Promise.all([
        traerTodo(o => supabase.from('pedidos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('stock').select('*', o).order('genetica'), 'genetica'),
        traerTodo(o => supabase.from('esquejes').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('stock_esquejes').select('*', o).order('genetica'), 'genetica'),
        traerTodo(o => supabase.from('insumos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('insumo_pagos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('gastos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('presupuestos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('presupuesto_aportes').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('gastos_fijos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('pedido_pagos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('esqueje_pagos').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('cuentas').select('*', o).order('id')),
        traerTodo(o => supabase.from('dolares_movimientos').select('*', o).order('fecha', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('cuentas_validaciones').select('*', o).order('created_at', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('cotizaciones_dolar').select('*', o).order('fecha', { ascending: false }), 'fecha'),
        traerTodo(o => supabase.from('socios').select('*', o).order('nombre', { ascending: true }).order('id')),
        traerTodo(o => supabase.from('geneticas_cosecha').select('nombre', o).order('nombre', { ascending: true }), 'nombre'),
        traerTodo(o => supabase.from('geneticas_esquejes').select('nombre', o).order('nombre', { ascending: true }), 'nombre'),
        traerTodo(o => supabase.from('insumos_stock').select('*', o).order('categoria', { ascending: true }).order('nombre', { ascending: true }).order('id')),
        traerTodo(o => supabase.from('insumos_stock_movimientos').select('*', o).order('fecha', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('tareas').select('*', o).order('created_at', { ascending: true }).order('id')),
        traerTodo(o => supabase.from('tareas_tipos').select('nombre', o).order('nombre', { ascending: true }), 'nombre'),
        traerTodo(o => supabase.from('capital_movimientos').select('*', o).order('fecha', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('capital_cambios').select('*', o).order('fecha', { ascending: false }).order('id')),
        traerTodo(o => supabase.from('duplicados_descartados').select('*', o).order('created_at', { ascending: false }).order('id')),
      ])
      if (cancelado) return
      const conError = [pedidosRes, stockRes, esquejesRes, stockEsquejesRes, insumosRes, insumoPagosRes, gastosRes, presupuestosRes, aportesRes, gastosFijosRes, pedidoPagosRes, esquejePagosRes, cuentasRes, dolaresMovimientosRes, cuentasValidacionesRes, cotizacionesDolarRes, sociosRes, geneticasCosechaRes, geneticasEsquejesRes, insumosStockRes, insumosStockMovimientosRes, tareasRes, tareasTiposRes, capitalRes, capitalCambiosRes, descartadosRes].filter(r => r.error)
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
      setInsumos((insumosRes.data || []).map(conAliasPago))
      setInsumoPagos(insumoPagosRes.data || [])
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
      setCuentas(cuentasRes.data || [])
      setDolaresMovimientos(dolaresMovimientosRes.data || [])
      setCuentasValidaciones(cuentasValidacionesRes.data || [])
      setCotizacionesDolar(cotizacionesDolarRes.data || [])
      setSocios((sociosRes.data || []).map(conAliasSocio))
      setGeneticasCosecha((geneticasCosechaRes.data || []).map(g => g.nombre))
      setGeneticasEsquejes((geneticasEsquejesRes.data || []).map(g => g.nombre))
      setInsumosStock(insumosStockRes.data || [])
      setInsumosStockMovimientos(insumosStockMovimientosRes.data || [])
      setTareas(tareasRes.data || [])
      setTareasTipos((tareasTiposRes.data || []).map(t => t.nombre))
      setCapitalMovimientos(capitalRes.data || [])
      setCapitalCambios(capitalCambiosRes.data || [])
      setDuplicadosDescartados(descartadosRes.data || [])
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

  // Resumen de cuentas en pesos y en dólares — se calcula acá (no adentro de TabFinanzas) para
  // que el conteo de alertas del agente de Finanzas esté disponible para el badge de la pestaña
  // aunque todavía no se haya entrado a Finanzas en esta sesión.
  const resumenCuentas = useMemo(() => CUENTAS.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { nombre, saldo_inicial: 0, fecha_corte: FECHA_CORTE_DEFAULT, validado: false }
    const ingresosPedidos = pedidoPagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    const ingresosEsquejes = esquejePagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    const ingresosInsumos = insumoPagos.filter(pg => pg.cuenta === nombre && esDesdeCorteISO(pg.fecha, info.fecha_corte)).reduce((s, pg) => s + (pg.monto || 0), 0)
    const egresosGastos = gastos.filter(g => esDesdeCorte(g.fecha, info.fecha_corte))
      .flatMap(g => montosPorCuenta(g, 'monto')).filter(m => m.cuenta === nombre).reduce((s, m) => s + m.monto, 0)
    // Capital (Finanzas → Capital): un aporte entra a la cuenta, una devolución sale.
    const capitalCuenta = capitalMovimientos.filter(c => (c.moneda || 'ARS') === 'ARS' && c.cuenta === nombre && esDesdeCorteISO(c.fecha, info.fecha_corte))
    const aportesCapital = capitalCuenta.filter(c => c.tipo === 'aporte').reduce((s, c) => s + (Number(c.monto) || 0), 0)
    const devolucionesCapital = capitalCuenta.filter(c => c.tipo === 'devolucion').reduce((s, c) => s + (Number(c.monto) || 0), 0)
    // Cambio a pesos de un aporte en dólares: los pesos recibidos entran a esta cuenta.
    const cambiosRecibidos = capitalCambios.filter(c => c.cuenta_destino === nombre && esDesdeCorteISO(c.fecha, info.fecha_corte)).reduce((s, c) => s + (Number(c.monto_ars) || 0), 0)
    const egresos = egresosGastos + devolucionesCapital
    const ingresos = ingresosPedidos + ingresosEsquejes + ingresosInsumos + aportesCapital + cambiosRecibidos
    const saldo = (info.saldo_inicial || 0) + ingresos - egresos
    const estimados =
      pedidoPagos.filter(pg => pg.cuenta === nombre && pg.cuenta_estimada).length +
      esquejePagos.filter(pg => pg.cuenta === nombre && pg.cuenta_estimada).length +
      insumoPagos.filter(pg => pg.cuenta === nombre && pg.cuenta_estimada).length +
      gastos.filter(g => g.cuenta === nombre && g.cuenta_estimada).length
    return { nombre, info, ingresos, egresos, saldo, estimados }
  }), [pedidoPagos, esquejePagos, insumoPagos, gastos, cuentas, capitalMovimientos, capitalCambios])

  const resumenDolares = useMemo(() => CUENTAS_DOLARES.map(nombre => {
    const info = cuentas.find(c => c.nombre === nombre) || { nombre, saldo_inicial: 0, fecha_corte: FECHA_CORTE_DEFAULT, validado: false }
    const movimientos = dolaresMovimientos.filter(m => m.cuenta === nombre)
    const movimientosContados = movimientos.filter(m => esDesdeCorteISO(m.fecha, info.fecha_corte))
    const capitalCuenta = capitalMovimientos.filter(c => c.moneda === 'USD' && c.cuenta === nombre && esDesdeCorteISO(c.fecha, info.fecha_corte))
    const ingresos = movimientosContados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + (m.monto || 0), 0)
      + capitalCuenta.filter(c => c.tipo === 'aporte').reduce((s, c) => s + (Number(c.monto) || 0), 0)
    // Los dólares que se cambiaron a pesos salen de esta cuenta (la otra pata suma en la de pesos).
    const egresos = movimientosContados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + (m.monto || 0), 0)
      + capitalCuenta.filter(c => c.tipo === 'devolucion').reduce((s, c) => s + (Number(c.monto) || 0), 0)
      + capitalCambios.filter(c => c.cuenta_origen === nombre && esDesdeCorteISO(c.fecha, info.fecha_corte)).reduce((s, c) => s + (Number(c.monto_usd) || 0), 0)
    const saldo = (info.saldo_inicial || 0) + ingresos - egresos
    return { nombre, info, ingresos, egresos, saldo, movimientos }
  }), [cuentas, dolaresMovimientos, capitalMovimientos, capitalCambios])

  // Corte más viejo entre las cuentas configuradas: lo anterior a esto es plata migrada del
  // historial que nunca va a tener cuenta, así que el agente no la reclama.
  const corteMinimoFinanzas = cuentas.length > 0
    ? cuentas.reduce((min, c) => (c.fecha_corte && c.fecha_corte < min ? c.fecha_corte : min), cuentas[0].fecha_corte || FECHA_CORTE_DEFAULT)
    : FECHA_CORTE_DEFAULT

  // Agente de salud financiera: mismo patrón que el agente de cultivo (reglas determinísticas,
  // nunca inventa un dato, siempre señala el registro puntual y quién puede corregirlo). Corre
  // siempre, no solo al entrar a Finanzas, para que el badge de la pestaña esté al día — ver
  // src/agenteFinanzas.js.
  const clavesDescartadas = useMemo(() => new Set(duplicadosDescartados.map(d => d.clave)), [duplicadosDescartados])
  const hallazgosFinanzas = useMemo(() => evaluarFinanzas({
    cuentas, dolaresMovimientos, gastos, presupuestos, aportes,
    pedidoPagos, esquejePagos, insumoPagos, pedidos, esquejes, insumos,
    resumen: resumenCuentas, resumenDolares, corteMinimo: corteMinimoFinanzas,
    cuentasConocidas: CUENTAS, cuentasDolaresConocidas: CUENTAS_DOLARES,
    cuentaEfectivo: CUENTA_EFECTIVO, cuentaEfectivoDolares: CUENTA_EFECTIVO_DOLARES, cuentaHormiguero: CUENTA_HORMIGUERO,
    cuentasValidaciones, cotizacionesDolar, capitalMovimientos, capitalCambios, duplicadosDescartados: clavesDescartadas,
  }, { pesos: formatPesos, dolares: formatDolares, fechaISO: formatFechaISOSinAnio }),
  [cuentas, dolaresMovimientos, gastos, presupuestos, aportes, pedidoPagos, esquejePagos, insumoPagos, pedidos, esquejes, insumos, resumenCuentas, resumenDolares, corteMinimoFinanzas, cuentasValidaciones, cotizacionesDolar, capitalMovimientos, capitalCambios, clavesDescartadas])

  // Llama al mismo RPC que corre el cron diario — botón manual para no depender 100% de que el
  // trigger de fondo funcione en silencio.
  const actualizarCotizacionDolar = useCallback(async () => {
    const { data, error } = await supabase.rpc('actualizar_cotizacion_dolar')
    if (!error && data) setCotizacionesDolar(prev => [data, ...prev.filter(c => c.fecha !== data.fecha)])
    return { ok: !error }
  }, [])

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

  // Insumos: sin catálogo/stock — solo insert/update/delete, sin RPC de ajuste.
  const guardarInsumo = useCallback(async i => {
    const { data, error } = await supabase.from('insumos').insert(insumoToDB(i)).select().single()
    if (error || !data) { console.error('Error al guardar insumo', error); return { ok: false, error } }
    setInsumos(prev => [conAliasPago(data), ...prev])
    return { ok: true, data }
  }, [])

  const actualizarInsumo = useCallback(async actualizado => {
    const { data, error } = await supabase.from('insumos').update(insumoToDB(actualizado)).eq('id', actualizado.id).select().single()
    if (error || !data) { console.error('Error al actualizar insumo', error); return { ok: false, error } }
    setInsumos(prev => prev.map(x => x.id === data.id ? conAliasPago(data) : x))
    return { ok: true }
  }, [])

  const eliminarInsumo = useCallback(async insumo => {
    const { error } = await supabase.from('insumos').delete().eq('id', insumo.id)
    if (!error) {
      setInsumos(prev => prev.filter(x => x.id !== insumo.id))
      setInsumoPagos(prev => prev.filter(pg => pg.insumo_id !== insumo.id))
    }
  }, [])

  const agregarPagoInsumo = useCallback(async (insumo, pago) => {
    const { data, error } = await supabase.from('insumo_pagos').insert({ insumo_id: insumo.id, ...pago }).select().single()
    if (error || !data) { console.error('Error al guardar pago', error); return { ok: false, error } }
    setInsumoPagos(prev => [data, ...prev])
    return { ok: true, data }
  }, [])

  const eliminarPagoInsumo = useCallback(async id => {
    const { error } = await supabase.from('insumo_pagos').delete().eq('id', id)
    if (error) { console.error('Error al eliminar pago', error); return { ok: false, error } }
    setInsumoPagos(prev => prev.filter(pg => pg.id !== id))
    return { ok: true }
  }, [])

  const editarPagoInsumo = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('insumo_pagos').update(cambios).eq('id', id).select().single()
    if (error || !data) { console.error('Error al editar pago', error); return { ok: false, error } }
    setInsumoPagos(prev => prev.map(pg => pg.id === id ? data : pg))
    return { ok: true, data }
  }, [])

  const guardarSocio = useCallback(async s => {
    const { data, error } = await supabase.from('socios').insert({ nombre: s.nombre, fecha_registro_ong: s.fechaRegistroOng }).select().single()
    if (error || !data) { console.error('Error al guardar socio', error); return { ok: false, error } }
    setSocios(prev => [...prev, conAliasSocio(data)].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    return { ok: true, data: conAliasSocio(data) }
  }, [])

  const actualizarSocio = useCallback(async s => {
    const { data, error } = await supabase.from('socios').update({ nombre: s.nombre, fecha_registro_ong: s.fechaRegistroOng }).eq('id', s.id).select().single()
    if (error || !data) { console.error('Error al actualizar socio', error); return { ok: false, error } }
    setSocios(prev => prev.map(x => x.id === data.id ? conAliasSocio(data) : x).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    return { ok: true, data: conAliasSocio(data) }
  }, [])

  const eliminarSocio = useCallback(async s => {
    const { error } = await supabase.from('socios').delete().eq('id', s.id)
    if (error) { console.error('Error al eliminar socio', error); return { ok: false, error } }
    setSocios(prev => prev.filter(x => x.id !== s.id))
    return { ok: true }
  }, [])

  // Desactivar reemplaza al borrado cuando un socio ya tiene historial: preserva el registro
  // (por si vuelve a sumarse más adelante) en vez de perder para siempre a quién perteneció cada
  // membresía. eliminarSocio (borrado real) queda solo para altas sin ninguna compra todavía.
  const desactivarSocio = useCallback(async s => {
    const { data, error } = await supabase.from('socios').update({ activo: false }).eq('id', s.id).select().single()
    if (error || !data) { console.error('Error al desactivar socio', error); return { ok: false, error } }
    setSocios(prev => prev.map(x => x.id === data.id ? conAliasSocio(data) : x))
    return { ok: true, data: conAliasSocio(data) }
  }, [])

  const activarSocio = useCallback(async s => {
    const { data, error } = await supabase.from('socios').update({ activo: true }).eq('id', s.id).select().single()
    if (error || !data) { console.error('Error al activar socio', error); return { ok: false, error } }
    setSocios(prev => prev.map(x => x.id === data.id ? conAliasSocio(data) : x))
    return { ok: true, data: conAliasSocio(data) }
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

  const agregarGeneticaCosecha = useCallback(nombre => agregarGeneticaCatalogo('geneticas_cosecha', nombre, geneticasCosecha, setGeneticasCosecha), [geneticasCosecha])
  const eliminarGeneticaCosecha = useCallback(nombre => eliminarGeneticaCatalogo('geneticas_cosecha', nombre, stock, setGeneticasCosecha), [stock])
  const agregarGeneticaEsquejes = useCallback(nombre => agregarGeneticaCatalogo('geneticas_esquejes', nombre, geneticasEsquejes, setGeneticasEsquejes), [geneticasEsquejes])
  const eliminarGeneticaEsquejes = useCallback(nombre => eliminarGeneticaCatalogo('geneticas_esquejes', nombre, stockEsquejes, setGeneticasEsquejes), [stockEsquejes])

  const guardarGasto = useCallback(async nuevoGasto => {
    const prep = prepararGasto(nuevoGasto, presupuestos)
    if (!prep.ok) return { ok: false, msg: prep.msg }
    const { data, error } = await supabase.from('gastos').insert(prep.gasto).select().single()
    if (error || !data) { console.error('Error al guardar gasto', error); return { ok: false, error, msg: mensajeErrorGasto(error, 'guardar el gasto') } }
    setGastos(prev => [data, ...prev])
    return { ok: true }
  }, [presupuestos])

  const actualizarGasto = useCallback(async gasto => {
    const prep = prepararGasto(gasto, presupuestos)
    if (!prep.ok) return { ok: false, msg: prep.msg }
    const { data, error } = await supabase.from('gastos').update(gastoToDB(prep.gasto)).eq('id', gasto.id).select().single()
    if (error || !data) { console.error('Error al actualizar gasto', error); return { ok: false, error, msg: mensajeErrorGasto(error, 'guardar los cambios') } }
    setGastos(prev => prev.map(g => g.id === data.id ? data : g))
    return { ok: true }
  }, [presupuestos])

  const eliminarGasto = useCallback(async gasto => {
    const { error } = await supabase.from('gastos').delete().eq('id', gasto.id)
    if (error) { console.error('Error al eliminar gasto', error); return { ok: false, error, msg: mensajeErrorGasto(error, 'eliminar el gasto') } }
    setGastos(prev => prev.filter(g => g.id !== gasto.id))
    return { ok: true }
  }, [])

  const miembro = miembroDeSesion(sesion)

  const agregarItemStock = useCallback((categoria, nombre, unidad) => agregarInsumoStock(categoria, nombre, unidad, insumosStock, setInsumosStock), [insumosStock])
  const eliminarItemStock = useCallback(insumo => eliminarInsumoStock(insumo, setInsumosStock), [])
  const editarMinimoStock = useCallback((id, nuevoValor) => editarStockMinimoInsumo(id, nuevoValor, setInsumosStock), [])
  const registrarMovStock = useCallback(payload => registrarMovimientoInsumo({ ...payload, miembro }, setInsumosStock, setInsumosStockMovimientos, setGastos), [miembro])
  const editarActualStock = useCallback((insumo, nuevoValor) => {
    const delta = Number(nuevoValor) - (insumo.stock_actual ?? 0)
    if (!Number.isFinite(delta) || delta === 0) return Promise.resolve({ ok: true })
    return registrarMovimientoInsumo({ insumo, tipo: 'ajuste', cantidad: delta, precioUnitario: null, fecha: hoyISO(), miembro, nota: null, locacion: null }, setInsumosStock, setInsumosStockMovimientos, setGastos)
  }, [miembro])

  const agregarTarea = useCallback(async ({ descripcion, tipo, prioridad, asignado_a, fecha_limite, locacion }) => {
    const { data, error } = await supabase.from('tareas').insert({ descripcion, tipo, prioridad, asignado_a: asignado_a || null, fecha_limite: fecha_limite || null, locacion, creado_por: miembro || null }).select().single()
    if (error || !data) { console.error('Error al guardar tarea', error); return { ok: false, error } }
    setTareas(prev => [...prev, data])
    return { ok: true, data }
  }, [miembro])

  const marcarTareaEstado = useCallback(async (id, estado) => {
    const cambios = estado === 'hecha'
      ? { estado, resuelto_por: miembro || null, resuelto_en: new Date().toISOString() }
      : { estado, resuelto_por: null, resuelto_en: null }
    const { data, error } = await supabase.from('tareas').update(cambios).eq('id', id).select().single()
    if (error || !data) { console.error('Error al actualizar tarea', error); return { ok: false, error } }
    setTareas(prev => prev.map(t => t.id === id ? data : t))
    return { ok: true, data }
  }, [miembro])

  // Edición completa de una tarea ya cargada (descripción, tipo, asignado, prioridad, fecha
  // límite, Hormi) — los CHECK y la FK de tipo de la base siguen siendo la red de seguridad.
  const editarTarea = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('tareas').update(cambios).eq('id', id).select().single()
    if (error || !data) { console.error('Error al editar tarea', error); return { ok: false, error } }
    setTareas(prev => prev.map(t => t.id === id ? data : t))
    return { ok: true, data }
  }, [])

  const eliminarTarea = useCallback(async id => {
    const { error } = await supabase.from('tareas').delete().eq('id', id)
    if (error) { console.error('Error al eliminar tarea', error); return { ok: false, error } }
    setTareas(prev => prev.filter(t => t.id !== id))
    return { ok: true }
  }, [])

  // ── Capital (Finanzas → Capital) ──
  const guardarCapital = useCallback(async mov => {
    const { data, error } = await supabase.from('capital_movimientos').insert({ ...mov, creado_por: miembro || null }).select().single()
    if (error || !data) { console.error('Error al guardar movimiento de capital', error); return { ok: false, error, msg: mensajeErrorCapital(error) } }
    setCapitalMovimientos(prev => [data, ...prev])
    return { ok: true, data }
  }, [miembro])

  const actualizarCapital = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('capital_movimientos').update(cambios).eq('id', id).select().single()
    if (error || !data) {
      console.error('Error al actualizar movimiento de capital', error)
      return { ok: false, error, msg: mensajeErrorCapital(error) }
    }
    setCapitalMovimientos(prev => prev.map(c => c.id === id ? data : c))
    return { ok: true, data }
  }, [])

  const eliminarCapital = useCallback(async id => {
    const { error } = await supabase.from('capital_movimientos').delete().eq('id', id)
    if (error) { console.error('Error al eliminar movimiento de capital', error); return { ok: false, error, msg: mensajeErrorCapital(error) } }
    setCapitalMovimientos(prev => prev.filter(c => c.id !== id))
    return { ok: true }
  }, [])

  // Cambios a pesos de un aporte en dólares (capital_cambios). El tope (no cambiar más de lo
  // aportado) lo pone el trigger capital_cambios_validar; mensajeErrorCapital lo pasa a criollo.
  const guardarCambioCapital = useCallback(async cambio => {
    const { data, error } = await supabase.from('capital_cambios').insert({ ...cambio, creado_por: miembro || null }).select().single()
    if (error || !data) { console.error('Error al guardar cambio a pesos', error); return { ok: false, error, msg: mensajeErrorCapital(error) } }
    setCapitalCambios(prev => [data, ...prev])
    return { ok: true, data }
  }, [miembro])

  const actualizarCambioCapital = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('capital_cambios').update(cambios).eq('id', id).select().single()
    if (error || !data) { console.error('Error al actualizar cambio a pesos', error); return { ok: false, error, msg: mensajeErrorCapital(error) } }
    setCapitalCambios(prev => prev.map(c => c.id === id ? data : c))
    return { ok: true, data }
  }, [])

  const eliminarCambioCapital = useCallback(async id => {
    const { data, error } = await supabase.from('capital_cambios').delete().eq('id', id).select()
    if (error) { console.error('Error al eliminar cambio a pesos', error); return { ok: false, error, msg: mensajeErrorCapital(error) } }
    setCapitalCambios(prev => prev.filter(c => c.id !== id))
    return { ok: true, yaNoEstaba: !data || data.length === 0 }
  }, [])

  // El aporte y sus cambios tal como están en la base, no en esta pantalla (otro puede haber
  // cargado un cambio mientras tanto). De paso pone al día lo que se ve de ese aporte.
  const consultarAporteEnBase = useCallback(async aporteId => {
    const [aporteRes, cambiosRes] = await Promise.all([
      supabase.from('capital_movimientos').select('*').eq('id', aporteId).maybeSingle(),
      traerTodo(o => supabase.from('capital_cambios').select('*', o).eq('aporte_id', aporteId).order('id')),
    ])
    if (aporteRes.error || cambiosRes.error) return { ok: false }
    if (aporteRes.data) setCapitalMovimientos(prev => prev.map(c => c.id === aporteRes.data.id ? aporteRes.data : c))
    setCapitalCambios(prev => [...cambiosRes.data, ...prev.filter(c => Number(c.aporte_id) !== Number(aporteId))])
    return { ok: true, aporte: aporteRes.data, cambios: cambiosRes.data }
  }, [])

  // ── "No es duplicado" en Registros a revisar ──
  const descartarDuplicado = useCallback(async clave => {
    const { data, error } = await supabase.from('duplicados_descartados').insert({ clave, descartado_por: miembro || null }).select().single()
    // 23505 = otro ya lo marcó en paralelo (clave única): para esta pantalla da lo mismo.
    if (error && error.code !== '23505') { console.error('Error al descartar duplicado', error); return { ok: false, error } }
    setDuplicadosDescartados(prev => prev.some(d => d.clave === clave) ? prev : [data || { clave, descartado_por: miembro || null }, ...prev])
    return { ok: true }
  }, [miembro])

  const restaurarDuplicado = useCallback(async clave => {
    const { error } = await supabase.from('duplicados_descartados').delete().eq('clave', clave)
    if (error) { console.error('Error al restaurar duplicado', error); return { ok: false, error } }
    setDuplicadosDescartados(prev => prev.filter(d => d.clave !== clave))
    return { ok: true }
  }, [])

  const agregarTareaTipo = useCallback(nombre => agregarGeneticaCatalogo('tareas_tipos', nombre, tareasTipos, setTareasTipos), [tareasTipos])
  // No hay una cantidad tipo "stock" que chequear del lado cliente para un tipo de
  // tarea — el trigger de la base (bloquear_borrado_tareas_tipos) es la única red
  // de seguridad real, por eso se le pasa un mapa vacío.
  const eliminarTareaTipo = useCallback(nombre => eliminarGeneticaCatalogo('tareas_tipos', nombre, {}, setTareasTipos), [])

  // Tareas pendientes relevantes para quien está mirando la pantalla: asignadas a mí,
  // o sin asignar (las puede tomar cualquiera) — misma lista alimenta el badge de la
  // pestaña y el modal de aviso al entrar.
  const tareasRelevantes = useMemo(
    () => ordenarTareas(tareas.filter(t => t.estado === 'pendiente' && (t.asignado_a === miembro || !t.asignado_a))),
    [tareas, miembro]
  )

  // Disparo del modal: una vez por día por persona (la sesión de Supabase persiste
  // días, así que atarlo al login real casi no se repetiría). Se guarda por dispositivo
  // en localStorage, envuelto en try/catch por si el storage no está disponible.
  useEffect(() => {
    if (!miembro || tareasRelevantes.length === 0) return
    const clave = `tareas_modal_visto_${miembro}`
    const hoy = hoyISO()
    try {
      if (localStorage.getItem(clave) === hoy) return
      localStorage.setItem(clave, hoy)
    } catch {}
    setMostrarModalTareas(true)
  }, [miembro, tareasRelevantes])

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
          <button className={`tab${tab === 'pedidos' ? ' active' : ''}`} onClick={() => irATab('pedidos')}>Ventas</button>
          <button className={`tab${tab === 'gastos' ? ' active' : ''}`} onClick={() => irATab('gastos')}>Gastos</button>
          <button className={`tab${tab === 'finanzas' ? ' active' : ''}`} onClick={() => irATab('finanzas')}>
            Finanzas
            {hallazgosFinanzas.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: hallazgosFinanzas.some(h => h.severidad === 'error') ? '#791F1F' : '#854F0B', color: 'white', fontSize: 10, fontWeight: 700, marginLeft: 5, lineHeight: 1 }}>
                {hallazgosFinanzas.length}
              </span>
            )}
          </button>
          <button className={`tab${tab === 'cultivo' ? ' active' : ''}`} onClick={() => irATab('cultivo')}>Cultivo</button>
          <button className={`tab${tab === 'stock' ? ' active' : ''}`} onClick={() => irATab('stock')}>Stock</button>
          <button className={`tab${tab === 'tareas' ? ' active' : ''}`} onClick={() => irATab('tareas')}>
            Tareas
            {tareasRelevantes.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: tareasRelevantes.some(t => t.prioridad === 'alta') ? '#791F1F' : '#854F0B', color: 'white', fontSize: 10, fontWeight: 700, marginLeft: 5, lineHeight: 1 }}>
                {tareasRelevantes.length}
              </span>
            )}
          </button>
        </div>
      </div>
      {tab === 'pedidos' && (
        <TabVentas
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
          insumos={insumos}
          onGuardarInsumo={guardarInsumo}
          onActualizarInsumo={actualizarInsumo}
          onEliminarInsumo={eliminarInsumo}
          insumoPagos={insumoPagos}
          onAgregarPagoInsumo={agregarPagoInsumo}
          onEditarPagoInsumo={editarPagoInsumo}
          onEliminarPagoInsumo={eliminarPagoInsumo}
          miembro={miembro}
          ajustesFallidos={stockAjustesFallidos}
          onEditarStock={editarStock}
          onEditarStockEsquejes={editarStockEsquejes}
          onEditarInicial={editarInicial}
          onEditarInicialEsquejes={editarInicialEsquejes}
          geneticasCosecha={geneticasCosecha}
          geneticasEsquejes={geneticasEsquejes}
          onAgregarGeneticaCosecha={agregarGeneticaCosecha}
          onEliminarGeneticaCosecha={eliminarGeneticaCosecha}
          onAgregarGeneticaEsquejes={agregarGeneticaEsquejes}
          onEliminarGeneticaEsquejes={eliminarGeneticaEsquejes}
          pedidoPagos={pedidoPagos}
          esquejePagos={esquejePagos}
          onAgregarPagoPedido={agregarPagoPedido}
          onEditarPagoPedido={editarPagoPedido}
          onEliminarPagoPedido={eliminarPagoPedido}
          onAgregarPagoEsqueje={agregarPagoEsqueje}
          onEditarPagoEsqueje={editarPagoEsqueje}
          onEliminarPagoEsqueje={eliminarPagoEsqueje}
          socios={socios}
          onGuardarSocio={guardarSocio}
          onActualizarSocio={actualizarSocio}
          onEliminarSocio={eliminarSocio}
          onActivarSocio={activarSocio}
          onDesactivarSocio={desactivarSocio}
        />
      )}
      {tab === 'gastos' && <TabGastos target={objetivoRevision} miembro={miembro} gastos={gastos} presupuestos={presupuestos} onGuardarGasto={guardarGasto} onActualizarGasto={actualizarGasto} onEliminarGasto={eliminarGasto} />}
      {tab === 'finanzas' && <TabFinanzas onRevisar={irARevisar} pedidos={pedidos} esquejes={esquejes} insumos={insumos} miembro={miembro} gastos={gastos} presupuestos={presupuestos} setPresupuestos={setPresupuestos} aportes={aportes} setAportes={setAportes} gastosFijos={gastosFijos} setGastosFijos={setGastosFijos} pedidoPagos={pedidoPagos} esquejePagos={esquejePagos} insumoPagos={insumoPagos} cuentas={cuentas} setCuentas={setCuentas} dolaresMovimientos={dolaresMovimientos} setDolaresMovimientos={setDolaresMovimientos} cuentasValidaciones={cuentasValidaciones} setCuentasValidaciones={setCuentasValidaciones} cotizacionesDolar={cotizacionesDolar} onActualizarCotizacion={actualizarCotizacionDolar} resumen={resumenCuentas} resumenDolares={resumenDolares} hallazgosFinanzas={hallazgosFinanzas} capitalMovimientos={capitalMovimientos} onGuardarCapital={guardarCapital} onActualizarCapital={actualizarCapital} onEliminarCapital={eliminarCapital} capitalCambios={capitalCambios} onGuardarCambioCapital={guardarCambioCapital} onActualizarCambioCapital={actualizarCambioCapital} onEliminarCambioCapital={eliminarCambioCapital} onConsultarAporte={consultarAporteEnBase} duplicadosDescartados={duplicadosDescartados} onDescartarDuplicado={descartarDuplicado} onRestaurarDuplicado={restaurarDuplicado} />}
      {tab === 'cultivo' && <TabCultivo />}
      {tab === 'stock' && (
        <TabStock
          insumosStock={insumosStock}
          insumosStockMovimientos={insumosStockMovimientos}
          onAgregarItem={agregarItemStock}
          onEliminarItem={eliminarItemStock}
          onEditarMinimo={editarMinimoStock}
          onEditarActual={editarActualStock}
          onRegistrarMovimiento={registrarMovStock}
        />
      )}
      {tab === 'tareas' && (
        <TabTareas
          tareas={tareas}
          tareasTipos={tareasTipos}
          onAgregarTarea={agregarTarea}
          onMarcarEstado={marcarTareaEstado}
          onEliminarTarea={eliminarTarea}
          onAgregarTipo={agregarTareaTipo}
          onEliminarTipo={eliminarTareaTipo}
          onEditarTarea={editarTarea}
        />
      )}
      {mostrarCambiarPass && <ModalCambiarPassword onCerrar={() => setMostrarCambiarPass(false)} />}
      {mostrarModalTareas && (
        <ModalTareasPendientes
          tareas={tareasRelevantes}
          onMarcarEstado={marcarTareaEstado}
          onVerTodas={() => { setMostrarModalTareas(false); irATab('tareas') }}
          onCerrar={() => setMostrarModalTareas(false)}
        />
      )}
    </div>
  )
}
