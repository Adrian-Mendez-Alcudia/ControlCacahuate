import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface AppNotification {
  message: string;
  type: NotificationType;
  id: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  // Signal para la lista de notificaciones activas
  notifications = signal<AppNotification[]>([]);

  private counter = 0;

  show(message: string, type: NotificationType = 'info') {
    const id = this.counter++;
    const notification: AppNotification = { message, type, id };

    // Agregamos la notificación a la lista
    this.notifications.update((current) => [...current, notification]);

    // La quitamos automáticamente después de 3 segundos
    setTimeout(() => {
      this.remove(id);
    }, 3000);
  }

  success(message: string) {
    this.show(message, 'success');
  }
  info(message: string) {
    this.show(message, 'info');
  }

  error(message: string) {
    this.show(message, 'error');
  }

  remove(id: number) {
    this.notifications.update((current) => current.filter((n) => n.id !== id));
  }
}
