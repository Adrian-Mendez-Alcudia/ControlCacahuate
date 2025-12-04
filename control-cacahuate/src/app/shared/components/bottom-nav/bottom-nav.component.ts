import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss',
})
export class BottomNavComponent {
  navItems = [
    { path: '/pos', icon: '🏪', label: 'Vender' },
    { path: '/produccion', icon: '📦', label: 'Producir' },
    { path: '/clientes', icon: '👥', label: 'Deudas' },
    { path: '/dashboard', icon: '📊', label: 'Stats' },
    { path: '/configuracion', icon: '⚙️', label: 'Config' },
  ];
}
