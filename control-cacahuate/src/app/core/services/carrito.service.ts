import { Injectable, computed, signal, effect } from '@angular/core';
import { Sabor } from '../models/interfaces';

export interface ItemCarrito {
  sabor: Sabor;
  cantidad: number;
  precioVenta: number;
  subtotal: number; // Agregamos esto para facilitar la vista
}

@Injectable({
  providedIn: 'root',
})
export class CarritoService {
  // Estado reactivo (Signal)
  private _carrito = signal<ItemCarrito[]>([]);

  // Exponemos el valor como solo lectura
  readonly carrito = this._carrito.asReadonly();

  // Cálculos automáticos (Computed Signals)
  readonly total = computed(() =>
    this._carrito().reduce((acc, item) => acc + item.subtotal, 0)
  );

  readonly cantidadItems = computed(() =>
    this._carrito().reduce((acc, item) => acc + item.cantidad, 0)
  );

  constructor() {
    this.cargarDeStorage();

    // Effect: Se ejecuta automáticamente cada vez que _carrito cambia
    effect(() => {
      this.guardarEnStorage(this._carrito());
    });
  }

  /**
   * Agrega un item al carrito o incrementa su cantidad
   */
  agregarItem(sabor: Sabor, precioVenta: number, stockDisponible: number) {
    this._carrito.update((items) => {
      const itemExistente = items.find((i) => i.sabor.id === sabor.id);

      // Validación de stock (doble seguridad)
      const cantidadActual = itemExistente ? itemExistente.cantidad : 0;
      if (cantidadActual >= stockDisponible) {
        return items; // No hacemos cambios si no hay stock
      }

      if (itemExistente) {
        // Actualizamos cantidad y subtotal del item existente
        return items.map((i) =>
          i.sabor.id === sabor.id
            ? {
                ...i,
                cantidad: i.cantidad + 1,
                subtotal: (i.cantidad + 1) * i.precioVenta,
              }
            : i
        );
      } else {
        // Agregamos nuevo item
        return [
          ...items,
          {
            sabor,
            cantidad: 1,
            precioVenta,
            subtotal: precioVenta,
          },
        ];
      }
    });
  }

  /**
   * Resta un item o lo elimina si llega a 0
   */
  restarItem(saborId: string) {
    this._carrito.update((items) => {
      const itemExistente = items.find((i) => i.sabor.id === saborId);
      if (!itemExistente) return items;

      if (itemExistente.cantidad > 1) {
        return items.map((i) =>
          i.sabor.id === saborId
            ? {
                ...i,
                cantidad: i.cantidad - 1,
                subtotal: (i.cantidad - 1) * i.precioVenta,
              }
            : i
        );
      } else {
        // Filtramos para eliminar
        return items.filter((i) => i.sabor.id !== saborId);
      }
    });
  }

  /**
   * Obtiene la cantidad de un producto específico en el carrito
   */
  obtenerCantidad(saborId: string): number {
    const item = this._carrito().find((i) => i.sabor.id === saborId);
    return item ? item.cantidad : 0;
  }

  /**
   * Vacía el carrito
   */
  limpiarCarrito() {
    this._carrito.set([]);
  }

  // ==========================================
  // PERSISTENCIA (LocalStorage)
  // ==========================================

  private guardarEnStorage(items: ItemCarrito[]) {
    try {
      localStorage.setItem('carrito_cacahuate', JSON.stringify(items));
    } catch (e) {
      console.error('Error guardando carrito', e);
    }
  }

  private cargarDeStorage() {
    try {
      const guardado = localStorage.getItem('carrito_cacahuate');
      if (guardado) {
        this._carrito.set(JSON.parse(guardado));
      }
    } catch (e) {
      console.error('Error cargando carrito', e);
      // Si falla (ej. datos corruptos), limpiamos
      localStorage.removeItem('carrito_cacahuate');
    }
  }
}
