import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfiguracionNegocio } from '../models/interfaces';

@Injectable({
  providedIn: 'root',
})
export class ConfiguracionService {
  private firestore = inject(Firestore);
  private configDoc = doc(this.firestore, 'configuracion/negocio');

  private configSubject = new BehaviorSubject<ConfiguracionNegocio | null>(
    null
  );
  public config$ = this.configSubject.asObservable();

  // Valores por defecto
  private readonly CONFIG_DEFAULT: Omit<
    ConfiguracionNegocio,
    'id' | 'updatedAt'
  > = {
    precioVentaDefault: 10,
    nombreNegocio: 'Control Cacahuate',
    moneda: 'MXN',
  };

  constructor() {
    this.cargarConfiguracion();
  }

  /**
   * Carga la configuración al iniciar
   */
  async cargarConfiguracion(): Promise<void> {
    try {
      const snapshot = await getDoc(this.configDoc);

      if (snapshot.exists()) {
        const config = {
          id: 'negocio',
          ...snapshot.data(),
        } as ConfiguracionNegocio;
        this.configSubject.next(config);
      } else {
        // Primera vez: crear configuración por defecto
        await this.crearConfiguracionInicial();
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      // Usar valores por defecto en memoria si hay error
      this.configSubject.next({
        id: 'negocio',
        ...this.CONFIG_DEFAULT,
        updatedAt: Timestamp.now(),
      });
    }
  }

  /**
   * Crea la configuración inicial
   */
  private async crearConfiguracionInicial(): Promise<void> {
    const config: ConfiguracionNegocio = {
      id: 'negocio',
      ...this.CONFIG_DEFAULT,
      updatedAt: Timestamp.now(),
    };

    await setDoc(this.configDoc, config);
    this.configSubject.next(config);
    console.log('⚙️ Configuración inicial creada');
  }

  /**
   * Obtiene el precio de venta actual
   */
  getPrecioVenta(): number {
    return (
      this.configSubject.value?.precioVentaDefault ??
      this.CONFIG_DEFAULT.precioVentaDefault
    );
  }

  /**
   * Obtiene el nombre del negocio
   */
  getNombreNegocio(): string {
    return (
      this.configSubject.value?.nombreNegocio ??
      this.CONFIG_DEFAULT.nombreNegocio
    );
  }

  /**
   * Actualiza el precio de venta
   */
  async actualizarPrecioVenta(nuevoPrecio: number): Promise<void> {
    if (nuevoPrecio <= 0) {
      throw new Error('El precio debe ser mayor a 0');
    }

    await updateDoc(this.configDoc, {
      precioVentaDefault: nuevoPrecio,
      updatedAt: Timestamp.now(),
    });

    const configActual = this.configSubject.value;
    if (configActual) {
      this.configSubject.next({
        ...configActual,
        precioVentaDefault: nuevoPrecio,
        updatedAt: Timestamp.now(),
      });
    }

    console.log(`💰 Precio actualizado: $${nuevoPrecio}`);
  }

  /**
   * Actualiza el nombre del negocio
   */
  async actualizarNombreNegocio(nuevoNombre: string): Promise<void> {
    if (!nuevoNombre.trim()) {
      throw new Error('El nombre no puede estar vacío');
    }

    await updateDoc(this.configDoc, {
      nombreNegocio: nuevoNombre.trim(),
      updatedAt: Timestamp.now(),
    });

    const configActual = this.configSubject.value;
    if (configActual) {
      this.configSubject.next({
        ...configActual,
        nombreNegocio: nuevoNombre.trim(),
        updatedAt: Timestamp.now(),
      });
    }

    console.log(`🏪 Nombre actualizado: ${nuevoNombre}`);
  }

  /**
   * Actualiza toda la configuración
   */
  async actualizarConfiguracion(
    datos: Partial<
      Pick<
        ConfiguracionNegocio,
        'precioVentaDefault' | 'nombreNegocio' | 'moneda'
      >
    >
  ): Promise<void> {
    const actualizacion: any = { updatedAt: Timestamp.now() };

    if (datos.precioVentaDefault !== undefined) {
      actualizacion.precioVentaDefault = datos.precioVentaDefault;
    }
    if (datos.nombreNegocio !== undefined) {
      actualizacion.nombreNegocio = datos.nombreNegocio.trim();
    }
    if (datos.moneda !== undefined) {
      actualizacion.moneda = datos.moneda;
    }

    await updateDoc(this.configDoc, actualizacion);

    const configActual = this.configSubject.value;
    if (configActual) {
      this.configSubject.next({
        ...configActual,
        ...actualizacion,
      });
    }

    console.log('⚙️ Configuración actualizada');
  }
}
