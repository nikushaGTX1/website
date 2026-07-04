import { Component } from '@angular/core';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  isRegisterMode: boolean = true; 

  toggleMode(): void {
    this.isRegisterMode = !this.isRegisterMode;
  }

}
