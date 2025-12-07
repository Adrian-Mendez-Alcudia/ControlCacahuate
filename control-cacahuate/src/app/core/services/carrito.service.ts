import { Injectable, computed, signal } from '@angular/core';
import { Sabor } from '../models/interfaces';

// Interfaz local para el item del carrito
export interface ItemCarrito {
  sabor: Sabor & { cantidad?: number }; // Extendemos para incluir stock visual si se requiere
  cantidad: number;
  precioVenta: number;
}

@Injectable({
  providedIn: 'root',
})
export class CarritoService {
  // Usamos Signals para un manejo de estado reactivo y moderno
  private _carrito = signal<ItemCarrito[]>([]);

  // Selectores computados (se actualizan solos cuando cambia el carrito)
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
    // Opcional: Recuperar de localStorage al iniciar
    const guardado = localStorage.getItem('carrito_cacahuate');
    if (guardado) {
      this._carrito.set(JSON.parse(guardado));
    }
  }

  agregarItem(sabor: Sabor, precioVenta: number, stockDisponible: number) {
    this._carrito.update((items) => {
      const itemExistente = items.find((i) => i.sabor.id === sabor.id);

      // Validar stock global antes de agregar
      const cantidadActual = itemExistente ? itemExistente.cantidad : 0;
      if (cantidadActual >= stockDisponible) {
        // Podríamos retornar false o lanzar evento, pero por ahora solo no agrega
        return items;
      }

      if (itemExistente) {
        // Si existe, aumentamos cantidad creando una nueva referencia del array
        return items.map((i) =>
          i.sabor.id === sabor.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      } else {
        // Si no, lo agregamos
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
        // Si es 1, lo eliminamos
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
    localStorage.setItem('carrito_cacahuate', JSON.stringify(this._carrito()));
  }
}
