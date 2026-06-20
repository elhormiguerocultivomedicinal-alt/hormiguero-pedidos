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
  const g = gen.trim().toLowerCase()
  if (g.includes("gorilla banana")) return null
  if (g.includes("gorilla")) return "Gorilla Rainbow"
  if (g === "og24k") return "OG24K"
  if (g === "r-kiem" || g === "z-kiem") return "Z-Kiem"
  if (g === "fancy" || g === "funcy") return "Fancy"
  if (g === "mendocino") return "Mendocino"
  if (g === "tropicana") return "Tropicana"
  if (g.includes("guaraní") || g.includes("guarani")) return "Guaraní"
  if (g.includes("nucleo") || g.includes("núcleo")) return "Núcleo Uno"
  if (g.includes("cannpat")) return "Cannpat One"
  if (g.includes("choco")) return "Choco OG"
  return null
}

const texto = readFileSync("./Cosechas_-_Abril_25.csv", "utf-8")
const lineas = texto.split("\n").map(l => l.replace(/\r/g, ""))
let headerIdx = -1
for (let i = 0; i < lineas.length; i++) {
  if (lineas[i].includes("Fecha Pago") && lineas[i].includes("Pedido")) { headerIdx = i; break }
}
const filas = lineas.slice(headerIdx + 1)
const grupos = {}

for (const fila of filas) {
  const cols = fila.split(",")
  const fecha = cols[0]?.trim(), socio = cols[1]?.trim(), geneticaRaw = cols[2]?.trim()
  const cantidad = cols[3]?.trim(), precio = cols[4]?.trim(), total = cols[5]?.trim()
  const estadoPago = cols[6]?.trim(), facturacion = cols[7]?.trim()
  if (!fecha || !socio || !geneticaRaw || !cantidad || isNaN(parseFloat(cantidad))) continue
  if (!fecha.includes("/")) continue
  const genetica = normalizarGenetica(geneticaRaw)
  if (!genetica) continue
  const partes = fecha.split("/")
  const mesNum = parseInt(partes[1])
  if (isNaN(mesNum)) continue
  const mes = `${mesNum}/2025`
  const miembro = parsearMiembro(facturacion)
  const propio = esPropio(facturacion, precio)
  const pagado = estadoPago === "Pagado"
  const key = `${fecha}|${socio}|${miembro}|${mes}`
  if (!grupos[key]) {
    grupos[key] = { fecha, mes, miembro, socio, geneticas: [], precio: parseFloat(precio)||0, total: 0, propio, pagado, metodo_pago: null, fecha_cobro: null, entregado: true }
  }
  grupos[key].geneticas.push({ nombre: genetica, cantidad })
  grupos[key].total += parseFloat(total)||0
  if (pagado) grupos[key].pagado = true
  if (parseFloat(precio)>0) grupos[key].precio = parseFloat(precio)
}

const pedidos = Object.values(grupos)
console.log(`Total: ${pedidos.length} pedidos a migrar`)

let insertados = 0
for (let i = 0; i < pedidos.length; i += 50) {
  const lote = pedidos.slice(i, i + 50)
  const { data, error } = await supabase.from("pedidos").insert(lote).select()
  if (error) { console.error(`Error lote ${i}:`, error.message); continue }
  insertados += data.length
  console.log(`Lote ${Math.floor(i/50)+1}: ${data.length} insertados`)
}
console.log(`\n✓ ${insertados} pedidos migrados`)
