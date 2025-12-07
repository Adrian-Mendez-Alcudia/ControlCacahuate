import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { NotificationService } from '../services/notification.service';
import { FirebaseError } from '@angular/fire/app';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector, private zone: NgZone) {}

  handleError(error: any): void {
    // Usamos el injector para obtener el servicio perezosamente y evitar errores cíclicos
    const notificationService = this.injector.get(NotificationService);

    // Ejecutamos dentro de NgZone para asegurar que la UI se actualice
    this.zone.run(() => {
      console.error('Error Global Detectado:', error);

      let mensaje = 'Ocurrió un error inesperado';

      // Tratamos de entender qué pasó
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'permission-denied':
            mensaje = 'No tienes permisos para realizar esta acción.';
            break;
          case 'unavailable':
            mensaje = 'Sin conexión a internet o servidor no disponible.';
            break;
          default:
            mensaje = `Error de base de datos: ${error.message}`;
        }
      } else if (error.message) {
        mensaje = error.message;
      }

      // Mostramos el Toast rojo
      notificationService.error(mensaje);
    });
  }
}
