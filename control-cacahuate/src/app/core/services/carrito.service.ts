import { Injectable, computed, signal } from '@angular/core';
import { Sabor } from '../models/interfaces';

// Definimos la interfaz del Item aquí para que sea consistente
export interface ItemCarrito {
  sabor: Sabor; // Guardamos el sabor base
  cantidad: number;
  precioVenta: number;
}

@Injectable({
  providedIn: 'root',
})
export class CarritoService {
  // Signal privado para el estado
  private _carrito = signal<ItemCarrito[]>([]);

  // Selectores públicos (solo lectura)
  readonly carrito = computed(() => this._carrito());

  readonly total = computed(() =>
    this._carrito().reduce(
      (acc, item) => acc + item.cantidad * item.precioVenta,
      0
    )
  );

  readonly cantidadItems = computed(() =>
    this._carrito().reduce((acc, item) => acc + item.cantidad, 0)
  );

  constructor() {
    this.cargarDeStorage();
  }

  // Aceptamos el Sabor base y los datos de venta por separado
  agregarItem(sabor: Sabor, precioVenta: number, stockDisponible: number) {
    this._carrito.update((items) => {
      const itemExistente = items.find((i) => i.sabor.id === sabor.id);
      const cantidadActual = itemExistente ? itemExistente.cantidad : 0;

      // Validación de seguridad (aunque el componente ya valida, doble check no sobra)
      if (cantidadActual >= stockDisponible) {
        return items;
      }

      if (itemExistente) {
        // Actualizamos inmutablemente
        return items.map((i) =>
          i.sabor.id === sabor.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      } else {
        // Agregamos nuevo
        return [...items, { sabor, cantidad: 1, precioVenta }];
      }
    });
    this.guardarEnStorage();
  }

  restarItem(saborId: string) {
    this._carrito.update((items) => {
      const itemExistente = items.find((i) => i.sabor.id === saborId);
      if (!itemExistente) return items;

      if (itemExistente.cantidad > 1) {
        return items.map((i) =>
          i.sabor.id === saborId ? { ...i, cantidad: i.cantidad - 1 } : i
        );
      } else {
        return items.filter((i) => i.sabor.id !== saborId);
      }
    });
    this.guardarEnStorage();
  }

  limpiarCarrito() {
    this._carrito.set([]);
    this.guardarEnStorage();
  }

  obtenerCantidad(saborId: string): number {
    const item = this._carrito().find((i) => i.sabor.id === saborId);
    return item ? item.cantidad : 0;
  }

  private guardarEnStorage() {
    try {
      localStorage.setItem(
        'carrito_cacahuate',
        JSON.stringify(this._carrito())
      );
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
    }
  }
}
