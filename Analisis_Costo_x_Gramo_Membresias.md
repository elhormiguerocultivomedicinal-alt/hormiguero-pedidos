# Costo por gramo real — impacto en membresías

Fecha: 2026-07-26

## Metodología

- Cada ciclo se definió como los **4 meses calendario previos a la cosecha** (aproximación al ciclo de cultivo, no exacto al día de cosecha).
- Marzo-Mayo 2026 se tomó del CSV backup (`gastos.csv`); Junio 2026 se tomó de la tabla `gastos` en vivo (Supabase) y no del CSV, porque el CSV y la app tienen las mismas filas de junio duplicadas — usar ambas habría inflado el número.
- El gasto "Alquiler Junio" figura en la app con fecha 4/7, pero corresponde a junio, así que se contó en junio.
- Se unificó "Insumos Indoor" (nombre viejo, usado en el CSV) con "Insumos cultivo" (nombre nuevo, usado en la app) — es la misma categoría.
- Stock y producción salen únicamente de Hormi 1.0 (centro de producción). Hormi 2.0 por ahora solo genera gastos (está en obra/proceso).

## Costo por gramo real

| | Sin Hormi 2.0 (ciclo Nov25→Feb26, cosecha 1810g) | Con Hormi 2.0 (ciclo Mar→Jun26, cosecha 1945g) |
|---|---|---|
| **Acotado** (Servicios + Insumos cultivo + Alquiler) | $2.583/g | $2.525/g |
| **General** (todos los gastos, cualquier categoría) | $3.516/g | $5.256/g |

**Lectura:** el costo *acotado* de cultivo casi no se mueve al sumar Hormi 2.0 ($2.583 → $2.525/g), porque todavía no genera gastos de servicios ni insumos de cultivo. Pero el costo *general* (todo incluido) sube 49% ($3.516 → $5.256/g), porque los gastos de puesta en marcha de Hormi 2.0 (insumos varios, obra/estructurales, comida) sí entran ahí.

## Margen de las membresías contra estos costos

Margen = (precio de venta − costo) / precio de venta

| Membresía | Costo acotado | Costo general (con Hormi 2.0) |
|---|---|---|
| A — $11.500/g promedio | 78% | 54% |
| B — $10.500/g promedio | 76% | 50% |
| C — $9.500/g promedio | 73% | 45% |
| D — $8.500/g promedio | 70% | 38% |
| **D marginal — últimos 5g a $5.500/g** | **54%** | **4%** |

## Punto crítico

Si se cuentan **todos** los gastos de la ONG (incluida la inversión en Hormi 2.0), los últimos 5 gramos de la membresía D casi no dejan margen — **4%**. Si solo se mira el costo directo de cultivo, esos mismos gramos dejan **54%**. La diferencia es, literalmente, cuánto de la expansión a Hormi 2.0 se le carga al precio del socio.

## Pendiente de decisión
- [ ] Definir si el costo de referencia para fijar precios es el "acotado" (cultivo puro) o el "general" (todo incluido, con Hormi 2.0)
- [ ] Con eso resuelto, confirmar montos finales de las 4 membresías
- [ ] Construir el archivo HTML con las membresías definitivas
