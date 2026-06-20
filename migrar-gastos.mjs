import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

function parseCSVLine(line) {
  const result = []
  let current = "", inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = "" }
    else current += ch
  }
  result.push(current.trim())
  return result
}

function parsearMonto(val) {
  if (!val) return 0
  return parseFloat(val.replace(/[\$\s,]/g, "")) || 0
}

function normalizarCategoria(cat) {
  if (!cat) return "Insumos varios"
  const c = cat.trim()
  if (c === "Hormi 2.0") return "Insumos varios"
  const mapa = {
    "Alquiler":"Alquiler","Servicios":"Servicios","Insumos Indoor":"Insumos cultivo",
    "Insumos varios":"Insumos varios","Gastos estructurales":"Gastos estructurales",
    "Publicidad y cursos":"Marketing","Envios/viajes":"Insumos varios","Envíos/viajes":"Insumos varios",
    "Otros gastos":"Insumos varios","Otros Gastos":"Insumos varios",
    "Bonos":"Bonos comisión directiva","Inversión inicial":"Inversiones"
  }
  return mapa[c] || "Insumos varios"
}

const MESES_NOMBRE = {
  "enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,
  "julio":7,"agosto":8,"septiembre":9,"octubre":10,"noviembre":11,"diciembre":12
}

const texto = readFileSync("./gastos.csv", "utf-8")
const lineas = texto.split("\n").map(l => l.replace(/\r/g,""))

let anioActual = 2025, mesActualNum = 1
const gastos = []

for (const linea of lineas) {
  const cols = parseCSVLine(linea)
  const col0 = cols[0]?.trim(), col1 = cols[1]?.trim()
  const col2 = cols[2]?.trim(), col5 = cols[5]?.trim()

  if (col0 === "2025") { anioActual = 2025; continue }
  if (col0 === "2026") { anioActual = 2026; continue }
  const mesNombre = col0?.toLowerCase()
  if (MESES_NOMBRE[mesNombre]) { mesActualNum = MESES_NOMBRE[mesNombre]; continue }
  if (!col0 || !col1) continue
  const partes = col0.split("/")
  if (partes.length < 2) continue
  const diaNum = parseInt(partes[0]), mesNum = parseInt(partes[1])
  if (isNaN(diaNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) continue
  const monto = parsearMonto(col2)
  if (!monto || monto <= 0) continue

  const locacion = col5 === "Hormi 2.0" ? "Hormi 2.0" : "Hormi 1.0"
  const categoria = normalizarCategoria(col5)
  let anio = anioActual
  if (mesNum > mesActualNum + 2) anio = anioActual - 1
  const mes = `${mesNum}/${anio}`
  const fecha = `${diaNum}/${mesNum}/${anio}`

  gastos.push({ fecha, descripcion: col1, monto, categoria, locacion, mes })
}

console.log(`Total: ${gastos.length} gastos a migrar`)
console.log(`Hormi 1.0: ${gastos.filter(g => g.locacion === "Hormi 1.0").length}`)
console.log(`Hormi 2.0: ${gastos.filter(g => g.locacion === "Hormi 2.0").length}`)

let insertados = 0
for (let i = 0; i < gastos.length; i += 50) {
  const lote = gastos.slice(i, i + 50)
  const { data, error } = await supabase.from("gastos").insert(lote).select()
  if (error) { console.error(`Error lote ${i}:`, error.message); continue }
  insertados += data.length
  console.log(`Lote ${Math.floor(i/50)+1}: ${data.length} insertados`)
}
console.log(`\n✓ ${insertados} gastos migrados`)
