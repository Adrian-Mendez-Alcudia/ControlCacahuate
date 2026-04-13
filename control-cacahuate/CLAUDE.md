# ControlCacahuate

App de punto de venta (POS) para negocio de cacahuates. Angular 17 + Firebase (Firestore + Auth). PWA con service worker.

## Comandos esenciales

```bash
npm start          # Dev server en http://localhost:4200
npm run deploy     # Build producción + deploy a Firebase Hosting
npm run build      # Solo build producción (dist/control-cacahuate/browser/)
```

## Firebase

- **Proyecto:** `control-cacahuate-app`
- **Hosting URL:** https://control-cacahuate-app.web.app
- **Base de datos:** Firestore
- **Auth:** Firebase Auth
- Para deploy necesitas tener `firebase-tools` instalado globalmente: `npm install -g firebase-tools`

## Estructura del proyecto

```
src/app/
  core/
    models/interfaces.ts        # Todos los tipos/interfaces (Venta, Cliente, Sabor, etc.)
    services/                   # Servicios Firebase (ventas, clientes, inventario, etc.)
    utils/calculos.utils.ts     # Lógica de cálculos
    handlers/                   # Error handler global
  features/
    pos/                        # Punto de venta principal (ruta default)
    dashboard/                  # Resumen de ventas
    clientes/                   # Gestión de clientes y cuentas
    produccion/                 # Registro de lotes de producción
    corte-caja/                 # Corte diario de caja
    configuracion/              # Config del negocio (precio default, nombre, etc.)
  shared/
    components/                 # bottom-nav, skeleton, toast
```

## Rutas

| Ruta | Componente |
|---|---|
| `/` → `/pos` | POS principal |
| `/pos` | Punto de venta |
| `/dashboard` | Dashboard de ventas |
| `/clientes` | Clientes y cuentas por cobrar |
| `/produccion` | Registro de producción |
| `/corte-caja` | Corte de caja diario |
| `/configuracion` | Configuración |

## Modelos principales

- **Sabor** — producto (cacahuate con variante)
- **LoteProduccion** — registro de producción con costo por kilo
- **Inventario** — stock por sabor con costo promedio ponderado
- **Cliente** — cliente con saldo pendiente (ventas fiadas)
- **Venta** — venta individual (`efectivo` o `fiado`), agrupadas por `transactionId`
- **Abono** — pago de cliente a cuenta fiada
- **CajaDiaria** — acumulado del día (efectivo, fiado, costos)
- **CorteDeCaja** — corte manual con monto contado vs esperado

## Notas

- Las ventas se agrupan por `transactionId` para formar "tickets"
- El POS maneja carrito temporal antes de confirmar venta
- El corte de caja requiere capturar el efectivo físico contado
- `app.config.ts` tiene Firebase config hardcodeada (no usa environment) — comentario en el archivo lo explica
