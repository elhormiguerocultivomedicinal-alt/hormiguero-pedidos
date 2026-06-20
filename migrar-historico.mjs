import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

function parsearMiembro(f) {
  if (!f) return "Hormi"
  const fl = f.toLowerCase()
  if (fl.includes("checho")) return "Checho"
  if (fl.includes("nacho")) return "Nacho"
  if (fl.includes("nico")) return "Nico"
  return "Hormi"
}
function esPropio(f, precio) {
  if (!f) return false
  const fl = f.toLowerCase()
  return parseFloat(precio) === 0 && (fl.includes("propio") || fl.includes("regalo"))
}
function normalizarGenetica(gen) {
  if (!gen) return null
  const g = gen.trim().toUpperCase()
  const mapa = {"OG24K":"OG24K","CHOCO OG":"Choco OG","Z-KIEM":"Z-Kiem","FANCY":"Fancy","GORILLA R.":"Gorilla Rainbow","GORILLA R":"Gorilla Rainbow","TROPICANA":"Tropicana","GUARANI":"Guaraní","NUCLEO UNO":"Núcleo Uno","CANNPAT ONE":"Cannpat One","MENDOCINO":"Mendocino"}
  return mapa[g] || gen.trim()
}
function inferirAnio(mesNum, archivoAnio, archivoMes) {
  return mesNum > archivoMes ? archivoAnio - 1 : archivoAnio
}
function parsearCSV(texto) {
  return texto.split("\n").map(l => l.replace(/\r/g, "").split(","))
}
function procesarFilas(filas, archivoMes, archivoAnio) {
  const grupos = {}
  for (const fila of filas) {
    const fecha = fila[0]?.trim(), socio = fila[1]?.trim(), geneticaRaw = fila[2]?.trim()
    const cantidad = fila[3]?.trim(), precio = fila[4]?.trim(), total = fila[5]?.trim()
    const estadoPago = fila[6]?.trim(), fechaCobro = fila[7]?.trim(), metodoPago = fila[8]?.trim()
    const facturacion = fila[9]?.trim(), estadoPedido = fila[10]?.trim()
    if (!fecha || !socio || !geneticaRaw || !cantidad || isNaN(parseFloat(cantidad))) continue
    if (socio.toLowerCase().includes("cosecha") || socio.toLowerCase().includes("total")) continue
    const genetica = normalizarGenetica(geneticaRaw)
    if (!genetica) continue
    const partes = fecha.split("/")
    const mesNum = parseInt(partes[1])
    if (isNaN(mesNum)) continue
    const anio = inferirAnio(mesNum, archivoAnio, archivoMes)
    const mes = `${mesNum}/${anio}`
    const miembro = parsearMiembro(facturacion)
    const propio = esPropio(facturacion, precio)
    const pagado = estadoPago === "Pagado"
    const entregado = estadoPedido === "Entregado"
    const key = `${fecha}|${socio}|${miembro}|${mes}`
    if (!grupos[key]) {
      grupos[key] = { fecha: fecha.trim(), mes, miembro, socio, geneticas: [], precio: parseFloat(precio)||0, total: 0, propio, pagado, metodo_pago: null, fecha_cobro: null, entregado }
    }
    grupos[key].geneticas.push({ nombre: genetica, cantidad })
    grupos[key].total += parseFloat(total)||0
    if (pagado) grupos[key].pagado = true
    if (entregado) grupos[key].entregado = true
    if (parseFloat(precio)>0) grupos[key].precio = parseFloat(precio)
    if (metodoPago && metodoPago !== "-" && metodoPago !== "") grupos[key].metodo_pago = metodoPago
    if (fechaCobro && fechaCobro !== "-" && fechaCobro !== "") grupos[key].fecha_cobro = fechaCobro
  }
  return Object.values(grupos)
}

const archivos = [
  { path: "./Cosechas_-_Julio_25.csv", mes: 7, anio: 2025 },
  { path: "./Cosechas_-_Noviembre_25.csv", mes: 11, anio: 2025 },
  { path: "./Cosechas_-_Febrero_26.csv", mes: 2, anio: 2026 },
]

let todos = []
for (const a of archivos) {
  const texto = readFileSync(a.path, "utf-8")
  const pedidos = procesarFilas(parsearCSV(texto).slice(1), a.mes, a.anio)
  console.log(`${a.path}: ${pedidos.length} pedidos`)
  todos = todos.concat(pedidos)
}
console.log(`\nTotal: ${todos.length} pedidos a migrar`)

let insertados = 0
for (let i = 0; i < todos.length; i += 50) {
  const lote = todos.slice(i, i + 50)
  const { data, error } = await supabase.from("pedidos").insert(lote).select()
  if (error) { console.error(`Error lote ${i}:`, error.message); continue }
  insertados += data.length
  console.log(`Lote ${Math.floor(i/50)+1}: ${data.length} insertados`)
}
console.log(`\n✓ ${insertados} pedidos migrados`)
